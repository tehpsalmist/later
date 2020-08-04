const { CronTime } = require('cron')
const fetch = require('node-fetch')
const { Headers } = fetch
const moment = require('moment')
const momentTimezone = require('moment-timezone')

const { DEV } = process.env

const calculateNextTick = (time, timeZone) => {
  const cronTime = new CronTime(cronSafeTime(time, timeZone), timeZone)

  if (cronTime.realDate) {
    return moment(cronTime.source).valueOf() > moment(Date.now())
      ? cronTime.sendAt().valueOf()
      : null
  }

  return cronTime.sendAt().valueOf()
}

const getMemoryTime = () => moment().add(1, 'hours').add(10, 'minutes').valueOf()

const isTickWithinMemoryTime = ms => ms < getMemoryTime()

const makeRequest = async ({ jobId, url, method, headers, payload }) => {
  const fetchHeaders = new Headers(headers)
  fetchHeaders.append('job-id', jobId)

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: ['GET', 'DELETE'].indexOf(method) === -1 ? JSON.stringify(payload) : undefined
  })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (response instanceof Error) {
    return { ok: false, errorMessage: response.message, name: response.name }
  }

  const { status, headers: returnHeaders, ok } = response

  const body = returnHeaders.get('content-type') === 'application/json'
    ? await response.json()
    : await response.text()

  return {
    status,
    body,
    ok,
    headers: returnHeaders instanceof Headers
      ? [...returnHeaders.entries()].reduce((map, [key, value]) => ({ ...map, [key]: value }), {})
      : returnHeaders
  }
}

const isNonRecursiveURL = url => {
  const desiredOrigin = new URL(url).origin
  const serverOrigin = 'https://later-on.com'

  return desiredOrigin !== serverOrigin
}

const isValidJSON = value => {
  try {
    JSON.parse(JSON.stringify(value))
    return true
  } catch (e) {
    return false
  }
}

const isValidHeader = value => {
  try {
    const headers = new Headers(value)
    return !!headers
  } catch (e) {
    return false
  }
}

const isValidTimeZone = value => momentTimezone.tz.zone(value)

const isValidTime = value => {
  try {
    return !!cronSafeTime(value)
  } catch (e) {
    return false
  }
}

const cronSafeTime = (time, timeZone) => {
  try {
    return new CronTime(time, timeZone).source
  } catch (e) {
    return moment.tz(time, timeZone)
  }
}

const isCronSyntax = thing => {
  try {
    const parts = thing.split(' ').length

    return 5 <= parts && parts <= 6
  } catch (e) {
    return false
  }
}

/**
 * Hit cronitor for health monitoring
 * @param {'run' | 'complete' | 'fail'} type 
 */
const cronitorPing = type => !DEV && fetch(`https://cronitor.link/zaRIfx/${type}`)

module.exports = {
  cronSafeTime,
  isNonRecursiveURL,
  isValidHeader,
  isValidTime,
  isValidTimeZone,
  isValidJSON,
  makeRequest,
  calculateNextTick,
  getMemoryTime,
  isTickWithinMemoryTime,
  cronitorPing,
  isCronSyntax
}
