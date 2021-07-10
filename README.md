# ts-ingest

## ingest server

Usage:

```ts
import { TSIngestServer } from "@danielmcmillan/ts-ingest";
import { PostgresqlDestination } from "@danielmcmillan/ts-ingest-destination-postgresql";

const destinations = [
  new PostgresqlDestination({
    table: "table_name",
    pg: {
      host: "localhost",
      user: "...",
      password: "...",
      database: "database_name",
    },
  }),
];

const server = new TSIngestServer(destinations, { port: 3001 });
server.start();
```

## telemetry.net.au agent

Usage:

```sh
TELEMETRY_API_KEY="..." \
STORAGE_URL="http://localhost:3001/" \
SOURCE_NAME="..." \
SITE_ID="..." \
npx telemetry-agent
```

## davis-import agent

```sh
AWS_REGION=ap-southeast-2 DAVIS_SQS_URL="https://sqs.ap-southeast-2.amazonaws.com/605337347611/davis-db" STORAGE_URL="http://localhost:3001/" SOURCE_NAME="davis_1" /home/pi/.nvm/versions/node/v12.18.3/bin/node /home/pi/ingest/node_modules/.bin/davis-import
```
