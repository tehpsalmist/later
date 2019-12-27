const { CronJob } = require('cron')
const {
  makeRequest,
  calculateNextTick,
  isTickWithinMemoryTime,
  cronSafeTime,
  getMemoryTime,
  isCronSyntax
} = require('../utilities')
const { Jobs } = require('../models')
const { DEV } = process.env

const jobs = {}
const running = {}

let stopNow = false

if (DEV) {
  process.stdin.on('data', buffer => {
    const command = buffer.toString().trim()

    if (command === '.exit') {
      process.stdin.removeAllListeners('data')

      stopNow = true

      setInterval(() => {
        if (Object.keys(running).length === 0) {
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
    stopNow = true

    setInterval(async () => {
      if (Object.keys(running).length === 0) {
        await reply({ success: true })

        process.exit(0)
      }
    }, 1000)

    setTimeout(async () => {
      await reply({ success: false, outstandingJobs: running })

      process.exit(0)
    }, 75000)
  })
}

const createCronJob = async ({
  _id,
  time,
  timeZone,
  actionUrl,
  completedUrl,
  failureUrl,
  payload,
  method,
  headers,
  nextTick
}) => {
  if (jobs[_id] instanceof CronJob && jobs[_id].running) {
    jobs[_id].stop()
  }

  const jobIsLate = nextTick < Date.now()

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
      return
    }

    running[_id] = 1

    const startTime = Date.now()

    const { ok, ...response } = await makeRequest({ jobId: _id, url: actionUrl, method, headers, payload })

    const endTime = Date.now()

    // save to Logging DB?
    // console.log('response', JSON.stringify({ response, startTime, endTime }, null, 2))
    console.log('response', ok, endTime - startTime, _id)

    if (!ok && failureUrl) {
      // send to failure endpoint
      /* const failureResult = */
      await makeRequest({
        jobId: _id,
        url: failureUrl,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        payload: { startTime, endTime, response }
      })

      // save failureResult to Logging DB?
      // console.log('failure endpoint', JSON.stringify(failureResult, null, 2))
    }

    const nextNextTick = calculateNextTick(time, timeZone)

    if (!nextNextTick) {
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

      const updated = await Jobs.findByIdAndUpdate(_id, { nextTick: nextNextTick })
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
