const express = require('express')
const server = express()
const mongoose = require('mongoose')
const cors = require('cors')
const { CronJob } = require('cron')

const { getMongoURL } = require('./config')
const { jobsRouter } = require('./routes')
const { freshJobs } = require('./controllers')

const port = process.env.PORT || 2300
server.use(cors())
server.use(express.json())
server.use(express.urlencoded({ extended: true }))

server.use('/jobs', jobsRouter)

mongoose.connect(getMongoURL(), { useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true })
  .catch(err => console.error(new Date().toUTCString(), err))

const mainJob = new CronJob({
  cronTime: '0 * * * * *',
  onTick: freshJobs,
  runOnInit: true,
  timeZone: 'America/New_York'
})

mainJob.start()

server.listen(port, () => console.log('ready to rock'))
