const { MONGO_CRON_USER, MONGO_CRON_PW, MONGO_CRON_HOST_PORT, DEV, PROD_CONNECTION_URL } = process.env

module.exports = {
  getMongoURL: () => DEV
    ? `mongodb://${MONGO_CRON_USER}:${MONGO_CRON_PW}@${MONGO_CRON_HOST_PORT}/cron-jobs`
    : `mongodb://${PROD_CONNECTION_URL}/cron-jobs`
}
