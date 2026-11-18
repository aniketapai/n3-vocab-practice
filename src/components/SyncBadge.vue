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
      : sync.status === 'error' ? 'Sync error'
      : 'Synced'
    }}</span>
  </button>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 12px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
  color: var(--muted); font-size: 12px; cursor: pointer;
  transition: border-color .2s var(--ease), color .2s var(--ease);
}
.badge:hover { border-color: var(--line-strong); color: var(--text); }
.led { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
.led.ok { background: var(--good); }
.led.syncing { background: var(--accent); animation: pulse 1s infinite alternate; }
.led.error { background: var(--bad); }
@keyframes pulse { to { opacity: .4 } }
</style>
