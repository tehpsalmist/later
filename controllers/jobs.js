const { validationResult } = require('express-validator/check')
const { CronJob } = require('cron')

const { Jobs } = require('../models')
const { createCronJob, softDeleteJob, hardDeleteJob, jobs } = require('../CronJobs')
const { calculateNextTick, isTickWithinMemoryTime, getMemoryTime } = require('../utilities')

exports.createJob = async (req, res) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }

  const {
    actionUrl,
    failureUrl,
    method = 'GET',
    headers,
    payload,
    time,
    timeZone
  } = req.body

  const nextTick = calculateNextTick(time, timeZone)

  if (!nextTick) {
    return res.status(422).json({ message: 'No future ticks to process for this job.' })
  }

  const job = Jobs({
    actionUrl,
    failureUrl,
    method,
    payload,
    headers,
    time,
    timeZone,
    nextTick
  })

  const saved = await job.save().catch(err => err instanceof Error ? err : new Error(err))

  if (saved instanceof Error) {
    res.status(500).json({ message: 'An error occurred while persisting the data. You might be missing parameters.' })
  }

  if (isTickWithinMemoryTime(nextTick)) {
    createCronJob({
      _id: saved._id,
      payload,
      actionUrl,
      failureUrl,
      method,
      headers,
      time,
      timeZone
    })
  }

  const { __v, nextTick: removed, ...returnJob } = saved._doc

  res.status(200).json({ job: returnJob })
}

exports.deleteJob = async (req, res) => {
  const { id } = req.params

  const deletion = await hardDeleteJob(id).catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (deletion instanceof Error) {
    console.error('deletion error:', deletion)
    return res.status(500).json({ message: deletion.message, stack: deletion.stack, name: deletion.name })
  }

  if (!deletion) {
    return res.status(404).json({ message: 'Job not found', success: false })
  }

  const { __v, nextTick: removed, ...returnJob } = deletion._doc

  return res.status(200).json({ job: returnJob })
}

exports.updateJob = async (req, res) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }

  const { id } = req.params

  const currentJob = await Jobs.findById(id, 'time timeZone').catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (currentJob instanceof Error || !currentJob) {
    return res.status(404).json({ message: 'job not found' })
  }

  // Sanitize the updates by extracting valid keys from the body
  const updates = ['actionUrl', 'failureUrl', 'method', 'headers', 'payload', 'time', 'timeZone']
    .filter(key => req.body[key] !== undefined)
    .reduce((map, key) => ({ ...map, [key]: req.body[key] }), {})

  if (updates.time || updates.timeZone) {
    updates.nextTick = calculateNextTick(updates.time || currentJob.time, updates.timeZone || currentJob.timeZone)
  }

  const updatedJob = await Jobs.findByIdAndUpdate(id, updates, { new: true })
    .catch(err => err instanceof Error ? err : new Error(err))

  if (updatedJob instanceof Error) {
    res.status(500).json({ message: 'An error occurred while persisting the data.' })
  }

  softDeleteJob(updatedJob._id)

  if (isTickWithinMemoryTime(updatedJob.nextTick)) {
    createCronJob(updatedJob)
  }

  const { __v, nextTick: removed, ...returnJob } = updatedJob._doc

  res.status(200).json({ job: returnJob })
}

exports.getJob = async (req, res) => {
  const { id } = req.params

  const getter = await Jobs.findById(id).catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (getter instanceof Error) {
    console.error(getter)
    return res.status(500).json({ message: getter.message, stack: getter.stack, name: getter.name })
  }

  const { nextTick, __v, ...job } = getter._doc

  res.status(200).json({ job })
}

exports.freshJobs = async () => {
  console.log(Object.keys(jobs).length)
  Jobs
    .find({
      nextTick: {
        $lte: getMemoryTime()
      }
    })
    .cursor()
    .on('data', job => {
      if (!(jobs[job._id] instanceof CronJob)) {
        const nextTick = calculateNextTick(job.time, job.timeZone)

        return nextTick ? createCronJob(job) : hardDeleteJob(job._id)
      }
    })
    .on('error', err => console.error('error refreshing jobs:', err))
    .on('end', () => console.log('Jobs refreshed!'))
}
