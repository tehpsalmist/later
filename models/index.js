const { model, Schema } = require('mongoose')
const moment = require('moment')

const jobSchema = new Schema({
  actionUrl: String,
  completionUrl: String,
  failureUrl: String,
  nextTick: { type: Number, index: true },
  method: String,
  headers: {},
  payload: {},
  time: String,
  timeZone: String,
  userId: String
})

const Jobs = model('Jobs', jobSchema)

jobSchema.statics.getTodaysJobs = function (cb) {
  return Jobs.find({
    nextTick: {
      $lte: moment().endOf('day').add(1, 'hour')
    }
  }, cb)
}

module.exports = { Jobs }
