const { DEV, DEV_LATER_CONNECTION_URL, PROD_CONNECTION_URL } = process.env

module.exports = {
  getMongoURL: () => DEV
    ? `mongodb://${DEV_LATER_CONNECTION_URL}/cron-jobs`
    : `mongodb://${PROD_CONNECTION_URL}/cron-jobs`
}
