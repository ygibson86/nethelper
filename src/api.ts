import type { AppData } from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message = `HTTP ${status}`) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path: string, options: RequestInit = {}) {
  const headers = options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers })
  if (!response.ok) throw new ApiError(response.status)
  return response.json() as Promise<unknown>
}

export async function getSession() {
  return request('/api/session') as Promise<{ authenticated: boolean }>
}

export async function login(password: string) {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ password }) }) as Promise<{ authenticated: boolean }>
}

export async function logout() {
  return request('/api/logout', { method: 'POST' }) as Promise<{ authenticated: boolean }>
}

export async function getServerData() {
  return request('/api/data') as Promise<{ data: AppData; updatedAt: string; revision: number }>
}

export async function saveServerData(data: AppData, revision: number) {
  return request('/api/data', { method: 'PUT', headers: { 'If-Match': `"${revision}"` }, body: JSON.stringify(data) }) as Promise<{ data: AppData; updatedAt: string; revision: number }>
}
