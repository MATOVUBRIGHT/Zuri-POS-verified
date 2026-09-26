/**
 * User Service - Offline authentication
 * Validates against local SQLite. First login can optionally validate via API.
 */
import { getDb } from '../database/db'
import { randomUUID } from 'crypto'
import { createHash, pbkdf2Sync, randomBytes } from 'crypto'

const SALT_LEN = 16
const KEY_LEN = 64
const ITERATIONS = 100000
const DIGEST = 'sha512'

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(SALT_LEN).toString('hex')
  const hash = pbkdf2Sync(password, s, ITERATIONS, KEY_LEN, DIGEST).toString('hex')
  return { hash: `${s}:${hash}`, salt: s }
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const { hash: computed } = hashPassword(password, salt)
  return computed === stored
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface User {
  id: string
  username: string
  email?: string
  display_name?: string
  store_id?: string
  role?: string
}

export const userService = {
  create: (username: string, password: string, opts?: { email?: string; display_name?: string; store_id?: string; role?: string }): User => {
    const db = getDb()
    const id = randomUUID()
    const { hash } = hashPassword(password)
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO users (id, username, password_hash, email, display_name, store_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, username.toLowerCase().trim(), hash, opts?.email || null, opts?.display_name || username, opts?.store_id || null, opts?.role || 'staff', now, now)
    return userService.getById(id)!
  },

  validate: (username: string, password: string): User | null => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim()) as Record<string, unknown> | undefined
    if (!row || !verifyPassword(password, String(row.password_hash))) return null
    return {
      id: String(row.id),
      username: String(row.username),
      email: row.email ? String(row.email) : undefined,
      display_name: row.display_name ? String(row.display_name) : undefined,
      store_id: row.store_id ? String(row.store_id) : undefined,
      role: row.role ? String(row.role) : undefined
    }
  },

  getById: (id: string): User | null => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id),
      username: String(row.username),
      email: row.email ? String(row.email) : undefined,
      display_name: row.display_name ? String(row.display_name) : undefined,
      store_id: row.store_id ? String(row.store_id) : undefined,
      role: row.role ? String(row.role) : undefined
    }
  },

  createSession: (userId: string, expiresInMs = 7 * 24 * 60 * 60 * 1000): string => {
    const db = getDb()
    const id = randomUUID()
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInMs).toISOString()
    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
      id,
      userId,
      hashToken(token),
      expiresAt
    )
    return `${id}:${token}`
  },

  validateSession: (sessionToken: string): User | null => {
    const db = getDb()
    const [sessionId, token] = sessionToken.split(':')
    if (!sessionId || !token) return null
    const hashed = hashToken(token)
    const row = db
      .prepare('SELECT s.*, u.username, u.email, u.display_name, u.store_id, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.token = ? AND s.expires_at > ?')
      .get(sessionId, hashed, new Date().toISOString()) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.user_id),
      username: String(row.username),
      email: row.email ? String(row.email) : undefined,
      display_name: row.display_name ? String(row.display_name) : undefined,
      store_id: row.store_id ? String(row.store_id) : undefined,
      role: row.role ? String(row.role) : undefined
    }
  },

  destroySession: (sessionToken: string): void => {
    const [sessionId] = sessionToken.split(':')
    if (!sessionId) return
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  },

  destroyAllSessionsForUser: (userId: string): void => {
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  },

  listUsers: (storeId?: string): User[] => {
    const db = getDb()
    const rows = storeId
      ? db.prepare('SELECT id, username, email, display_name, store_id, role FROM users WHERE store_id = ? OR store_id IS NULL').all(storeId)
      : db.prepare('SELECT id, username, email, display_name, store_id, role FROM users').all()
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      username: String(r.username),
      email: r.email ? String(r.email) : undefined,
      display_name: r.display_name ? String(r.display_name) : undefined,
      store_id: r.store_id ? String(r.store_id) : undefined,
      role: r.role ? String(r.role) : undefined
    }))
  }
}
