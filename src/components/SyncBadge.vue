<script setup>
import { sync } from '../sync.js'
defineEmits(['open'])
</script>

<template>
  <button class="badge" :title="sync.error || 'Sync settings'" @click="$emit('open')">
    <span class="led" :class="sync.enabled ? sync.status : 'off'"></span>
    <span>{{
      !sync.enabled ? 'Sync off'
      : sync.status === 'syncing' ? 'Syncing'
      : sync.status === 'pending' ? 'Saving soon'
      : sync.status === 'error' ? 'Sync error'
      : 'Synced'
    }}</span>
  </button>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center; gap: 9px;
  height: 38px; padding: 0 16px 0 14px;
  background: var(--shell); border: 1px solid var(--line); border-radius: 999px;
  color: var(--muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: border-color .2s var(--ease), color .2s var(--ease), background .2s var(--ease);
}
.badge:hover { border-color: var(--line-strong); color: var(--text); background: var(--surface); }
.led { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.led.ok { background: var(--blink); box-shadow: 0 0 0 3px var(--blink-soft); }
.led.syncing { background: var(--blink); animation: pulse 1s infinite alternate; }
.led.error { background: var(--bad); box-shadow: 0 0 0 3px rgba(240, 128, 143, .15); }
.led.pending { background: var(--accent); }
@keyframes pulse { to { opacity: .4 } }
</style>
