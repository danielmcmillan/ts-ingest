export interface IDataSample {
  /** Epoch timestamp (seconds) */
  timestamp: number;
  /** Name for the source of the data sample. */
  source: string;
  /** Numeric value for each field in the data sample. */
  values: {
    [field: string]: number;
  }
}
