#!/usr/bin/env node
import AWS from "aws-sdk";
import fetch from "node-fetch";
import { IDataSample } from "@danielmcmillan/ts-ingest-lib";

const options = {
  AWS_REGION: process.env.REGION ?? process.env.AWS_REGION,
  DAVIS_SQS_URL: process.env.DAVIS_SQS_URL,
  STORAGE_URL: process.env.STORAGE_URL,
  SOURCE_NAME: process.env.SOURCE_NAME,
};

interface LoopData {
  OUTSIDE_TEMP: number;
  WIND_SPEED_10MIN_AVG: number;
}

interface IDavisMessage {
  timestamp: number;
  loopData: LoopData;
  receiptHandle: string;
}

function parseMessageBody(body?: string): LoopData | undefined {
  const hexData = (body ?? "").match(/Hello number \d+:([a-fA-F0-9]{99})/)?.[1];
  return hexData ? parseLoopData(Buffer.from(hexData, "hex")) : undefined;
}

function parseLoopData(data: Buffer): LoopData {
  const convertTenthsOfFarenheit = (value: number) => (value / 10 - 32) * 5 / 9
  const convertTenthsOfMile = (value: number) => value * 0.160934;
  return {
    OUTSIDE_TEMP: convertTenthsOfFarenheit(data.readInt16LE(12)),
    WIND_SPEED_10MIN_AVG: convertTenthsOfMile(data.readUInt16LE(18)),
  };
}

async function recieveMessages(): Promise<IDavisMessage[]> {
  const sqs = new AWS.SQS({
    region: options.AWS_REGION,
  });
  const messages = await sqs.receiveMessage({
    QueueUrl: options.DAVIS_SQS_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20,
    AttributeNames: ["SentTimestamp"],
  }).promise();
  return (messages.Messages ?? []).map(message => {

    return {
      timestamp: parseInt(message.Attributes.SentTimestamp, 10),
      loopData: parseMessageBody(message.Body),
      receiptHandle: message.ReceiptHandle!,
    };
  });
}

async function main() {
  const messages = await recieveMessages();
  const samples: IDataSample[] = messages.flatMap(message => Object.entries(message.loopData).map(([field, value]) => ({
    time: message.timestamp,
    source: options.SOURCE_NAME,
    field,
    value,
  })));
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
  await Promise.all(messages.map(async (message) => {
    await new AWS.SQS({ region: options.AWS_REGION }).deleteMessage({
      QueueUrl: options.DAVIS_SQS_URL,
      ReceiptHandle: message.receiptHandle,
    }).promise();
  }));
  console.log(`Processed ${messages.length} messages`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
