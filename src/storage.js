// localStorage wrapper. Writes to "synced" keys notify listeners (used by cloud sync).
const listeners = new Set()
export const onSyncedChange = fn => { listeners.add(fn); return () => listeners.delete(fn) }

export const isSyncedKey = k => k === 'progress' || k === 'favs' || k === 'times' || k.startsWith('settings:')

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v, { silent = false } = {}) {
    const json = JSON.stringify(v)
    try {
      if (localStorage.getItem(k) === json) return   // unchanged → not a real change
      localStorage.setItem(k, json)
    } catch {}
    if (!silent && isSyncedKey(k)) listeners.forEach(fn => fn(k))
  },
  del(k) { try { localStorage.removeItem(k) } catch {} },
  keys() { try { return Object.keys(localStorage) } catch { return [] } }
}
