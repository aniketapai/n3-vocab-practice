<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import FlashCard from './FlashCard.vue'
import SyncBadge from './SyncBadge.vue'
import { store } from '../storage.js'
import {
  MASTER_AT, favs, known, isMastered, markKnown, setKnown, toggleFav as toggleFavWord, resetProgressFor,
  addLearnTime, markPartDone, partTime, setLearnTotal, partsOf, resetTimesFor, fmtClock, fmtShort
} from '../state.js'

const props = defineProps({ set: { type: Object, required: true } })
const emit = defineEmits(['home', 'sync'])

const modes = [{ v: 'learn', label: 'Learn' }, { v: 'practice', label: 'Practice' }]
const dirs = [{ v: 'je', label: '日 → EN' }, { v: 'ej', label: 'EN → 日' }]

// settings are remembered per set (set 01 also picks up settings saved before sets existed)
const SETTINGS_KEY = `settings:${props.set.id}`
const saved = store.get(SETTINGS_KEY, null) || (props.set.num === 1 ? store.get('settings', {}) : {})
const total = props.set.words.length
const s = reactive({
  list: saved.list || 'all',          // 'all' | 'fav'
  mode: saved.mode || 'learn',
  dir: saved.dir || 'je',
  from: saved.from || 1,
  to: saved.to || Math.min(20, total),
  favFrom: saved.favFrom || 1,
  favTo: saved.favTo || 9999,
  shuffle: !!saved.shuffle,
  timer: saved.timer || 0             // practice countdown in minutes (0 = off)
})
const TIMER_OPTS = [0, 2, 5, 10, 15]
const saveSettings = () => store.set(SETTINGS_KEY, { ...s })

const queue = ref([])
const i = ref(0)
const flipped = ref(false)
const sessionDone = ref(0)
const sessionSize = ref(0)
const toast = ref('')
let toastTimer = null

// Favorites are practice-only
const mode = computed(() => s.list === 'fav' ? 'practice' : s.mode)

// every word keeps its number within the set
const numbered = props.set.words.map((w, k) => ({ ...w, n: k + 1 }))
const favWords = computed(() => numbered.filter(w => favs[w.jp]))
const source = computed(() => s.list === 'fav' ? favWords.value : numbered)
const favCount = computed(() => favWords.value.length)

const rangeFrom = computed({
  get: () => s.list === 'fav' ? s.favFrom : s.from,
  set: v => { s.list === 'fav' ? (s.favFrom = v) : (s.from = v) }
})
const rangeTo = computed({
  get: () => s.list === 'fav' ? s.favTo : s.to,
  set: v => { s.list === 'fav' ? (s.favTo = v) : (s.to = v) }
})

const current = computed(() => queue.value[i.value] || null)
const rangeWords = computed(() => source.value.slice(rangeFrom.value - 1, rangeTo.value))
const masteredInRange = computed(() => rangeWords.value.filter(isMastered).length)
const masteredInSet = computed(() => numbered.filter(isMastered).length)
const allMastered = computed(() => rangeWords.value.length > 0 && masteredInRange.value === rangeWords.value.length)

const posText = computed(() => {
  if (!queue.value.length) return ''
  return mode.value === 'learn' ? `${i.value + 1} of ${queue.value.length}` : `${queue.value.length} remaining`
})
const barPct = computed(() => {
  if (mode.value === 'learn') return queue.value.length ? (i.value + 1) / queue.value.length * 100 : 0
  return sessionSize.value ? sessionDone.value / sessionSize.value * 100 : 100
})

function clampRange() {
  const n = Math.max(1, source.value.length)
  let a = Math.max(1, Math.min(n, parseInt(rangeFrom.value) || 1))
  let b = Math.max(1, Math.min(n, parseInt(rangeTo.value) || n))
  if (a > b) [a, b] = [b, a]
  rangeFrom.value = a
  rangeTo.value = b
}

function shuffleArr(a) {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]]
  }
  return a
}

