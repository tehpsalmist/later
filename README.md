# Later

### A Cron as a Service DIY Project

## Setup

### System Prerequisites

  - A MongoDB instance available via [connection URL]()
  - NodeJS 8+
  - NPM 6+

### Environment Variables

  - DEV_LATER_CONNECTION_URL (a mongo connection URL sans protocol)
      - example: `root-user:f4ncypa55w0rd@ds123456.mlab.com:51234`
      - example: `localhost:27017`
  - PROD_CONNECTION_URL (alternative mongo url)
  - DEV (set to `true` while developing, toggles between dev and prod mongodb instances based on the above urls in your env)

### Installation and Execution

  - `git clone` (this repo, or your fork)
  - `cd later`
  - `npm i`
  - `npm start` (runs nodemon, alternatively, use pm2 for production)

## API

