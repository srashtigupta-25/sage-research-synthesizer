import axios from 'axios'
import config from './config'
import { getToken } from './auth'

const client = axios.create({ baseURL: config.api.baseUrl })

// Attach JWT token to every request
client.interceptors.request.use((req) => {
  const token = getToken()
  if (token) req.headers.Authorization = token
  return req
})

// Submit a new research topic
export const submitReport = async (topic) => {
  const res = await client.post('/reports', { topic })
  return res.data
}

// Poll for report completion
export const getReport = async (reportId) => {
  const res = await client.get(`/reports/${reportId}`)
  return res.data
}

// Delete a report
export const deleteReport = async (reportId) => {
  const res = await client.delete(`/reports/${reportId}`)
  return res.data
}
