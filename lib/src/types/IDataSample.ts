export interface IDataSample {
  /** Epoch timestamp (milliseconds) */
  time: number;
  /** Name for the source of the data sample. */
  source: string;
  /** Name for the data field. */
  field: string;
  /** Numeric value for the data sample. */
  value: number;
}
