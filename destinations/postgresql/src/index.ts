import { IDestination, IDataSample } from "../../../lib/dist";
import pg from "pg";

export class PostgresqlDestination implements IDestination {
  constructor(public readonly options: {
    table: string;
    pg?: pg.ClientConfig;
  }) { }

  async storeSamples(samples: IDataSample[]): Promise<void> {
    const ingestTime = new Date().toISOString();
    const client = new pg.Client(this.options.pg);
    await client.connect();
    const rows = samples.flatMap(sample => {
      const sampleTime = new Date(sample.timestamp * 1000).toISOString();
      return Object.entries(sample.values).map(([field, value]) => [
        sampleTime,
        sample.source,
        field,
        value,
        ingestTime
      ]);
    });
    await client.query(
      `INSERT INTO ${this.options.table} (time, source, field, value, ingestTime)
        SELECT * FROM UNNEST ($1::TIMESTAMPTZ[], $2::TEXT[], $3::TEXT[], $4::DOUBLE PRECISION[], $5::TIMESTAMPTZ[])
        ON CONFLICT (time, source, field) DO UPDATE
          SET value = excluded.value, ingestTime = excluded.ingestTime;`,
      [
        rows.map(row => row[0]),
        rows.map(row => row[1]),
        rows.map(row => row[2]),
        rows.map(row => row[3]),
        rows.map(row => row[4]),
      ]
    );
    await client.end();
  }
}
