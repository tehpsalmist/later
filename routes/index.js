const express = require('express')
const jobsRouter = express.Router()
const authRouter = express.Router()
const { body, query } = require('express-validator')

const { createJob, getJob, updateJob, deleteJob, getJobs, refreshToken } = require('../controllers')
const { isValidHeader, isValidTimeZone, isValidTime } = require('../utilities')

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

jobsRouter.get('/', [
  query('skip').isNumeric().optional(),
  query('page').isNumeric().optional(),
  query('limit').isNumeric().optional()
], getJobs)

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
], refreshToken)

module.exports = {
  jobsRouter,
  authRouter
}
