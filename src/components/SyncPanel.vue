<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sync, connect, disconnect, syncNow, exportBackup, importBackup } from '../sync.js'

const emit = defineEmits(['close'])
const token = ref('')
const busy = ref(false)
const note = ref('')
const fileInput = ref(null)

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=n3-vocab%20sync'

const when = computed(() => {
  if (!sync.lastSyncedAt) return 'never'
  const s = Math.round((Date.now() - sync.lastSyncedAt) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(sync.lastSyncedAt).toLocaleString()
})

async function doConnect() {
  if (!token.value.trim()) return
  busy.value = true
  await connect(token.value)
  busy.value = false
  if (sync.status === 'ok') { token.value = ''; note.value = 'Connected. Your progress is now synced.' }
}
async function doSync() { busy.value = true; await syncNow(); busy.value = false }
function doDisconnect() {
  if (!confirm('Stop syncing on this device? Your progress stays here and in the cloud.')) return
  disconnect(); note.value = ''
}
async function onImport(e) {
  const f = e.target.files[0]; e.target.value = ''
  if (!f) return
  try { await importBackup(f); note.value = 'Backup merged into your progress.' }
  catch (err) { note.value = err.message }
}

const onKey = e => { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="panel" role="dialog" aria-label="Sync">
      <header>
        <h2>Sync</h2>
        <button class="x" @click="emit('close')" aria-label="Close">✕</button>
      </header>

      <!-- connected -->
      <template v-if="sync.enabled">
        <div class="state">
          <span class="led" :class="sync.status"></span>
          <div>
            <div class="state-t">
              {{ sync.status === 'syncing' ? 'Syncing…'
                : sync.status === 'pending' ? 'Changes will upload in a few seconds'
                : sync.status === 'error' ? (sync.errorKind === 'rate' ? 'Waiting for GitHub' : 'Sync problem')
                : 'Synced' }}
              <span v-if="sync.login" class="muted">· {{ sync.login }}</span>
            </div>
            <div class="muted small">Last synced {{ when }}</div>
          </div>
        </div>
        <p v-if="sync.error" class="err">{{ sync.error }}</p>
        <form v-if="sync.errorKind === 'auth'" class="row" @submit.prevent="doConnect">
          <input v-model="token" type="password" placeholder="Paste a new token (ghp_…)" autocomplete="off" spellcheck="false">
          <button class="btn" :disabled="busy || !token.trim()">{{ busy ? 'Connecting…' : 'Use token' }}</button>
        </form>
        <p v-if="sync.errorKind === 'auth'" class="muted small">
          <a :href="TOKEN_URL" target="_blank" rel="noopener" class="lnk">Create a classic token</a> with only <b>gist</b> ticked.
          Nothing on this device is lost, it's merged with the cloud copy when you reconnect.
        </p>
        <p class="muted small">
          Progress, favorites, learning times and range settings are saved to a private gist on your GitHub account.
          Open the site on another computer, connect with a token for the same account, and you'll continue where you left off.
        </p>
        <div class="row">
          <button class="btn" :disabled="busy" @click="doSync">Sync now</button>
          <button class="btn ghost" @click="doDisconnect">Disconnect</button>
        </div>
      </template>

      <!-- not connected -->
      <template v-else>
        <p class="muted">
          Keep your progress in step across computers. It's stored in a private GitHub gist on your account.
        </p>
        <ol class="steps">
          <li><a :href="TOKEN_URL" target="_blank" rel="noopener">Create a GitHub token</a> with only the <b>gist</b> scope.</li>
          <li>Paste it below. Do the same on each computer.</li>
        </ol>
        <form class="row" @submit.prevent="doConnect">
          <input v-model="token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
          <button class="btn" :disabled="busy || !token.trim()">{{ busy ? 'Connecting…' : 'Connect' }}</button>
        </form>
        <p v-if="sync.error" class="err">{{ sync.error }}</p>
        <p class="muted small">The token is kept only in this browser and is sent only to GitHub.</p>
      </template>

      <p v-if="note" class="note">{{ note }}</p>

      <div class="divider"></div>

      <div class="backup">
        <div>
          <div class="backup-t">Backup file</div>
          <div class="muted small">Download or restore your progress manually.</div>
        </div>
        <div class="row tight">
          <button class="link" @click="exportBackup">Export</button>
          <span class="sep">·</span>
          <button class="link" @click="fileInput.click()">Import</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onImport">
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background: rgba(5, 5, 7, .72);
  backdrop-filter: blur(6px);
  animation: fade .2s var(--ease);
}
.panel {
  width: 100%; max-width: 460px;
  display: flex; flex-direction: column; gap: 16px;
  padding: 26px;
  background: var(--surface);
  border: 8px solid var(--shell);
  border-radius: 34px;
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, .8);
  animation: rise .25s var(--ease);
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 { font-size: 24px; font-weight: 700; letter-spacing: -.03em; }
.x { background: var(--surface-2); border: 0; color: var(--muted); font-size: 13px; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; }
.x:hover { color: var(--text); background: var(--surface-3); }

.muted { color: var(--muted); font-size: 13.5px; }
.small { font-size: 12px; color: var(--faint); }
.err { color: var(--bad); font-size: 12.5px; }
.note { color: var(--accent); font-size: 12.5px; }

.state { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--surface-2); border-radius: 22px; }
.state-t { font-size: 15px; font-weight: 650; }
.led { width: 10px; height: 10px; border-radius: 50%; background: var(--faint); flex: none; }
.led.ok { background: var(--blink); box-shadow: 0 0 0 4px var(--blink-soft); }
.led.syncing { background: var(--blink); animation: pulse 1s infinite alternate; }
.led.error { background: var(--bad); }
.led.pending { background: var(--accent); }
.lnk { color: var(--text); text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }

.steps { padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: var(--muted); }
.steps a { color: var(--text); text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
.steps a:hover { text-decoration-color: var(--text); }
.steps b { color: var(--text); font-weight: 500; }

.row { display: flex; gap: 10px; align-items: center; }
.row.tight { gap: 8px; }
.row .btn { height: 44px; flex: none; padding: 0 20px; font-size: 13px; background: var(--accent); color: var(--accent-ink); }
.row .btn:hover { background: #d8cff9; }
.row .btn:disabled { background: var(--surface-2); color: var(--muted); }
.row .btn.ghost { background: var(--surface-2); color: var(--text); }
.row .btn.ghost:hover { background: var(--surface-3); }
.row input {
  flex: 1; min-width: 0; height: 44px; padding: 0 18px;
  background: var(--shell); border: 1px solid transparent; border-radius: 999px;
  color: var(--text); font: 13px ui-monospace, Consolas, monospace;
}
.row input:focus { outline: none; border-color: var(--accent); }

.divider { height: 1px; background: var(--line); }
.backup { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.backup-t { font-size: 13.5px; font-weight: 500; }
.sep { color: var(--line-strong); }

@keyframes fade { from { opacity: 0 } }
@keyframes rise { from { opacity: 0; transform: translateY(8px) } }
@keyframes pulse { to { opacity: .4 } }
</style>
