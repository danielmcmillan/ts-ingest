#!/usr/bin/env node
import { SNS } from 'aws-sdk';
import { promises as fs } from "fs";
import pg from "pg";
import { Readable } from "stream";
import { createGzip } from "zlib";

const options = {
  AWS_REGION: process.env.REGION ?? process.env.AWS_REGION,
  DATA_TABLE: process.env.DATA_TABLE,
  SNS_TOPIC_ARN: process.env.SNS_TOPIC_ARN,
  START_TIME_FILE: ".ts-ingest-pg-notify-time",
  SAMPLES_PER_NOTIFICATION: 1500
};

function getDataFromRows(rows: any[]): Promise<Buffer> {
  const serialised = rows.map(row => JSON.stringify({
    time: row.time,
    source: row.source,
    field: row.field,
    value: row.value
  })).join("\n");
  const chunks: Buffer[] = [];
  const gzip = createGzip();
  Readable.from([serialised]).pipe(gzip);
  gzip.on("data", data => { chunks.push(data) });
  return new Promise(resolve => {
    gzip.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

async function* getDataForNotification(startTime: Date): AsyncGenerator<Buffer, Date, undefined> {
  const client = new pg.Client();
  await client.connect();

  let nextStartTime = startTime;
  let skip = 0;

  while (true) {
    const queryResult = await client.query(
      `SELECT time, source, field, value, ingesttime
        FROM ${options.DATA_TABLE}
        WHERE ingesttime > $1
        ORDER BY ingesttime ASC
        LIMIT $2 OFFSET $3;`,
      [startTime, options.SAMPLES_PER_NOTIFICATION, skip]
    );
    if (queryResult.rowCount > 0) {
      skip += queryResult.rowCount;
      const latestIngestTime = queryResult.rows[queryResult.rows.length - 1].ingesttime;
      yield getDataFromRows(queryResult.rows);
      if (latestIngestTime !== nextStartTime) {
        nextStartTime = latestIngestTime;
        saveStartTime(nextStartTime);
      }
    }
    if (queryResult.rowCount < options.SAMPLES_PER_NOTIFICATION) {
      // Didn't get full result so we must have everything
      break;
    }
  }

  await client.end();
  return nextStartTime;
}

async function getStartTime(): Promise<Date> {
  try {
    const file = await fs.readFile(options.START_TIME_FILE, { encoding: "utf8" });
    const date = new Date(file.trim());
    console.log("Sending notifications for data ingested after", date);
    return date;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error("No start time to use, not notifying about existing data.");
      return new Date();
    }
    throw err;
  }
}

async function saveStartTime(startTime: Date): Promise<void> {
  await fs.writeFile(options.START_TIME_FILE, startTime.toISOString(), { encoding: "utf8" });
}

async function main() {
  // Check options are defined
  Object.entries(options).forEach(([name, value]) => {
    if (!value) {
      throw new Error(`Option ${name} is not provided.`);
    }
  });
  const sns = new SNS({
    region: options.AWS_REGION,
  });

  const startTime = await getStartTime();
  const notificationDataGen = getDataForNotification(startTime);

  while (true) {
    const next = await notificationDataGen.next();
    if (next.done) {
      if (next.value !== startTime) {
        console.log("Notifications sent for data ingested up to", next.value);
      } else {
        console.log("No new data");
      }
      break;
    }
    const notificationData = next.value.toString("base64");
    await sns.publish({
      TopicArn: options.SNS_TOPIC_ARN,
      Message: notificationData
    }).promise();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
