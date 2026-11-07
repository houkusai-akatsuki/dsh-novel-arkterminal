/**
 * dsh-novel-arkterminal / host utilities.
 * Zero-dependency helpers shared by the host half (routes, store, ai, importer).
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function sendJson(res, status, payload) {
  if (res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

export function sendOk(res, data, status = 200) {
  sendJson(res, status, { ok: true, data })
}

export function sendError(res, error) {
  const status = error && Number.isInteger(error.status) ? error.status : 500
  const code = (error && error.code) || 'internal'
  const message = (error && error.message) || String(error)
  if (status >= 500) console.error('[dsh-novel-arkterminal]', error)
  sendJson(res, status, { ok: false, error: { code, message } })
}

/** Read a request body with a hard byte cap. */
export async function readBody(req, limit = 2 * 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new ApiError('too_large', `请求体超过 ${limit} 字节上限`, 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function parseBody(text) {
  if (!text || !text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ApiError('invalid_payload', `JSON 解析失败：${error.message}`, 400)
  }
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

export function randomId(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex')
}

export function nowIso() {
  return new Date().toISOString()
}

export function stamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

/** DSH home: $DSH_HOME when the process was booted with one, else ~/.dsh. */
export function dshHome() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return configured !== '' ? configured : path.join(os.homedir(), '.dsh')
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

export async function readFileOr(file, fallback = null) {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

export async function readJson(file, fallback = null) {
  const text = await readFileOr(file, null)
  if (text === null) return fallback
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ApiError('invalid_json', `${path.basename(file)} 不是合法 JSON：${error.message}`, 422)
  }
}

export async function writeFileAtomic(file, text) {
  const dir = path.dirname(file)
  await ensureDir(dir)
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`)
  await fsp.writeFile(tmp, text, 'utf8')
  await fsp.rename(tmp, file)
}

export async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n')
}

export function within(root, target) {
  const r = path.resolve(root)
  const t = path.resolve(target)
  return t === r || t.startsWith(r + path.sep)
}

export function clampString(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function parseJsonl(text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      // Tolerate one malformed line; it is user-visible data, never fatal.
    }
  }
  return out
}