/* ---------- timers ----------
   Learn: a stopwatch per range ("part"), saved + synced. It pauses when the tab is hidden
   or after 2 minutes without any key press / click, so idle time isn't counted.
   The whole-set learning time is the sum of all its parts.
   Practice: an optional countdown (speed round) that starts on the first reveal.     */
const IDLE_LIMIT = 120
let lastActivity = Date.now()
let ticker = null
let pending = 0                       // learn seconds not yet saved
const learnPending = ref(0)
const learnKey = ref(null)            // "from-to" the stopwatch is timing
const learnIdle = ref(false)

const pt = reactive({ started: false, running: false, over: false, elapsed: 0, answered: 0, correct: 0 })

const partSec = computed(() => learnKey.value ? partTime(props.set.id, learnKey.value) + learnPending.value : 0)
const partDone = computed(() => !!learnKey.value && !!partsOf(props.set.id).find(p => p.key === learnKey.value)?.done)
const setSec = computed(() => setLearnTotal(props.set.id) + learnPending.value)
const parts = computed(() => partsOf(props.set.id))
const remaining = computed(() => Math.max(0, s.timer * 60 - pt.elapsed))
const pace = computed(() => pt.answered ? (pt.elapsed / pt.answered).toFixed(1) : '0')

function flushLearn() {
  if (learnKey.value && pending) addLearnTime(props.set.id, learnKey.value, pending)
  pending = 0
  learnPending.value = 0
}

function poke() {
  lastActivity = Date.now()
  learnIdle.value = false
}

function tick() {
  const visible = document.visibilityState === 'visible'
  if (mode.value === 'learn' && current.value && learnKey.value) {
    learnIdle.value = Date.now() - lastActivity > IDLE_LIMIT * 1000
    if (visible && !learnIdle.value) {
      pending++
      learnPending.value = pending
      if (pending >= 15) flushLearn()
    }
  }
  if (mode.value === 'practice' && pt.running && visible) {
    pt.elapsed++
    if (s.timer && pt.elapsed >= s.timer * 60) timeUp()
  }
}

function timeUp() {
  pt.running = false
  pt.over = true
  flipped.value = false
}

function togglePause() {
  if (!pt.started || pt.over || !current.value) return
  pt.running = !pt.running
}

function setTimer(m) { if (s.timer !== m) { s.timer = m; build() } }

// reaching the last card of a range counts as finishing that part
watch([i, () => queue.value.length], () => {
  if (mode.value === 'learn' && learnKey.value && queue.value.length && i.value === queue.value.length - 1) {
    markPartDone(props.set.id, learnKey.value)
  }
})

function resetTimes() {
  if (!confirm(`Reset learning times for Set ${props.set.id}?`)) return
  pending = 0
  learnPending.value = 0
  resetTimesFor(props.set.id)
}

function build() {
  flushLearn()
  clampRange()
  learnKey.value = mode.value === 'learn' ? `${s.from}-${s.to}` : null
  Object.assign(pt, { started: false, running: false, over: false, elapsed: 0, answered: 0, correct: 0 })
  let items = source.value.slice(rangeFrom.value - 1, rangeTo.value)
  // regular practice skips mastered words; favorites always include everything you starred
  if (mode.value === 'practice' && s.list === 'all') items = items.filter(w => !isMastered(w))
  if (s.shuffle || mode.value === 'practice') shuffleArr(items)
  queue.value = items
  i.value = 0
  flipped.value = false
  sessionDone.value = 0
  sessionSize.value = items.length
  history.value = []
  saveSettings()
}

function setMode(m) { if (s.mode !== m) { s.mode = m; build() } }
function setList(l) { if (s.list !== l) { s.list = l; build() } }
function setDir(d) { s.dir = d; flipped.value = false; saveSettings() }
function toggleShuffle() { s.shuffle = !s.shuffle; build() }
function selectAll() { rangeFrom.value = 1; rangeTo.value = source.value.length; build() }

function toggleFav(w = current.value) {
  if (!w) return
  const coveredAll = s.favTo >= favCount.value
  toggleFavWord(w)
  // if the favorites range covered the whole list, keep it covering the whole list
  if (coveredAll) s.favTo = Math.max(1, favCount.value)
  saveSettings()
}

