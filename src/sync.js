/*
  Cloud sync via a private GitHub Gist.

  Each device stores a GitHub token (gist scope) in its own browser.
  All learning data (progress, favorites, per-set settings) is saved as one JSON file
  in a private gist named "n3-vocab-sync". Any device with a token for the same
  account finds that gist and pulls it.

  Rules:
  - First connect on a device: local and cloud are MERGED (highest progress per word,
    union of favorites), so nothing is lost.
  - After that: pulled on open/focus, pushed a couple of seconds after every change.
    If only one side changed since the last sync, that side wins; if both did, they are merged.
*/
import { reactive } from 'vue'
import { store, onSyncedChange, isSyncedKey } from './storage.js'
import { progress, favs, times, replaceAll } from './state.js'

const API = 'https://api.github.com'
const GIST_DESC = 'n3-vocab-sync'
const GIST_FILE = 'n3-vocab-progress.json'
const CFG_KEY = 'sync:config'      // { token, gistId, lastSyncedAt }  — never synced itself
const LOCAL_TS = 'sync:updatedAt'  // when local data last changed

export const sync = reactive({
  enabled: false,
  status: 'off',        // off | pending (changes waiting to upload) | syncing | ok | error
  error: '',
  errorKind: '',        // auth | rate | missing | other
  lastSyncedAt: 0,
  login: ''
})

const PUSH_EVERY = 20_000          // ms between uploads while you study
let cfg = store.get(CFG_KEY, null)
let pushTimer = null
let applying = false

const saveCfg = () => store.set(CFG_KEY, cfg)
const localUpdatedAt = () => store.get(LOCAL_TS, 0)

/* ---------- snapshot in / out ---------- */
export function snapshot() {
  const settings = {}
  for (const k of store.keys()) if (k.startsWith('settings:')) settings[k] = store.get(k, null)
  return {
    version: 1,
    updatedAt: localUpdatedAt() || Date.now(),
    progress: { ...progress },
    favs: Object.keys(favs),
    times: JSON.parse(JSON.stringify(times)),
    settings
  }
}

function applySnapshot(data) {
  applying = true
  try {
    replaceAll(data)
    store.set('progress', { ...progress }, { silent: true })
    store.set('favs', Object.keys(favs), { silent: true })
    store.set('times', JSON.parse(JSON.stringify(times)), { silent: true })
    for (const [k, v] of Object.entries(data.settings || {})) {
      if (isSyncedKey(k) && v) store.set(k, v, { silent: true })
    }
    // LOCAL_TS is left alone: after applying, local matches the cloud, so it isn't a local change
  } finally {
    applying = false
  }
}

function merge(a, b) {
  const prog = { ...a.progress }
  for (const [k, v] of Object.entries(b.progress || {})) prog[k] = Math.max(prog[k] || 0, v)

  // study time: per set + range, keep the larger time and "done" if either side finished it
  const tms = JSON.parse(JSON.stringify(a.times || {}))
  for (const [setId, t] of Object.entries(b.times || {})) {
    tms[setId] ||= { parts: {} }
    for (const [key, p] of Object.entries(t.parts || {})) {
      const mine = tms[setId].parts[key] || { sec: 0, done: false }
      tms[setId].parts[key] = { sec: Math.max(mine.sec || 0, p.sec || 0), done: !!(mine.done || p.done) }
    }
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    progress: prog,
    favs: [...new Set([...(a.favs || []), ...(b.favs || [])])],
    times: tms,
    settings: { ...(b.settings || {}), ...(a.settings || {}) }
  }
}

