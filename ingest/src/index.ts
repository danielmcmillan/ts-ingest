import express from "express";
import { IDestination, IDataSample } from "@danielmcmillan/ts-ingest-lib";

export class TSIngestServer {
  private app: express.Express;

  constructor(
    public readonly destinations: IDestination[],
    public readonly serverOptions: {
      port: number;
    }
  ) {
    this.app = express();
    this.app.use(express.json());
    this.app.post("/", (req, res) => {
      (async () => {
        if (!Array.isArray(req.body)) {
          console.error("POST /: 400", req.body);
          res.status(400).send();
        } else {
          const samples: IDataSample[] = req.body;
          try {
            console.log(
              `Storing ${samples.length} samples in ${destinations.length} destinations.`
            );
            await Promise.all(
              destinations.map((destination) =>
                destination.storeSamples(samples)
              )
            );
            res.status(204).send();
          } catch (err) {
            console.error(err);
            res.status(500).send();
          }
        }
      })();
    });
  }

  start() {
    this.app.listen(this.serverOptions.port, () =>
      console.log(`ts-ingest listening on port ${this.serverOptions.port}`)
    );
  }
}
