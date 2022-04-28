This directory includes notes and files for setting up a server to ingest data into a Postgres Timescale database and serve the data via Grafana.

# Postgres database setup

Installation:

- `sudo apt install gnupg software-properties-common -y`
- Follow Timescale installation instructions https://docs.timescale.com/timescaledb/latest/how-to-guides/install-timescaledb/self-hosted/ubuntu/installation-apt-ubuntu/#apt-installation-ubuntu

User, database and tables:

- Connect to the default database with `sudo -u postgres psql postgres`
- Create a new user `CREATE USER username WITH CREATEDB PASSWORD 'pwd';`
- Connect with new user `psql postgres -U username`
- Create new database `CREATE DATABASE tsingest`
- Connect to new database `psql tsingest -U username`

# Postgres ingest server

- Configure npm registry `npm config set registry https://npm.pkg.github.com/danielmcmillan`
- Install dependencies in a new directory `npm install @danielmcmillan/ts-ingest @danielmcmillan/ts-ingest-destination-postgresql`
- Copy server.js into that directory
- TODO: set up ts-ingest.service
- Set postgres timezone to UTC in `/etc/postgresql/13/main/postgresql.conf`

# Davis data import

- Install AWS CLI and configure credentials for SQS queue access
- Install globally `npm install -g @danielmcmillan/ts-ingest-agent-davis-import`

crontab:

```
*/2 * * * * AWS_REGION=ap-southeast-2 DAVIS_SQS_URL="https://sqs.ap-southeast-2.amazonaws.com/605337347611/davis-db" STORAGE_URL="http://localhost:3001/" SOURCE_NAME="davis_1" /home/daniel/.nvm/versions/node/v14.17.1/bin/node /home/daniel/.nvm/versions/node/v14.17.1/bin/davis-import >/dev/null
```

# telemetry.net.au data import

- Install globally: `npm install -g @danielmcmillan/ts-ingest-agent-telemetrynetau`

crontab:

```cron
*/3 * * * * TELEMETRY_API_KEY="o-F2RvGJ-gVD4AcB2CHD2Q" STORAGE_URL="http://localhost:3001/" SOURCE_NAME="frost_fan_1" SITE_ID="7041" /home/daniel/.nvm/versions/node/v14.17.1/bin/node /home/daniel/.nvm/versions/node/v14.17.1/bin/telemetry-agent >/dev/null
```

# Grafana

- https://grafana.com/docs/grafana/latest/installation/debian/
- configure public domain and smtp in `/etc/grafana/grafana.ini`

To be confirmed:

```sh
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Redirect port 80 to 3000 so grafana doesn't run as root
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
# Remove the redirect
# sudo iptables -t nat -D PREROUTING 1
# Not done yet
sudo apt-get install iptables-persistent
```

# Google actions

- follow certbot installation https://certbot.eff.org/lets-encrypt/ubuntufocal-other
- pre/post/deploy renewal hooks may be needed for removing port 80 redirect temporarily and copying keys
- TODO: deploy hook should restart server

note: certificates in /etc/letsencrypt/live/actions.danielmcm.com/. Hooks in /etc/letsencrypt/renewal-hooks/.
