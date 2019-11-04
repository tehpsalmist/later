const { auth0 } = require('../config')

const refreshToken = (req, res) => {
  const refresh_token = req.body.refreshToken
  const client_secret = process.env.LATER_ON_AUTH0_CLIENT_SECRET

  if (!refresh_token) {
    return res.status(400).json({ message: 'missing refreshToken in POST body' })
  }

  auth0.refreshToken({ refresh_token, client_secret }, (error, authData) => {
    if (error || !authData) {
      return res.status(500).json({ error: error || 'unable to fetch token' })
    }

    res.status(200).json({ authData })
  })
}

module.exports = {
  refreshToken
}