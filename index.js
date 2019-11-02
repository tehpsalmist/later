const express = require('express')
const server = express()
const mongoose = require('mongoose')
const jwt = require('express-jwt')
const { expressJwtSecret } = require('jwks-rsa')
const cors = require('cors')
const { CronJob } = require('cron')

const { getMongoURL } = require('./config')
const { jobsRouter, authRouter } = require('./routes')
const { freshJobs } = require('./controllers')

const { DEV, PORT: port = 2300 } = process.env

server.use(cors())
server.use(express.json())
server.use(express.urlencoded({ extended: true }))

const checkJwt = jwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://later-on.auth0.com/.well-known/jwks.json`
  }),
  aud: 'https://later-on.com/api',
  iss: `https://later-on.auth0.com/`,
  algorithms: ['RS256']
})

server.use('/jobs', checkJwt, jobsRouter)

server.use('/auth', authRouter)

mongoose.connect(getMongoURL(), { useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true })
  .catch(err => console.error(new Date().toUTCString(), err))

const mainJob = new CronJob({
  cronTime: '0 * * * * *',
  onTick: freshJobs,
  runOnInit: true,
  timeZone: 'America/New_York'
})

mainJob.start()

server.listen(port, () => console.log('ready to rock'))
