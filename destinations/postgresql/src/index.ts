import { IDestination, IDataSample } from "@danielmcmillan/ts-ingest-lib";
import pg from "pg";

export class PostgresqlDestination implements IDestination {
  constructor(
    public readonly options: {
      table: string;
      pg?: pg.ClientConfig;
    }
  ) {}

  async storeSamples(samples: IDataSample[]): Promise<void> {
    const ingestTime = Date.now() / 1000;
    const client = new pg.Client(this.options.pg);
    await client.connect();
    const rows = samples.map((sample) => [
      sample.time !== undefined && sample.time > 31536000000
        ? sample.time / 1000
        : ingestTime,
      sample.source,
      sample.field,
      sample.value,
      ingestTime,
    ]);
    await client.query(
      `INSERT INTO ${this.options.table} (time, source, field, value, ingest_time)
        SELECT to_timestamp(ts) AT TIME ZONE 'UTC', source, field, value, to_timestamp(ingest_ts) AT TIME ZONE 'UTC'
        FROM UNNEST ($1::DOUBLE PRECISION[], $2::TEXT[], $3::TEXT[], $4::DOUBLE PRECISION[], $5::DOUBLE PRECISION[])
        AS u(ts, source, field, value, ingest_ts)
        ON CONFLICT (time, source, field) DO UPDATE
          SET value = excluded.value, ingest_time = excluded.ingest_time;`,
      [
        rows.map((row) => row[0]),
        rows.map((row) => row[1]),
        rows.map((row) => row[2]),
        rows.map((row) => row[3]),
        rows.map((row) => row[4]),
      ]
    );
    await client.end();
  }
}
