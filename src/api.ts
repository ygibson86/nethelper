import type { AppData } from './types'

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options })
  if (!response.ok) throw new Error(`${response.status}`)
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
  return request('/api/data') as Promise<{ data: AppData; updatedAt: string }>
}

export async function saveServerData(data: AppData) {
  return request('/api/data', { method: 'PUT', body: JSON.stringify(data) }) as Promise<{ data: AppData; updatedAt: string }>
}
