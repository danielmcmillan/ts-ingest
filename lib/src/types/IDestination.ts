import { IDataSample } from './IDataSample';

export interface IDestination {
  storeSamples(samples: IDataSample[]): Promise<void>;
}