/* ---------- GitHub API ---------- */
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (res.ok) return res.status === 204 ? null : res.json()

  // work out *why* GitHub said no, so the message tells you what to do
  let msg = ''
  try { msg = (await res.json()).message || '' } catch {}
  const h = name => res.headers.get(name)
  const retryAfter = h('retry-after'), reset = h('x-ratelimit-reset')

  if (res.status === 429 || (res.status === 403 && (h('x-ratelimit-remaining') === '0' || retryAfter || /rate limit/i.test(msg)))) {
    const retryAt = retryAfter ? Date.now() + Number(retryAfter) * 1000
      : reset ? Number(reset) * 1000
      : Date.now() + 60_000
    throw new GhError(
      `GitHub is limiting requests for a moment. Your progress is saved here and will upload automatically at ${new Date(retryAt).toLocaleTimeString()}.`,
      { kind: 'rate', retryAt }
    )
  }
  if (res.status === 401) {
    throw new GhError('GitHub rejected the token (it may be expired or revoked). Disconnect, then connect with a new token.', { kind: 'auth' })
  }
  if (res.status === 403 || res.status === 404) {
    const scopes = h('x-oauth-scopes')          // only present for classic tokens
    if (scopes !== null && !scopes.split(/,\s*/).includes('gist')) {
      throw new GhError('This token doesn\'t have the "gist" scope. Create a new classic token with only "gist" ticked, then disconnect and connect with it.', { kind: 'auth' })
    }
    if (res.status === 404 && /^\/gists\/\w+/.test(path)) {
      throw new GhError('The sync gist was not found.', { kind: 'missing' })
    }
    throw new GhError(
      `GitHub refused access to gists (${res.status}${msg ? ': ' + msg : ''}). ` +
      'If this is a fine-grained token, edit it and set Account permissions → Gists → Read and write. ' +
      'Or use a classic token with only "gist" ticked.',
      { kind: 'auth' }
    )
  }
  throw new GhError(`GitHub error ${res.status}${msg ? ': ' + msg : ''}`, { kind: 'other' })
}

class GhError extends Error {
  constructor(message, { kind, retryAt } = {}) {
    super(message)
    this.kind = kind
    this.retryAt = retryAt
  }
}

let retryTimer = null

