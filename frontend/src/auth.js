import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails
} from 'amazon-cognito-identity-js'
import config from './config'

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId
})

// Sign in and return JWT token
export const signIn = (email, password) => {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool })
    const authDetails = new AuthenticationDetails({ Username: email, Password: password })

    user.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const token = result.getIdToken().getJwtToken()
        localStorage.setItem('sage_token', token)
        localStorage.setItem('sage_email', email)
        resolve(token)
      },
      onFailure: (err) => reject(err)
    })
  })
}

// Sign out
export const signOut = () => {
  const user = userPool.getCurrentUser()
  if (user) user.signOut()
  localStorage.removeItem('sage_token')
  localStorage.removeItem('sage_email')
}

// Get current token
export const getToken = () => localStorage.getItem('sage_token')

// Get current email
export const getEmail = () => localStorage.getItem('sage_email')

// Check if logged in
export const isAuthenticated = () => !!getToken()
