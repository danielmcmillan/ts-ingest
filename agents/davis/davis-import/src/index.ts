#!/usr/bin/env node
import fetch from "node-fetch";
import { promises as fs } from "fs";
import { IDataSample } from "../../../lib/dist";

const options = {
  DAVIS_SQS_URL: process.env.DAVIS_SQS_URL,
  SOURCE_NAME: process.env.SOURCE_NAME,
};

async function main() {

}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
