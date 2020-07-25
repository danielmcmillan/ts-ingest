# ts-ingest

## ingest server

Usage:

```ts
import { TSIngestServer } from "@danielmcmillan/ts-ingest";
import { PostgresqlDestination } from "@danielmcmillan/ts-ingest-destination-postgresql";

const destinations = [
  new PostgresqlDestination({
    table: "table_name",
    pg: { host: "localhost", user: "...", password: "...", database: "database_name" }
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
