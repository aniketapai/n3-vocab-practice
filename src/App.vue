<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Home from './components/Home.vue'
import Study from './components/Study.vue'
import SyncPanel from './components/SyncPanel.vue'
import { sets } from './sets/index.js'

// tiny hash router:  #/  → home,  #/set/01 → study
const hash = ref(location.hash)
const onHash = () => { hash.value = location.hash; window.scrollTo(0, 0) }
onMounted(() => window.addEventListener('hashchange', onHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

const activeSet = computed(() => {
  const m = hash.value.match(/^#\/set\/(\d+)/)
  return m ? sets.find(s => s.num === parseInt(m[1])) || null : null
})

const open = set => { location.hash = `#/set/${set.id}` }
const goHome = () => { location.hash = '#/' }

const showSync = ref(false)
</script>

<template>
  <Study v-if="activeSet" :key="activeSet.id" :set="activeSet" @home="goHome" @sync="showSync = true" />
  <Home v-else :sets="sets" @open="open" @sync="showSync = true" />
  <SyncPanel v-if="showSync" @close="showSync = false" />
</template>
