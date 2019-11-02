const express = require('express')
const jobsRouter = express.Router()
const authRouter = express.Router()
const { body } = require('express-validator')

const { createJob, getJob, updateJob, deleteJob, getJobs } = require('../controllers')
const { isValidHeader, isValidTimeZone, isValidTime } = require('../utilities')
const { auth0 } = require('../config')

jobsRouter.post('/', [
  body('actionUrl').isURL(),
  body('failureUrl').isURL().optional(),
  body('method').isIn(['POST', 'GET', 'PUT', 'DELETE']),
  body('headers').custom(isValidHeader),
  body('payload').optional(),
  body('time').exists().custom(isValidTime),
  body('timeZone').custom(isValidTimeZone)
], createJob)

jobsRouter.get('/:id', getJob)

jobsRouter.get('/', getJobs)

jobsRouter.put('/:id', [
  body('actionUrl').isURL().optional(),
  body('failureUrl').isURL().optional(),
  body('method').isIn(['POST', 'GET', 'PUT', 'DELETE']).optional(),
  body('headers').custom(isValidHeader).optional(),
  body('payload').optional(),
  body('time').custom(isValidTime).optional(),
  body('timeZone').custom(isValidTimeZone).optional()
], updateJob)

jobsRouter.delete('/:id', deleteJob)

authRouter.post('/refresh-token', [
  body('refreshToken').exists().isString()
], (req, res) => {
  const refresh_token = req.body.refreshToken
  const client_secret = process.env.LATER_ON_AUTH0_CLIENT_SECRET
  console.log(client_secret)

  auth0.refreshToken({ refresh_token, client_secret }, (error, authData) => {
    if (error) {
      return res.status(500).json({ error })
    }

    res.status(200).json({ authData })
  })
})

module.exports = {
  jobsRouter,
  authRouter
}
