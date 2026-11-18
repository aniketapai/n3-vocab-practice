// Progress, favorites and study times shared across all sets
import { reactive } from 'vue'
import { store } from './storage.js'

export const MASTER_AT = 3

export const progress = reactive(store.get('progress', {}))   // jp -> times known
export const favs = reactive(Object.fromEntries(store.get('favs', []).map(k => [k, true])))
// setId -> { parts: { "1-20": { sec, done } } }   (learning time per range)
export const times = reactive(store.get('times', {}))

export const known = w => progress[w.jp] || 0
export const isMastered = w => known(w) >= MASTER_AT
export const isFav = w => !!favs[w.jp]

export function markKnown(w) {
  progress[w.jp] = known(w) + 1
  store.set('progress', { ...progress })
}

export function toggleFav(w) {
  if (favs[w.jp]) delete favs[w.jp]
  else favs[w.jp] = true
  store.set('favs', Object.keys(favs))
}

export function resetProgressFor(words) {
  for (const w of words) delete progress[w.jp]
  store.set('progress', { ...progress })
}

/* ---------- learning time ---------- */
const saveTimes = () => store.set('times', JSON.parse(JSON.stringify(times)))

function part(setId, key) {
  if (!times[setId]) times[setId] = { parts: {} }
  if (!times[setId].parts[key]) times[setId].parts[key] = { sec: 0, done: false }
  return times[setId].parts[key]
}

export function addLearnTime(setId, key, sec) {
  if (!sec) return
  part(setId, key).sec += sec
  saveTimes()
}

export function markPartDone(setId, key) {
  const p = part(setId, key)
  if (!p.done) { p.done = true; saveTimes() }
}

export const partTime = (setId, key) => times[setId]?.parts[key]?.sec || 0
export const setLearnTotal = setId =>
  Object.values(times[setId]?.parts || {}).reduce((a, p) => a + p.sec, 0)

export function partsOf(setId) {
  return Object.entries(times[setId]?.parts || {})
    .map(([key, p]) => ({ key, from: +key.split('-')[0], to: +key.split('-')[1], ...p }))
    .sort((a, b) => a.from - b.from || a.to - b.to)
}

export function resetTimesFor(setId) {
  delete times[setId]
  saveTimes()
}

/* ---------- used by sync to swap in data from another device ---------- */
export function replaceAll(data) {
  const swap = (target, src) => {
    for (const k of Object.keys(target)) delete target[k]
    Object.assign(target, src)
  }
  swap(progress, data.progress || {})
  swap(favs, Object.fromEntries((data.favs || []).map(k => [k, true])))
  swap(times, JSON.parse(JSON.stringify(data.times || {})))
}

/* ---------- formatting ---------- */
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec))
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60
  const mm = h ? String(m).padStart(2, '0') : m
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
}
export function fmtShort(sec) {
  sec = Math.round(sec)
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
