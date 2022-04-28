const { TSIngestServer } = require("@danielmcmillan/ts-ingest");
const { PostgresqlDestination } = require("@danielmcmillan/ts-ingest-destination-postgresql");

const destinations = [
  new PostgresqlDestination({
    table: "samples",
    pg: { host: "localhost", user: "daniel", password: "0101", database: "tsingest" }
  }),
];

const server = new TSIngestServer(destinations, { port: 3001 });
server.start();