function flip() {
  if (!current.value || pt.over) return
  if (mode.value === 'practice') {
    // the practice clock starts on the first reveal; revealing also resumes a paused clock
    if (!pt.started) { pt.started = true; pt.running = true }
    else if (!pt.running) pt.running = true
    flipped.value = true   // once revealed it stays revealed until answered
  } else {
    flipped.value = !flipped.value
  }
}
function next() { if (i.value < queue.value.length - 1) { i.value++; flipped.value = false } }
function prev() { if (i.value > 0) { i.value--; flipped.value = false } }

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1600)
}

/* ---------- undo (practice) ----------
   Every answer saves a snapshot first, so a mis-press can be taken back with Ctrl+Z
   or the Undo button: the card comes back revealed, and its progress is restored.  */
const history = ref([])
const UNDO_LIMIT = 50

function undo() {
  if (mode.value !== 'practice' || pt.over || !history.value.length) return
  const h = history.value.pop()
  setKnown(h.word, h.known)
  queue.value = h.queue
  i.value = h.i
  sessionDone.value = h.sessionDone
  pt.answered = h.answered
  pt.correct = h.correct
  if (h.running && !pt.running) pt.running = true
  flipped.value = true
  showToast(`Undid ${h.ok ? 'Know' : 'Don’t know'}: ${h.word.jp}`)
}

function answer(ok) {
  const w = current.value
  if (!w || !flipped.value || pt.over) return
  const q = queue.value
  history.value.push({
    word: w, ok, known: known(w), queue: [...q], i: i.value,
    sessionDone: sessionDone.value, answered: pt.answered, correct: pt.correct, running: pt.running
  })
  if (history.value.length > UNDO_LIMIT) history.value.shift()
  pt.answered++
  if (ok) pt.correct++
  if (ok) {
    markKnown(w)
    if (isMastered(w)) showToast(`${w.jp} mastered`)
    q.splice(i.value, 1)
    sessionDone.value++
  } else {
    q.push(q.splice(i.value, 1)[0])   // see it again later
  }
  if (i.value >= q.length) i.value = 0
  if (!q.length) pt.running = false    // session finished: stop the clock
  flipped.value = false
}

function resetProgress() {
  if (!confirm(`Reset mastered progress for Set ${props.set.id}?`)) return
  resetProgressFor(props.set.words)
  build()
}

function onKey(e) {
  poke()
  if (e.target.tagName === 'INPUT') return
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip() }
  else if (e.key === 'Escape') emit('home')
  else if ((e.key === 'p' || e.key === 'P') && mode.value === 'practice') togglePause()
  else if (e.key === 'f' || e.key === 'F') toggleFav()
  else if (mode.value === 'learn' && e.key === 'ArrowRight') next()
  else if (mode.value === 'learn' && e.key === 'ArrowLeft') prev()
  else if (mode.value === 'practice' && e.key === '1') answer(false)
  else if (mode.value === 'practice' && e.key === '2') answer(true)
}

function onVisibility() { if (document.visibilityState === 'hidden') flushLearn() }

