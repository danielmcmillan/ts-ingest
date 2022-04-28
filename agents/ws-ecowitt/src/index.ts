#!/usr/bin/env node
import express from "express";
import http from "http";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { IDataSample } from "@danielmcmillan/ts-ingest-lib";

const app = express();
const httpServer = http.createServer(app);

const options = {
  STORAGE_URL: process.env.STORAGE_URL!,
  SOURCE_SUFFIX: process.env.SOURCE_SUFFIX!,
};

app.use(bodyParser.urlencoded({ extended: false }));

function getSamples(event: Record<string, string | undefined>): IDataSample[] {
  const farenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
  const inchesOfMercuryToHpa = (inMerc: number) => inMerc * 33.86389;
  const milesToKm = (miles: number) => miles * 1.609344;
  const inchesToMm = (inches: number) => inches * 25.4;
  const fieldMapping = [
    {
      ecowittField: "tempinf",
      field: "insideTemperature",
      transform: farenheitToCelsius,
    },
    {
      ecowittField: "humidityin",
      field: "insideHumidity",
    },
    {
      ecowittField: "baromrelin",
      field: "barometerRel",
      transform: inchesOfMercuryToHpa,
    },
    {
      ecowittField: "baromabsin",
      field: "barometerAbs",
      transform: inchesOfMercuryToHpa,
    },
    {
      ecowittField: "tempf",
      field: "outsideTemperature",
      transform: farenheitToCelsius,
    },
    {
      ecowittField: "humidity",
      field: "outsideHumidity",
    },
    {
      ecowittField: "winddir",
      field: "windDirection",
    },
    {
      ecowittField: "windspeedmph",
      field: "windSpeed",
      transform: milesToKm,
    },
    {
      ecowittField: "windgustmph",
      field: "windGust",
      transform: milesToKm,
    },
    {
      ecowittField: "maxdailygust",
      field: "dayMaxWindGust",
      transform: milesToKm,
    },
    {
      ecowittField: "rainratein",
      field: "rainRate",
      transform: inchesToMm,
    },
    {
      ecowittField: "eventrainin",
      field: "eventRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "hourlyrainin",
      field: "hourRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "dailyrainin",
      field: "dayRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "weeklyrainin",
      field: "weekRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "monthlyrainin",
      field: "monthRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "yearlyrainin",
      field: "yearRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "totalrainin",
      field: "totalRain",
      transform: inchesToMm,
    },
    {
      ecowittField: "solarradiation",
      field: "solarRadiation",
    },
    {
      ecowittField: "uv",
      field: "uv",
    },
  ];
  return fieldMapping
    .map((mapping) => ({
      source: `ecowitt_${options.SOURCE_SUFFIX}`,
      field: mapping.field,
      value: (mapping.transform ?? ((x) => x))(
        Number(event[mapping.ecowittField])
      ),
      time: Date.now(),
    }))
    .filter((sample) => !Number.isNaN(sample.value));
}

app.post("/ecowitt", (req, res) => {
  const body = req.body;
  console.debug("ecowitt request", JSON.stringify(body, undefined, 2));

  fetch(options.STORAGE_URL, {
    method: "POST",
    body: JSON.stringify(getSamples(body)),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((result) => {
      if (!result.ok) {
        console.error(`Failed to store results: ${result.status}`);
        res.sendStatus(502);
      }
      res.end();
    })
    .catch((err) => {
      console.error("Failed to store results", err);
      res.sendStatus(500);
      res.end();
    });
});

httpServer.listen(3402, () => {
  console.log(`http listening on port 3402`);
});
