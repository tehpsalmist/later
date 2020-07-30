const { validationResult } = require('express-validator')
const { Failures } = require('../models')

const getFailures = async (req, res) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }

  const id = req.params.id
  const limit = Number(req.query.limit) > 100 ? 100 : Number(req.query.limit) || 20
  const page = Number(req.query.page) || 1
  const skipped = (Number(req.query.skip) || 0) + (limit * (page - 1))

  const [[countErr, totalFailures], [failuresErr, failures]] = await Promise.all([
    new Promise((resolve, reject) => Failures.countDocuments({ userId: req.user.sub, jobId: id }, (err, count) => {
      if (err) return resolve([err, count])

      return resolve([null, count])
    })),
    new Promise((resolve, reject) => Failures.find({ userId: req.user.sub, jobId: id }, (err, docs) => {
      if (err) return resolve([err, docs])

      return resolve([null, docs])
    }).sort('asc').skip(skipped).limit(limit))
  ])

  if (countErr) {
    console.error('Count Error:', countErr)
  }

  if (failuresErr) {
    console.error(failuresErr)

    return res.status(500).json({ error: 'Server error while fetching data' })
  }

  if (!failures || failures.length === 0) return res.status(200).json({
    failures: [],
    totalFailures: 0,
    failuresReturned: 0,
    limit,
    page,
    skipped,
    message: 'No failures match this criteria.'
  })

  return res.status(200).json({
    failures: failures.map(({ _doc: { __v, ...failure } }) => failure),
    totalFailures,
    failuresReturned: failures.length,
    limit,
    page,
    skipped
  })
}

module.exports = {
  getFailures
}
