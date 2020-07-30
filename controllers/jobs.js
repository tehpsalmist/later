const { validationResult } = require('express-validator')
const { CronJob } = require('cron')

const { Jobs } = require('../models')
const { createCronJob, softDeleteJob, hardDeleteJob, jobs } = require('../CronJobs')
const { calculateNextTick, isTickWithinMemoryTime, getMemoryTime, cronitorPing } = require('../utilities')

exports.createJob = async (req, res) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }

  const {
    actionUrl,
    failureUrl,
    failureLogging,
    method = 'GET',
    headers,
    payload,
    time,
    timeZone
  } = req.body

  const userId = req.user.sub

  const nextTick = calculateNextTick(time, timeZone)

  if (!nextTick) {
    return res.status(422).json({ message: 'No future ticks to process for this job.' })
  }

  const job = Jobs({
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
  })

  const saved = await job.save().catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (saved instanceof Error) {
    return res.status(500).json({ message: 'An error occurred while storing your job. You might be missing parameters.' })
  }

  if (isTickWithinMemoryTime(nextTick)) {
    createCronJob({
      _id: saved._id,
      payload,
      actionUrl,
      failureUrl,
      failureLogging,
      method,
      userId,
      headers,
      time,
      timeZone
    })
  }

  const { __v, ...returnJob } = saved._doc

  res.status(200).json({ job: returnJob, status: 'CREATED' })
}

exports.deleteJob = async (req, res) => {
  const { id } = req.params

  const deletion = await hardDeleteJob(id).catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (deletion instanceof Error) {
    console.error('deletion error:', deletion)
    return res.status(500).json({ message: deletion.message, stack: deletion.stack, name: deletion.name })
  }

  if (!deletion) {
    return res.status(404).json({ message: 'job not found', success: false })
  }

  const { __v, ...returnJob } = deletion._doc

  return res.status(200).json({ job: returnJob, status: 'DELETED' })
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
  const updates = ['actionUrl', 'failureUrl', 'failureLogging', 'method', 'headers', 'payload', 'time', 'timeZone']
    .filter(key => req.body[key] !== undefined)
    .reduce((map, key) => ({ ...map, [key]: req.body[key] }), {})

  if (updates.time || updates.timeZone) {
    updates.nextTick = calculateNextTick(updates.time || currentJob.time, updates.timeZone || currentJob.timeZone)
  }

  const updatedJob = await Jobs.findByIdAndUpdate(id, updates, { new: true })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (updatedJob instanceof Error) {
    res.status(500).json({ message: 'An error occurred while persisting the data.' })
  }

  softDeleteJob(updatedJob._id)

  if (isTickWithinMemoryTime(updatedJob.nextTick)) {
    createCronJob(updatedJob)
  }

  const { __v, ...returnJob } = updatedJob._doc

  res.status(200).json({ job: returnJob, status: 'UPDATED' })
}

exports.getJob = async (req, res) => {
  const { id } = req.params
  const userId = req.user.sub

  const getter = await Jobs.findOne({ _id: id, userId })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (getter instanceof Error) {
    console.error(getter)
    return res.status(500).json({ error: 'Server error while fetching data' })
  }

  if (!getter) {
    return res.status(404).json({ message: 'job not found' })
  }

  const { __v, ...job } = getter._doc

  res.status(200).json({ job })
}

exports.getJobs = async (req, res) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }

  const limit = Number(req.query.limit) > 100 ? 100 : Number(req.query.limit) || 20
  const page = Number(req.query.page) || 1
  const skipped = (Number(req.query.skip) || 0) + (limit * (page - 1))

  const [[countErr, totalJobs], [jobsErr, jobs]] = await Promise.all([
    new Promise((resolve, reject) => Jobs.countDocuments({ userId: req.user.sub }, (err, count) => {
      if (err) return resolve([err, count])

      return resolve([null, count])
    })),
    new Promise((resolve, reject) => Jobs.find({ userId: req.user.sub }, (err, docs) => {
      if (err) return resolve([err, docs])

      return resolve([null, docs])
    }).sort({ nextTick: 'asc' }).skip(skipped).limit(limit))
  ])

  if (countErr) {
    console.error('Count Error:', countErr)
  }

  if (jobsErr) {
    console.error(jobsErr)

    return res.status(500).json({ error: 'Server error while fetching data' })
  }

  if (!jobs || jobs.length === 0) return res.status(200).json({
    jobs: [],
    totalJobs: 0,
    jobsReturned: 0,
    limit,
    page,
    skipped,
    message: 'No jobs match this criteria.'
  })

  return res.status(200).json({
    jobs: jobs.map(({ _doc: { __v, ...job } }) => job),
    totalJobs,
    jobsReturned: jobs.length,
    limit,
    page,
    skipped
  })
}

exports.freshJobs = async () => {
  cronitorPing('run')
  Jobs
    .find({
      nextTick: {
        $lte: getMemoryTime()
      },
      failed: {
        $ne: true
      }
    })
    .cursor()
    .on('data', job => {
      if (!(jobs[job._id] instanceof CronJob)) {
        return createCronJob(job)
      }
    })
    .on('error', err => {
      cronitorPing('fail')
      console.error('error refreshing jobs:', err)
    })
    .on('end', () => {
      cronitorPing('complete')
      console.log(`${Object.keys(jobs).length} jobs in the queue.`)
    })
}
