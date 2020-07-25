import fetch from "node-fetch";
import { promises as fs } from "fs";
import { IDataSample } from "../../../lib/dist";

interface ISampleDataResponse {
  sampleCount: number;
  sampleDesc: {
    [fieldNumber: number]: {
      field: string;
      name: string;
      units: string;
    }
  };
  samples: Array<{
    time: string;
    [fieldNumber: number]: number;
  }>;
}

const options = {
  TELEMETRY_API_KEY: process.env.TELEMETRY_API_KEY,
  STORAGE_URL: process.env.STORAGE_URL,
  SOURCE_NAME: process.env.SOURCE_NAME,
  SITE_ID: process.env.SITE_ID,
  START_TIME_FILE: ".startTime.txt",
  REQUEST_PAGE_SIZE: 100,
  FIELDS: [
    "X2",
    "X13",
    "X20"
  ],
};

async function getSamplesFromResponse(json: ISampleDataResponse): Promise<IDataSample[]> {
  return json.samples.map(sample => ({
    timestamp: new Date(sample.time).getTime() / 1000,
    source: options.SOURCE_NAME,
    values: Object.fromEntries(
      Object.entries(json.sampleDesc).map(([fieldNum, fieldDesc]) => [
        fieldDesc.name,
        sample[fieldNum as unknown as number]
      ])
    )
  }));
}

async function* getSamples(startTime: string): AsyncGenerator<IDataSample[], void, string> {
  while (true) {
    console.log(`Requesting samples with startTime ${startTime}`);
    const result = await fetch(
      `https://www.telemetry.net.au/api/v1/sites/${options.SITE_ID}/samples?startTime=${startTime}&limit=${options.REQUEST_PAGE_SIZE}&order=Asc&fields=${options.FIELDS.join(",")}`,
      {
        headers: {
          "X-Api-Key": options.TELEMETRY_API_KEY
        }
      }
    );
    const json: ISampleDataResponse = await result.json();
    const newSamples = await getSamplesFromResponse(json);
    if (newSamples.length === 0) {
      break;
    }
    startTime = yield newSamples;
    if (newSamples.length < options.REQUEST_PAGE_SIZE) {
      break;
    }
  }
}

async function getStartTime(): Promise<string> {
  try {
    const file = await fs.readFile(options.START_TIME_FILE, { encoding: "utf8" });
    return file;
  } catch (err) {
    console.warn("No start time to use, getting all data.");
    return "2000-01-01T00:00:00Z";
  }
}

async function saveStartTime(startTime: string): Promise<void> {
  await fs.writeFile(options.START_TIME_FILE, startTime, { encoding: "utf8" });
}

async function main() {
  // Check options are defined
  Object.entries(options).forEach(([name, value]) => {
    if (!value) {
      throw new Error(`Option ${name} is not provided.`);
    }
  });

  const initialStartTime = await getStartTime();
  let startTime = initialStartTime;
  const samplesGen = getSamples(startTime);

  while (true) {
    const { value: samples } = await samplesGen.next(startTime);
    if (!samples) {
      break;
    }
    startTime = new Date(samples[samples.length - 1].timestamp * 1000).toISOString();

    const result = await fetch(options.STORAGE_URL, {
      method: "POST",
      body: JSON.stringify(samples),
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!result.ok) {
      throw new Error(`Failed to store results: ${result.status}`);
    }
    await saveStartTime(startTime);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