onMounted(() => {
  build()
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', poke)
  document.addEventListener('visibilitychange', onVisibility)
  ticker = setInterval(tick, 1000)
})
onBeforeUnmount(() => {
  flushLearn()
  clearInterval(ticker)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', poke)
  document.removeEventListener('visibilitychange', onVisibility)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="study">
    <!-- sidebar -->
    <aside class="side">
      <div class="side-top">
        <button class="back" @click="emit('home')"><span>←</span> All sets</button>
        <SyncBadge @open="emit('sync')" />
      </div>

      <div class="shell">
      <div class="panel-card set-head">
        <div class="eyebrow"><span>Set {{ set.id }}</span><span class="chip">{{ set.level }}</span></div>
        <h1>{{ set.title }}</h1>
        <div v-if="set.jp" class="set-jp" lang="ja">{{ set.jp }}</div>
      </div>

      <div class="panel-card groups">
        <div class="group">
          <div class="glabel">Words</div>
          <div class="seg" :class="{ second: s.list === 'fav' }">
            <span class="pill"></span>
            <button :class="{ on: s.list === 'all' }" @click="setList('all')">All</button>
            <button :class="{ on: s.list === 'fav' }" @click="setList('fav')">★ Favorites <span class="count">{{ favCount }}</span></button>
          </div>
        </div>

        <div class="group">
          <div class="glabel">Mode</div>
          <div v-if="s.list === 'all'" class="seg" :class="{ second: s.mode === 'practice' }">
            <span class="pill"></span>
            <button v-for="m in modes" :key="m.v" :class="{ on: s.mode === m.v }" @click="setMode(m.v)">{{ m.label }}</button>
          </div>
          <div v-else class="tag">Practice only</div>
        </div>

        <div class="group">
          <div class="glabel">Direction</div>
          <div class="seg" :class="{ second: s.dir === 'ej' }">
            <span class="pill"></span>
            <button v-for="d in dirs" :key="d.v" :class="{ on: s.dir === d.v }" @click="setDir(d.v)">{{ d.label }}</button>
          </div>
        </div>

        <div class="group">
          <div class="glabel">
            Range
            <button class="mini" @click="selectAll">All</button>
          </div>
          <label class="range">
            <input type="number" min="1" :max="source.length" v-model.lazy.number="rangeFrom" @change="build" aria-label="From">
            <span class="dash">to</span>
            <input type="number" min="1" :max="source.length" v-model.lazy.number="rangeTo" @change="build" aria-label="To">
            <span class="of">of {{ source.length }}</span>
          </label>
          <button v-if="mode === 'learn'" class="check" :class="{ on: s.shuffle }" @click="toggleShuffle">
            <span class="box"></span> Shuffle order
          </button>
        </div>

        <div v-if="mode === 'practice'" class="group">
          <div class="glabel">Timer</div>
          <div class="chips">
            <button v-for="m in TIMER_OPTS" :key="m" :class="{ on: s.timer === m }" @click="setTimer(m)">
              {{ m ? m + 'm' : 'Off' }}
            </button>
          </div>
        </div>
      </div>
      </div>

      <div class="shell">
      <div class="panel-card stats">
        <div class="stat">
          <span class="stat-n gold">{{ masteredInRange }}<small>/{{ rangeWords.length }}</small></span>
          <span class="stat-l">mastered in range</span>
        </div>
        <div class="stat">
          <span class="stat-n">{{ masteredInSet }}<small>/{{ total }}</small></span>
          <span class="stat-l">mastered in set</span>
        </div>
        <template v-if="mode === 'learn'">
          <div class="stat">
            <span class="stat-n mono">{{ fmtClock(partSec) }}<small v-if="partDone" class="tick">✓</small></span>
            <span class="stat-l">this part ({{ s.from }}–{{ s.to }})</span>
          </div>
          <div class="stat">
            <span class="stat-n mono">{{ fmtShort(setSec) }}</span>
            <span class="stat-l">learning, whole set</span>
          </div>
        </template>
      </div>

      <div v-if="mode === 'learn' && parts.length" class="panel-card parts">
        <div class="glabel">Parts learned</div>
        <ul>
          <li v-for="p in parts" :key="p.key" :class="{ cur: p.key === learnKey }">
            <div class="p-text">
              <b>Words {{ p.from }}–{{ p.to }}</b>
              <span>{{ p.to - p.from + 1 }} words{{ p.done ? ' · finished' : '' }}</span>
            </div>
            <span v-if="p.key === learnKey" class="now">Now</span>
            <span class="p-time mono">{{ fmtClock(p.key === learnKey ? partSec : p.sec) }}</span>
          </li>
        </ul>
      </div>
      </div>

      <div class="side-foot">
        <button class="link" @click="resetProgress">Reset set progress</button>
        <span class="sep">·</span>
        <button class="link" @click="resetTimes">Reset times</button>
      </div>
    </aside>

    <!-- stage -->
    <main class="stage">
      <div class="shell stage-shell">
      <div class="meta">
        <div class="meta-row">
          <span class="meta-left">
            {{ posText }}
            <Transition name="fade"><span v-if="toast" class="toast" lang="ja">{{ toast }}</span></Transition>
          </span>

          <!-- learn: stopwatch for this part -->
          <span v-if="mode === 'learn' && current" class="clock" :class="{ idle: learnIdle }"
                :title="learnIdle ? 'Paused while idle. Press any key to resume.' : 'Time spent learning this part'">
            <span class="dot"></span>{{ learnIdle ? 'paused · ' : '' }}{{ fmtClock(partSec) }}
          </span>

          <!-- practice: countdown (or elapsed when no timer) -->
          <button v-else-if="mode === 'practice' && (current || pt.over) && (s.timer || pt.started)"
                  class="clock btnclock"
                  :class="{ low: s.timer && remaining <= 10 && pt.running, paused: pt.started && !pt.running && !pt.over }"
                  :title="pt.started ? 'Pause / resume (P)' : 'Starts when you reveal the first card'"
                  @click="togglePause">
            <span class="dot"></span>
            <template v-if="!pt.started">{{ fmtClock(s.timer * 60) }} · starts on reveal</template>
            <template v-else>{{ !pt.running && !pt.over ? 'paused · ' : '' }}{{ fmtClock(s.timer ? remaining : pt.elapsed) }}</template>
          </button>
        </div>
        <div class="track"><i :style="{ width: barPct + '%' }"></i></div>
      </div>

      <Transition name="swap" mode="out-in">
        <div v-if="pt.over" key="timeup" class="empty">
          <div class="empty-mark" lang="ja">時</div>
          <h2>Time's up</h2>
          <div class="result">
            <div><b>{{ pt.answered }}</b><span>answered</span></div>
            <div><b class="good">{{ pt.correct }}</b><span>known</span></div>
            <div><b class="bad">{{ pt.answered - pt.correct }}</b><span>missed</span></div>
            <div><b>{{ pace }}s</b><span>per card</span></div>
          </div>
          <button class="btn primary again" @click="build">Go again</button>
        </div>
        <FlashCard
          v-else-if="current"
          :key="current.n + s.dir"
          :word="current"
          :dir="s.dir"
          :flipped="flipped"
          :known="known(current)"
          :master-at="MASTER_AT"
          :fav="!!favs[current.jp]"
          @flip="flip"
          @fav="toggleFav()"
        />
        <div v-else key="empty" class="empty">
          <template v-if="s.list === 'fav' && !favCount">
            <div class="empty-mark">☆</div>
            <h2>No favorites yet</h2>
            <p>Tap the star on any card, or press <kbd>F</kbd>, to add it here.</p>
            <button class="btn primary again" @click="setList('all')">Browse all words</button>
          </template>
          <template v-else-if="s.list === 'fav'">
            <div class="empty-mark" lang="ja">良</div>
            <h2>Session complete</h2>
            <p>You went through every favorite in this range.</p>
            <p v-if="pt.answered" class="summary">{{ pt.correct }}/{{ pt.answered }} known · {{ fmtClock(pt.elapsed) }} · {{ pace }}s per card</p>
            <button class="btn primary again" @click="build">Practice again</button>
          </template>
          <template v-else-if="mode === 'practice'">
            <div class="empty-mark" lang="ja">{{ allMastered ? '完' : '良' }}</div>
            <h2>{{ allMastered ? 'Everything mastered' : 'Session complete' }}</h2>
            <p>{{ allMastered ? 'Every word in this range is mastered.' : 'Words you missed came back until you got them.' }}</p>
            <p v-if="pt.answered" class="summary">{{ pt.correct }}/{{ pt.answered }} known · {{ fmtClock(pt.elapsed) }} · {{ pace }}s per card</p>
            <button v-if="!allMastered" class="btn primary again" @click="build">Practice again</button>
          </template>
          <template v-else>
            <h2>No words in range</h2>
            <p>Adjust the range.</p>
          </template>
        </div>
      </Transition>

      <div class="actions">
        <button v-if="mode === 'practice' && !pt.over && history.length" class="btn undo"
                title="Undo last answer (Ctrl+Z)" aria-label="Undo last answer" @click="undo">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
          <span class="undo-l">Undo</span>
        </button>
        <template v-if="pt.over"></template>
        <template v-else-if="current && mode === 'learn'">
          <button class="btn" :disabled="i === 0" @click="prev"><kbd>←</kbd> Previous</button>
          <button class="btn primary" :disabled="i >= queue.length - 1" @click="next">Next <kbd>→</kbd></button>
        </template>
        <template v-else-if="current && flipped">
          <button class="btn bad" @click="answer(false)"><kbd>1</kbd> Don’t know</button>
          <button class="btn good" @click="answer(true)"><kbd>2</kbd> Know</button>
        </template>
        <button v-else-if="current" class="btn primary" @click="flip"><kbd>Space</kbd> Reveal</button>
      </div>
      </div>

      <div class="shortcuts">
        <span><kbd>F</kbd> favorite</span>
        <span v-if="mode === 'practice'"><kbd>P</kbd> pause timer</span>
        <span v-if="mode === 'practice'"><kbd>Ctrl</kbd><kbd>Z</kbd> undo</span>
        <span><kbd>Esc</kbd> all sets</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.mono { font-variant-numeric: tabular-nums; }
.tick { color: var(--accent) !important; margin-left: 6px !important; font-size: 14px; }

.study {
  flex: 1;
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* ---------- sidebar ---------- */
.side {
  position: sticky; top: 24px;
  display: flex; flex-direction: column; gap: 16px;
}
.side-top { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; }
.back {
  display: inline-flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 16px 0 12px;
  background: var(--shell); border: 1px solid var(--line); border-radius: 999px;
  color: var(--muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: color .2s var(--ease), background .2s var(--ease), border-color .2s var(--ease);
}
.back span { transition: transform .2s var(--ease); }
.back:hover { color: var(--text); background: var(--surface); border-color: var(--line-strong); }
.back:hover span { transform: translateX(-3px); }

.set-head { padding: 22px 22px 20px; }
.eyebrow {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; font-weight: 650; color: var(--muted); margin-bottom: 12px;
}
.chip { font-size: 11.5px; font-weight: 600; background: var(--surface-2); border-radius: 999px; padding: 4px 11px; }
.set-head h1 { font-size: 22px; font-weight: 700; letter-spacing: -.03em; line-height: 1.25; }
.set-jp { margin-top: 4px; font-size: 14px; color: var(--faint); letter-spacing: .04em; }

.groups { display: flex; flex-direction: column; gap: 18px; padding: 20px 18px; }
.group { display: flex; flex-direction: column; gap: 8px; }
.glabel {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 4px;
  font-size: 12.5px; font-weight: 650; color: var(--muted);
}
.mini {
  background: var(--surface-2); border: 0; border-radius: 999px; padding: 2px 10px;
  color: var(--muted); font-size: 11.5px; font-weight: 600; cursor: pointer;
  transition: color .2s var(--ease), background .2s var(--ease);
}
.mini:hover { color: var(--accent-ink); background: var(--accent); }

/* segmented control = the reference's pill tab bar */
.seg {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  background: var(--shell);
  border-radius: 999px;
}
.seg .pill {
  position: absolute; top: 4px; bottom: 4px; left: 4px;
  width: calc(50% - 4px);
  background: var(--accent);
  border-radius: 999px;
  transition: transform .35s var(--spring);
}
.seg.second .pill { transform: translateX(100%); }
.seg button {
  position: relative;
  height: 34px; padding: 0 10px;
  background: none; border: 0;
  color: var(--faint);
  font-size: 12.5px; font-weight: 650;
  cursor: pointer; white-space: nowrap;
  transition: color .2s var(--ease);
}
.seg button:hover { color: var(--text); }
.seg button.on { color: var(--accent-ink); }
.count {
  margin-left: 4px; padding: 1px 7px; border-radius: 999px;
  font-size: 11px; font-variant-numeric: tabular-nums;
  background: var(--surface-2); color: var(--muted);
}
.seg button.on .count { background: rgba(26, 20, 39, .14); color: var(--accent-ink); }
.tag {
  display: flex; align-items: center; justify-content: center; height: 42px;
  font-size: 12.5px; font-weight: 600; color: var(--muted);
  border: 1px dashed var(--line-strong); border-radius: 999px;
}

.range {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 16px 4px 4px;
  background: var(--shell);
  border-radius: 999px;
  font-size: 12.5px; color: var(--faint);
}
.range input {
  width: 60px; height: 34px;
  background: var(--surface-2); border: 1px solid transparent; border-radius: 999px;
  color: var(--text); font: 650 13.5px var(--font);
  text-align: center; font-variant-numeric: tabular-nums;
  transition: border-color .2s var(--ease), background .2s var(--ease);
}
.range input:hover { background: var(--surface-3); }
.range input:focus { outline: none; border-color: var(--accent); }
.range .of { margin-left: auto; }

.check {
  display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
  background: none; border: 0; padding: 4px;
  color: var(--muted); font-size: 12.5px; font-weight: 500; cursor: pointer;
}
.check .box {
  position: relative;
  width: 34px; height: 20px; border-radius: 999px; background: var(--surface-3);
  transition: background .25s var(--ease);
}
.check .box::after {
  content: ""; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%; background: var(--muted);
  transition: transform .3s var(--spring), background .2s var(--ease);
}
.check.on { color: var(--text); }
.check.on .box { background: var(--accent); }
.check.on .box::after { transform: translateX(14px); background: var(--accent-ink); }

.chips {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px;
  padding: 4px; background: var(--shell); border-radius: 999px;
}
.chips button {
  height: 32px; background: none; border: 0; border-radius: 999px;
  color: var(--faint); font-size: 12px; font-weight: 650; cursor: pointer;
  transition: color .2s var(--ease), background .2s var(--ease);
}
.chips button:hover { color: var(--text); }
.chips button.on { background: var(--accent); color: var(--accent-ink); }

/* stats: big numbers with small labels */
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 12px; padding: 22px; }
.stat { display: flex; flex-direction: column; gap: 3px; }
.stat-n { font-size: 30px; font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1.05; }
.stat-n small { font-size: 14px; color: var(--faint); font-weight: 600; margin-left: 2px; letter-spacing: -.01em; }
.stat-l { font-size: 12px; color: var(--faint); }
.gold { color: var(--accent); }

.parts { display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 10px; }
.parts ul { list-style: none; display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; padding: 0 4px; }
.parts li { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--line); }
.parts li:first-child { border-top: 0; }
.p-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.p-text b { font-size: 13.5px; font-weight: 650; color: var(--muted); font-variant-numeric: tabular-nums; }
.p-text span { font-size: 11.5px; color: var(--faint); }
.parts li.cur .p-text b { color: var(--text); }
.p-time { font-size: 16px; font-weight: 700; letter-spacing: -.03em; }
.now {
  height: 24px; padding: 0 10px; border-radius: 999px; display: inline-flex; align-items: center;
  background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700;
}

.side-foot { display: flex; justify-content: center; align-items: center; padding-top: 2px; }
.side-foot .sep { color: var(--faint); margin: 0 10px; font-size: 12px; }

/* ---------- stage ---------- */
.stage {
  display: flex; flex-direction: column; gap: 14px;
  min-height: calc(100vh - 48px);
}
.stage-shell { flex: 1; }
.meta { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 8px; }
.meta-row {
  display: flex; justify-content: space-between; align-items: center;
  min-height: 34px; font-size: 13px; font-weight: 600; color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.meta-left { display: inline-flex; align-items: center; gap: 14px; }
.toast {
  height: 28px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center;
  background: var(--accent-soft); color: var(--accent); font-size: 12.5px;
}
.track { height: 6px; background: var(--surface); border-radius: 6px; overflow: hidden; }
.track i {
  display: block; height: 100%; border-radius: 6px;
  background: var(--accent);
  transition: width .5s var(--spring);
}

.clock {
  display: inline-flex; align-items: center; gap: 9px;
  height: 34px; padding: 0 14px;
  background: var(--surface); border: 0; border-radius: 999px;
  color: var(--text); font: 700 14px var(--font); letter-spacing: -.01em; font-variant-numeric: tabular-nums;
}
.clock .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blink); box-shadow: 0 0 0 3px var(--blink-soft); animation: blink 2s infinite; }
.clock.idle, .clock.paused { color: var(--muted); }
.clock.idle .dot, .clock.paused .dot { background: var(--faint); box-shadow: none; animation: none; }
.clock.low { color: var(--bad); background: color-mix(in srgb, var(--bad) 14%, var(--surface)); }
.clock.low .dot { background: var(--bad); box-shadow: 0 0 0 3px rgba(240, 128, 143, .2); }
.btnclock { cursor: pointer; transition: background .2s var(--ease); }
.btnclock:hover { background: var(--surface-2); }
@keyframes blink { 50% { opacity: .35; } }

.empty {
  flex: 1; min-height: 400px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; text-align: center; padding: 32px 24px;
  background: var(--surface);
  border-radius: var(--r-card);
}
.empty-mark {
  width: 76px; height: 76px; border-radius: 50%; margin-bottom: 14px;
  display: grid; place-items: center;
  background: var(--accent); color: var(--accent-ink);
  font-size: 34px; font-weight: 700;
}
.empty h2 { font-size: 26px; font-weight: 700; letter-spacing: -.035em; }
.empty p { font-size: 13.5px; color: var(--muted); max-width: 34ch; }
.empty .again { flex: none; margin-top: 22px; padding: 0 28px; height: 48px; }

.result {
  display: grid; grid-template-columns: repeat(4, auto); gap: 32px; margin-top: 20px;
  padding: 18px 28px; background: var(--surface-2); border-radius: 22px;
}
.result div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.result b { font-size: 30px; font-weight: 700; letter-spacing: -.04em; color: var(--text); font-variant-numeric: tabular-nums; }
.result span { font-size: 12px; color: var(--faint); }
.result b.good { color: var(--accent); }
.result b.bad { color: var(--bad); }
.summary {
  margin-top: 12px; padding: 8px 16px; border-radius: 999px; background: var(--surface-2);
  color: var(--text) !important; font-weight: 600; font-variant-numeric: tabular-nums;
}

/* the "Stop · Pause · Lap" pill row */
.actions {
  display: flex; gap: 8px; min-height: 64px;
  padding: 6px; background: var(--surface); border-radius: 999px;
}
.actions:empty { display: none; }
.actions .btn { height: 52px; }
.actions .undo { flex: none; padding: 0 20px 0 18px; gap: 8px; color: var(--muted); }
.actions .undo:hover { color: var(--text); }
.undo-l { font-size: 13px; }
.shortcuts kbd + kbd { margin-left: -3px; }

.shortcuts { display: flex; justify-content: center; gap: 22px; font-size: 12px; color: var(--faint); }
.shortcuts span { display: inline-flex; align-items: center; gap: 7px; }

/* transitions */
.swap-enter-active, .swap-leave-active { transition: opacity .2s var(--ease), transform .25s var(--ease); }
.swap-enter-from { opacity: 0; transform: translateY(8px) scale(.99); }
.swap-leave-to { opacity: 0; transform: translateY(-4px); }
.fade-enter-active, .fade-leave-active { transition: opacity .3s var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ---------- smaller screens: sidebar becomes a top panel ---------- */
@media (max-width: 1000px) {
  .study { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; }
  .groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .side > .shell:has(.stats) { display: none; }
  .side-foot { order: 10; }
  .stage { min-height: 0; }
  .stage :deep(.card), .empty { min-height: 58vh; }
  .shortcuts { display: none; }
}
@media (max-width: 560px) {
  .groups { grid-template-columns: 1fr; }
  .result { grid-template-columns: repeat(2, auto); gap: 16px 28px; }
  .actions .btn { padding: 0 12px; font-size: 13px; }
  .actions kbd { display: none; }
}
</style>
