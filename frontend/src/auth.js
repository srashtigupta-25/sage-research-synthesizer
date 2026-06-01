import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute
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
        const userId = result.getIdToken().payload.sub
        localStorage.setItem('sage_token', token)
        localStorage.setItem('sage_email', email)
        localStorage.setItem('sage_user_id', userId)
        resolve(token)
      },
      onFailure: (err) => reject(err)
    })
  })
}

// Sign up new user
export const signUp = (email, password) => {
  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email })
    ]
    userPool.signUp(email, password, attributes, null, (err, result) => {
      if (err) {
        // If user exists but is unconfirmed, resend code automatically
        if (err.code === 'UsernameExistsException') {
          const user = new CognitoUser({ Username: email, Pool: userPool })
          user.resendConfirmationCode((resendErr, resendResult) => {
            if (resendErr) {
              // User is confirmed already - tell them to login
              reject(new Error('An account with this email already exists. Please sign in.'))
            } else {
              // Unconfirmed user - resent code successfully
              resolve({ userConfirmed: false, codeResent: true })
            }
          })
        } else {
          reject(err)
        }
      } else {
        resolve(result)
      }
    })
  })
}

// Verify email with confirmation code
export const confirmSignUp = (email, code) => {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool })
    user.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

// Resend verification code
export const resendCode = (email) => {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool })
    user.resendConfirmationCode((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

// Sign out
export const signOut = () => {
  const user = userPool.getCurrentUser()
  if (user) user.signOut()
  localStorage.removeItem('sage_token')
  localStorage.removeItem('sage_email')
  localStorage.removeItem('sage_user_id')
  localStorage.removeItem('sage_history')
}

// Get current token
export const getToken = () => localStorage.getItem('sage_token')

// Get current email
export const getEmail = () => localStorage.getItem('sage_email')

// Get current userId
export const getUserId = () => localStorage.getItem('sage_user_id')

// Check if logged in
export const isAuthenticated = () => !!getToken()
