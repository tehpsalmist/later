const { CronJob } = require('cron')
const { makeRequest, calculateNextTick, isTickWithinMemoryTime, cronSafeTime } = require('../utilities')
const { Jobs } = require('../models')

const jobs = {}

const createCronJob = async ({
  _id,
  time,
  timeZone,
  actionUrl,
  completedUrl,
  failureUrl,
  payload,
  method,
  headers
}) => {
  if (jobs[_id] instanceof CronJob && jobs[_id].running) {
    jobs[_id].stop()
  }

  const job = new CronJob({
    cronTime: cronSafeTime(time, timeZone),
    start: true,
    timeZone,
    onTick: async () => {
      const startTime = Date.now()

      const { ok, ...response } = await makeRequest({ jobId: _id, url: actionUrl, method, headers, payload })

      const endTime = Date.now()

      // save to Logging DB?
      // console.log('response', JSON.stringify({ response, startTime, endTime }, null, 2))
      console.log('response', ok, endTime - startTime)

      if (!ok && failureUrl) {
        // send to failure endpoint
        /* const failureResult = */
        await makeRequest({
          jobId: _id,
          url: failureUrl,
          method: 'POST',
          headers: {},
          payload: { startTime, endTime, response }
        })

        // save failureResult to Logging DB?
        // console.log('failure endpoint', JSON.stringify(failureResult, null, 2))
      }

      const nextTick = calculateNextTick(time, timeZone)

      if (!nextTick) {
        const deletion = await hardDeleteJob(_id)

        if (deletion instanceof Error) {
          console.error('deletion error:', deletion)
        } else if (!deletion) {
          // not sure why that would happen...
          console.warn('somehow no job to delete...')
        }
      } else {
        if (!isTickWithinMemoryTime(nextTick)) {
          softDeleteJob(_id)
        }

        Jobs.findByIdAndUpdate(_id, { nextTick })
      }
    }
  })

  jobs[_id] = job

  return job
}

const softDeleteJob = id => {
  if (jobs[id] instanceof CronJob) {
    jobs[id].stop()
  }

  delete jobs[id]
}

const hardDeleteJob = id => {
  softDeleteJob(id)

  return Jobs.findByIdAndDelete(id).catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))
}

module.exports = {
  jobs,
  createCronJob,
  softDeleteJob,
  hardDeleteJob
}
