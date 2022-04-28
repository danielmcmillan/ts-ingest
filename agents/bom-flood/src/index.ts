#!/usr/bin/env node
import * as ftp from "basic-ftp";
import fetch from "node-fetch";
import MemoryStream from "memorystream";
import cheerio from "cheerio";
import { IDataSample } from "@danielmcmillan/ts-ingest-lib";
import moment from "moment-timezone";

interface Observation {
  stationName: string;
  stationNumber: string;
  lat: string;
  lon: string;
  rainMm: string;
  durationValue: string;
  durationName: string;
  map: string;
}

const options = {
  STORAGE_URL: process.env.STORAGE_URL!,
  STATION_PATTERN: process.env.STATION_PATTERN!,
};

function PopupRain(
  stationName: string,
  stationNumber: string,
  lat: string,
  lon: string,
  rainMm: string,
  durationValue: string,
  durationName: string
) {
  return {
    stationName: stationName.trim(),
    stationNumber,
    lat,
    lon,
    rainMm,
    durationValue,
    durationName,
  };
}

const maps = [
  { name: "24Hours", id: "IDN65201.html" },
  { name: "9AM", id: "IDN65209.html" },
  //   { name: "1Hour", id: "IDN65217" },
];

async function getMap(
  client: ftp.Client,
  id: string
): Promise<{ modified: Date; data: string }> {
  const stream = new MemoryStream();
  let data = "";
  stream.on("data", (chunk) => (data += chunk.toString()));
  const streamPromise = new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const modified = await client.lastMod("/anon/gen/fwo/IDN65209.html");
  await client.downloadTo(stream, `/anon/gen/fwo/${id}`);
  await streamPromise;
  return {
    modified,
    data,
  };
}

function getNow() {
  return moment.tz("Australia/Sydney");
}

function getLast9Am(now: moment.Moment) {
  const nineAm = now.clone();
  if (nineAm.hour() < 9) {
    // It's before 9 am, so return 9 am the previous day
    nineAm.subtract(1, "day");
  }
  nineAm.hour(9);
  nineAm.minute(0);
  nineAm.second(0);
  nineAm.millisecond(0);
  return nineAm;
}

async function main() {
  const client = new ftp.Client();
  await client.access({ host: "ftp.bom.gov.au" });

  const now = getNow();
  const nineAm = getLast9Am(now);
  const timeSince9Am = now.diff(nineAm, "milliseconds");

  const observations: Observation[] = [];
  for (const { name, id } of maps.filter(
    ({ name }) => timeSince9Am > 2 * 60 * 60 * 1000 || name !== "24Hours" // Allow 2 hours for 24 hour map to update
  )) {
    const { modified, data } = await getMap(client, id);
    const $ = cheerio.load(data);
    observations.push(
      ...$(`map[name="${id}"] > area`)
        .get()
        .map((node) => {
          const onMouseOver = node.attribs.onmouseover;
          const match = onMouseOver.match(/javascript:(PopupRain\('.+'\))/);
          if (match) {
            return {
              map: name,
              modified,
              ...eval(match[1]),
            };
          }
        })
        .filter(Boolean)
    );
  }

  const samples: IDataSample[] = observations
    .filter((obs) =>
      obs.stationName.toUpperCase().includes(options.STATION_PATTERN)
    )
    .map((ob) => {
      let time: number;
      if (ob.map === "24Hours") {
        time = nineAm.clone().subtract(1, "second").valueOf();
      } else {
        const timeCovered = moment
          .duration(
            Number(ob.durationValue),
            ob.durationName as moment.unitOfTime.DurationConstructor
          )
          .asMilliseconds();
        // If the observation is for more time than it has been since 9am, it must still be from previous 24 hour period
        const startTime =
          timeCovered > timeSince9Am
            ? nineAm.clone().subtract(1, "day")
            : nineAm;
        time = startTime.valueOf() + timeCovered;
      }
      return {
        source: "bom",
        field: `rain_${ob.stationName}`,
        value: Number(ob.rainMm),
        time,
      };
    });
  if (true) {
    // Add 0 reading at 9am
    const fields = new Set<string>();
    samples.forEach((sample) => {
      fields.add(sample.field);
    });
    fields.forEach((field) => {
      samples.push({
        source: "bom",
        field,
        value: 0,
        time: nineAm.valueOf(),
      });
    });
  }

  const result = await fetch(options.STORAGE_URL, {
    method: "POST",
    body: JSON.stringify(samples),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!result.ok) {
    throw new Error(`Failed to store results: ${result.status}`);
  }
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
