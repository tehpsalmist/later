const { AuthenticationClient } = require('auth0')
const {
  DEV,
  DEV_LATER_CONNECTION_URL,
  PROD_CONNECTION_URL,
  LATER_ON_AUTH0_CLIENT_ID,
  LATER_ON_AUTH0_CLIENT_SECRET
} = process.env

module.exports = {
  getMongoURL: () => DEV
    ? `mongodb://${DEV_LATER_CONNECTION_URL}/cron-jobs`
    : `mongodb://${PROD_CONNECTION_URL}/cron-jobs`,
  auth0: new AuthenticationClient({
    domain: 'later-on.auth0.com',
    clientId: LATER_ON_AUTH0_CLIENT_ID,
    clientSecret: LATER_ON_AUTH0_CLIENT_SECRET
  })
}
