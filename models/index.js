const { model, Schema } = require('mongoose')
const moment = require('moment')

const jobSchema = new Schema({
  actionUrl: String,
  completionUrl: String,
  failureUrl: String,
  failureLogging: { type: Boolean, default: false },
  nextTick: { type: Number, index: true },
  method: String,
  headers: {},
  payload: {},
  time: String | Number,
  timeZone: String,
  userId: String,
  failed: { type: Boolean, default: false, index: true }
})

const Jobs = model('Jobs', jobSchema)

jobSchema.statics.getMemoryJobs = function (cb) {
  return Jobs.find({
    nextTick: {
      $lte: moment().endOf('day').add(1, 'hour')
    },
    failed: {
      $ne: true
    }
  }, cb)
}

const failureSchema = new Schema({
  jobId: String,
  userId: String,
  statusCode: Number,
  requestTime: Date,
  requestDuration: Number,
  job: jobSchema,
  response: {},
  errorMessage: {}
})

const Failures = model('Failures', failureSchema)

module.exports = { Jobs, Failures }
