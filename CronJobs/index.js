const { CronJob } = require('cron')
const {
  makeRequest,
  calculateNextTick,
  isTickWithinMemoryTime,
  cronSafeTime,
  isCronSyntax
} = require('../utilities')
const { Jobs, Failures } = require('../models')
const { DEV } = process.env

const jobs = {}
const running = {}

let stopNow = false
let deferred = 0

if (DEV) {
  process.stdin.on('data', buffer => {
    const command = buffer.toString().trim()

    if (command === '.exit') {
      process.stdin.removeAllListeners('data')

      stopNow = true

      const activeJobs = Object.keys(running).length

      setInterval(() => {
        if (Object.keys(running).length === 0) {
          console.log(JSON.stringify({
            success: true,
            message: `waited for ${activeJobs} active jobs to resolve and deferred ${deferred} jobs`
          }, null, 2))

          process.exit(0)
        }
      }, 1000)

      setTimeout(() => {
        console.log(JSON.stringify({ success: false, outstandingJobs: running }, null, 2))

        process.exit(0)
      }, 75000)
    }
  })
} else {
  const pmx = require('@pm2/io')

  pmx.action('shutdown', reply => {
    const activeJobs = Object.keys(running).length

    stopNow = true

    setInterval(async () => {
      if (Object.keys(running).length === 0) {
        await reply({
          success: true,
          message: `waited for ${activeJobs} active jobs to resolve and deferred ${deferred} jobs`
        })

        process.exit(0)
      }
    }, 1000)

    setTimeout(async () => {
      await reply({ success: false, outstandingJobs: running })

      process.exit(0)
    }, 75000)
  })

  pmx.action('status', reply => {
    reply({ jobsEnqueued: Object.keys(jobs).length, running: Object.keys(running).length })
  })
}

const createCronJob = async ({
  _id,
  userId,
  time,
  timeZone,
  actionUrl,
  completedUrl,
  failureUrl,
  failureLogging,
  payload,
  method,
  headers,
  nextTick
}) => {
  if (jobs[_id] instanceof CronJob && jobs[_id].running) {
    jobs[_id].stop()
  }

  const jobIsLate = nextTick < Date.now() && !running[_id]

  if (jobIsLate && !isCronSyntax(time)) {
    return onTick()
  }

  if (jobIsLate) {
    onTick()
  }

  const job = new CronJob({
    cronTime: cronSafeTime(time, timeZone),
    start: true,
    timeZone,
    onTick: onTick
  })

  async function onTick () {
    if (stopNow) {
      deferred++

      return
    }

    running[_id] = 1

    const startTime = Date.now()

    const { ok, ...response } = await makeRequest({ jobId: _id, url: actionUrl, method, headers, payload })

    const endTime = Date.now()

    if (!ok) {
      const sentFailure = failureUrl && await makeRequest({
        jobId: _id,
        url: failureUrl,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        payload: { startTime, endTime, response }
      })

      if (failureLogging) {
        const failureEntry = Failures({
          jobId: _id,
          userId,
          statusCode: response.status,
          requestTime: new Date().toISOString(),
          requestDuration: endTime - startTime,
          response: response.errorMessage ? response.name : response,
          errorMessage: response.errorMessage,
          job: {
            actionUrl,
            failureUrl,
            failureLogging,
            method,
            payload,
            headers,
            time,
            timeZone,
            nextTick,
            userId
          }
        })

        const savedFailure = await failureEntry.save()
          .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

        if (savedFailure instanceof Error) {
          console.error('couldn\'t save failure:', savedFailure)
        }
      }
      // console.log('failure endpoint', JSON.stringify(failureResult, null, 2))
    }

    const nextNextTick = calculateNextTick(time, timeZone)

    if (!nextNextTick && ok) {
      const deletion = await hardDeleteJob(_id)

      if (deletion instanceof Error) {
        console.error('deletion error:', deletion)
      } else if (!deletion) {
        // not sure why that would happen...
        console.warn('somehow no job to delete...')
      }
    } else {
      if (!isTickWithinMemoryTime(nextNextTick)) {
        softDeleteJob(_id)
      }

      const updated = await Jobs.findByIdAndUpdate(_id, ok || isCronSyntax(time) ? { nextTick: nextNextTick } : { failed: true })
        .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

      if (updated instanceof Error) {
        console.error(`Error while updating nexttick for ${_id}:`, updated)
      }
    }

    delete running[_id]
  }

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
