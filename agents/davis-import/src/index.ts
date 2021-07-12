#!/usr/bin/env node
import AWS from "aws-sdk";
import fetch from "node-fetch";
import { IDataSample } from "@danielmcmillan/ts-ingest-lib";
import * as davisLib from "@danielmcmillan/davis-weather-lib";

const options = {
  AWS_REGION: process.env.REGION ?? process.env.AWS_REGION,
  DAVIS_SQS_URL: process.env.DAVIS_SQS_URL!,
  STORAGE_URL: process.env.STORAGE_URL!,
  SOURCE_NAME: process.env.SOURCE_NAME!,
};

interface IMessagePacket {
  packet: davisLib.Packet;
  receiptHandle: string;
}

// Receive messages from SQS queue and return list of individual sample packets
async function recieveMessages(): Promise<IMessagePacket[]> {
  const sqs = new AWS.SQS({
    region: options.AWS_REGION,
  });
  const messages = await sqs
    .receiveMessage({
      QueueUrl: options.DAVIS_SQS_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      AttributeNames: ["SentTimestamp"],
    })
    .promise();
  return (messages.Messages ?? []).flatMap((message) => {
    if (message.Body === undefined || message.Attributes === undefined) {
      console.error("SQS message missing body or attributes", message);
      return [];
    }
    try {
      return davisLib
        .extractPackets(message.Body, {
          sentTimestamp: parseInt(message.Attributes.SentTimestamp, 10),
        })
        .map((packet) => ({
          packet,
          receiptHandle: message.ReceiptHandle!,
        }));
    } catch (err) {
      if (err instanceof davisLib.UnrecognisedMessageFormatError) {
        console.error("Message data is invalid", message);
        return [];
      }
      throw err;
    }
  });
}

async function main() {
  const failedMessages = new Set<string>();
  const messages = await recieveMessages();
  const samples: IDataSample[] = messages.flatMap((message) => {
    if (!davisLib.validateCRC(message.packet.data)) {
      console.warn("Packet failed CRC check");
      failedMessages.add(message.receiptHandle);
      return [];
    }
    const fields = {
      ...davisLib.parsePacket(message.packet.data, davisLib.loop2Definition),
      ...(message.packet.statusData
        ? davisLib.parsePacket(
            message.packet.statusData,
            davisLib.davisStatusDefinition
          )
        : { usbVoltage: null, batteryVoltage: null }),
    };
    const fieldNames: Array<
      keyof (davisLib.Loop2Parsed & davisLib.DavisStatusParsed)
    > = [
      "insideTemperature",
      "insideHumidity",
      "outsideTemperature",
      "outsideHumidity",
      "barometer",
      "barTrend",
      "rainRate",
      "windSpeed",
      "windDirection",
      "avgWindSpeed10Min",
      "avgWindSpeed2Min",
      "windGust10Min",
      "windDirection10MinGust",
      "dayRain",
      "last24HourRain",
      "lastHourRain",
      "last15MinuteRain",
      "stormRain",
      "stormStartDate",
      // "dayET",
      // "dewPoint",
      // "heatIndex",
      // "windChill",
      // "thswIndex",
      // "uv",
      // "solarRadiation",
      "usbVoltage",
      "batteryVoltage",
    ];
    return fieldNames.map((field) => ({
      time: message.packet.timestamp,
      source: options.SOURCE_NAME,
      field,
      value: fields[field] ?? null,
    }));
  });

  const result = await fetch(options.STORAGE_URL, {
    method: "POST",
    body: JSON.stringify(samples),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!result.ok) {
    throw new Error(`Failed to store results: ${result.status}.`);
  }
  await Promise.all(
    messages.map(async (message) => {
      if (!failedMessages.has(message.receiptHandle)) {
        await new AWS.SQS({ region: options.AWS_REGION })
          .deleteMessage({
            QueueUrl: options.DAVIS_SQS_URL,
            ReceiptHandle: message.receiptHandle,
          })
          .promise();
      }
    })
  );
  console.log(`Processed ${messages.length} packets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