async function findGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`)
    const hit = list.find(g => g.description === GIST_DESC && g.files[GIST_FILE])
    if (hit) return hit.id
    if (list.length < 100) break
  }
  return null
}

async function readRemote() {
  const g = await gh(`/gists/${cfg.gistId}`)
  const f = g.files[GIST_FILE]
  if (!f) return null
  let text = f.content
  if (f.truncated) text = await (await fetch(f.raw_url)).text()
  return JSON.parse(text)
}

async function writeRemote(data) {
  // stamp with the upload time so other devices always see it as newer than their last sync
  data = { ...data, updatedAt: Date.now() }
  const body = JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(data, null, 1) } } })
  await gh(`/gists/${cfg.gistId}`, { method: 'PATCH', body })
}

async function createGist(data) {
  const g = await gh('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_DESC,
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(data, null, 1) } }
    })
  })
  return g.id
}

/* ---------- public ---------- */
async function run(fn) {
  sync.status = 'syncing'
  sync.error = ''
  sync.errorKind = ''
  const started = Date.now()   // changes made while this runs stay "unsynced" and go up next time
  try {
    await fn()
    if (!cfg) return
    cfg.lastSyncedAt = started
    saveCfg()
    sync.lastSyncedAt = Date.now()
    sync.status = pushTimer ? 'pending' : 'ok'
  } catch (e) {
    sync.status = 'error'
    sync.error = e.message || String(e)
    sync.errorKind = e.kind || 'other'
    // temporary GitHub limit: try again by itself once it lifts
    if (e.kind === 'rate' && cfg?.gistId) {
      clearTimeout(retryTimer)
      retryTimer = setTimeout(pull, Math.max(5_000, (e.retryAt || 0) - Date.now() + 2_000))
    }
  }
}

// only one sync talks to GitHub at a time; a request made meanwhile runs right after
let inFlight = null
let again = false
function exclusive(fn) {
  if (inFlight) { again = true; return inFlight }
  inFlight = (async () => {
    try { await fn() } finally {
      inFlight = null
      if (again) { again = false; exclusive(fn) }
    }
  })()
  return inFlight
}

export async function connect(token) {
  cfg = { token: token.trim(), gistId: null, lastSyncedAt: 0 }
  sync.enabled = true
  await run(async () => {
    const me = await gh('/user')
    sync.login = me.login
    cfg.login = me.login
    cfg.gistId = await findGist()
    const local = snapshot()
    if (cfg.gistId) {
      const remote = await readRemote()
      const merged = remote ? merge(local, remote) : local
      applySnapshot(merged)
      await writeRemote(merged)
    } else {
      cfg.gistId = await createGist(local)
    }
    saveCfg()
  })
  if (sync.status === 'error') { cfg = null; store.del(CFG_KEY); sync.enabled = false }
}

export function disconnect() {
  clearTimeout(pushTimer)
  clearTimeout(retryTimer)
  pushTimer = null
  cfg = null
  store.del(CFG_KEY)
  Object.assign(sync, { enabled: false, status: 'off', error: '', lastSyncedAt: 0, login: '' })
}

export function pull() {
  if (!cfg?.gistId) return Promise.resolve()
  return exclusive(() => run(reconcile))
}

async function reconcile() {
  let remote
  try {
    remote = await readRemote()
  } catch (e) {
    if (e.kind !== 'missing') throw e
    // the gist was deleted: look for another one, otherwise start a fresh one from this device
    cfg.gistId = await findGist()
    if (!cfg.gistId) cfg.gistId = await createGist(snapshot())
    saveCfg()
    remote = await readRemote()
  }
  {
    if (!remote) return writeRemote(snapshot())
    const base = cfg.lastSyncedAt || 0
    const localTs = localUpdatedAt()
    const remoteTs = remote.updatedAt || 0
    const localChanged = localTs > base
    const remoteChanged = remoteTs > base
    if (localChanged && remoteChanged) {
      // both devices changed since the last sync → merge so neither side loses progress
      const merged = merge(snapshot(), remote)
      applySnapshot(merged)
      await writeRemote(merged)
    } else if (remoteChanged) {
      applySnapshot(remote)
    } else if (localChanged) {
      await writeRemote(snapshot())
    }
  }
}

// pushing goes through pull(): it checks the cloud first, then uploads or merges
export async function push() {
  clearTimeout(pushTimer)
  pushTimer = null
  await pull()
}

export async function syncNow() {
  await pull()
}

export function initSync() {
  // any change to synced data → stamp it and schedule a push
  onSyncedChange(() => {
    if (applying) return
    store.set(LOCAL_TS, Date.now())
    if (!cfg?.gistId) return
    if (sync.status !== 'error') sync.status = 'pending'
    // throttle, not debounce: a push already scheduled is kept, so steady studying still
    // uploads regularly. 20s keeps fast practice well under GitHub's gist-edit limits
    // (~500/hour); leaving or hiding the tab uploads right away.
    if (!pushTimer) pushTimer = setTimeout(push, PUSH_EVERY)
  })

  // flush pending changes when the tab is hidden; pull fresh data when it comes back
  document.addEventListener('visibilitychange', () => {
    if (!cfg?.gistId) return
    if (document.visibilityState === 'hidden' && pushTimer) push()
    else if (document.visibilityState === 'visible') pull()
  })

  if (cfg?.token && cfg?.gistId) {
    sync.enabled = true
    sync.login = cfg.login || ''
    sync.lastSyncedAt = cfg.lastSyncedAt || 0
    pull()
  }
}

/* ---------- manual backup ---------- */
export function exportBackup() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `n3-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text())
  if (!data || typeof data.progress !== 'object') throw new Error('Not a valid backup file')
  const merged = merge(snapshot(), data)
  applySnapshot(merged)
  store.set(LOCAL_TS, Date.now())
  if (cfg?.gistId) await push()
}
