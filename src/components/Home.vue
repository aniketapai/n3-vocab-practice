<script setup>
import { computed } from 'vue'
import { isMastered, isFav, known, setLearnTotal, fmtShort, MASTER_AT } from '../state.js'
import SyncBadge from './SyncBadge.vue'

const props = defineProps({ sets: { type: Array, required: true } })
defineEmits(['open', 'sync'])

const stats = computed(() => props.sets.map(set => {
  const total = set.words.length
  const mastered = set.words.filter(isMastered).length
  const fav = set.words.filter(isFav).length
  const started = set.words.some(w => known(w) > 0)
  const learnSec = setLearnTotal(set.id)
  return { total, mastered, fav, learnSec, started: started || learnSec > 0, pct: total ? mastered / total * 100 : 0 }
}))

const allWords = computed(() => props.sets.flatMap(s => s.words))

const totals = computed(() => {
  const words = allWords.value.length
  const mastered = stats.value.reduce((a, s) => a + s.mastered, 0)
  return {
    words,
    mastered,
    fav: stats.value.reduce((a, s) => a + s.fav, 0),
    sec: stats.value.reduce((a, s) => a + s.learnSec, 0),
    pct: words ? Math.round(mastered / words * 100) : 0
  }
})

// "pulse" strip: every word's progress, bucketed into at most 96 bars
const pulse = computed(() => {
  const w = allWords.value
  const n = Math.min(96, w.length)
  if (!n) return []
  const size = w.length / n
  return Array.from({ length: n }, (_, k) => {
    const slice = w.slice(Math.floor(k * size), Math.floor((k + 1) * size))
    const avg = slice.reduce((a, x) => a + Math.min(known(x), MASTER_AT), 0) / (slice.length * MASTER_AT)
    return { h: 18 + avg * 82, tone: avg >= 1 ? 'm' : avg > 0 ? 'l' : 'n' }
  })
})

// mastery "zones": how many words sit at each step
const zones = computed(() => {
  const c = Array(MASTER_AT + 1).fill(0)
  for (const w of allWords.value) c[Math.min(known(w), MASTER_AT)]++
  const rows = [{ name: 'Mastered', sub: `${MASTER_AT} of ${MASTER_AT} correct`, n: c[MASTER_AT], tone: 'm' }]
  for (let k = MASTER_AT - 1; k >= 1; k--) rows.push({ name: 'Learning', sub: `${k} of ${MASTER_AT} correct`, n: c[k], tone: 'l' })
  rows.push({ name: 'New', sub: 'Not answered yet', n: c[0], tone: 'n' })
  const top = Math.max(...rows.map(r => r.n))
  return rows.map(r => ({ ...r, now: r.n === top && r.n > 0 }))
})

const nextNum = computed(() => String((props.sets.at(-1)?.num || 0) + 1).padStart(2, '0'))
const fmt = n => n.toLocaleString()
</script>

<template>
  <div class="home">
    <header class="nav">
      <div class="brand">
        <span class="logo" lang="ja">単</span>
        <div>
          <div class="b-title">Tango</div>
          <div class="b-sub">Japanese vocabulary</div>
        </div>
      </div>
      <SyncBadge @open="$emit('sync')" />
    </header>

    <!-- dashboard -->
    <section class="dash">
      <div class="shell overview">
        <div class="panel-card ov-main">
          <div class="ov-head">
            <h1>Study Pulse</h1>
            <p class="label">Every word you're learning, at a glance.</p>
          </div>

          <div class="pulse" aria-hidden="true">
            <span v-if="!pulse.some(b => b.tone !== 'n')" class="pulse-hint">Practice a set and this fills with your progress</span>
            <i v-for="(b, k) in pulse" :key="k" :class="b.tone" :style="{ height: b.h + '%', animationDelay: k * 6 + 'ms' }"></i>
          </div>

          <div class="ov-meta">
            <span><b>{{ fmt(totals.words) }}</b> words</span>
            <span><b>{{ fmtShort(totals.sec) }}</b> studied</span>
          </div>

          <div class="ov-big">
            <div>
              <div class="num-xl">{{ fmt(totals.mastered) }}</div>
              <div class="label">words mastered</div>
            </div>
            <span class="lime-pill">{{ totals.pct }}%</span>
          </div>
        </div>

        <div class="panel-card trio">
          <div><b>Sets</b><span>{{ sets.length }} available</span></div>
          <div><b>Favorites</b><span>{{ totals.fav }} starred</span></div>
          <div><b>Goal</b><span>{{ fmt(totals.words - totals.mastered) }} left</span></div>
        </div>
      </div>

      <div class="shell zones">
        <div class="panel-card z-head">
          <p>A word is <b>mastered</b> after you get it right {{ MASTER_AT }} times in practice. Missed words come back until you know them.</p>
        </div>
        <div class="panel-card z-list">
          <div v-for="z in zones" :key="z.sub" class="zone">
            <span class="z-dot" :class="z.tone"></span>
            <div class="z-text">
              <b>{{ z.name }}</b>
              <span>{{ z.sub }}</span>
            </div>
            <span v-if="z.now" class="lime-pill sm">Most</span>
            <span class="z-n">{{ fmt(z.n) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- sets -->
    <section class="sets">
      <div class="sec-head">
        <h2>Sets</h2>
        <span class="label">{{ sets.length }} {{ sets.length === 1 ? 'set' : 'sets' }} · pick one to learn or practice</span>
      </div>

      <div class="grid">
        <button
          v-for="(set, k) in sets"
          :key="set.id"
          class="shell set"
          @click="$emit('open', set)"
        >
          <div class="panel-card s-main">
            <div class="s-top">
              <span class="s-no">Set {{ set.id }}</span>
              <span class="chip">{{ set.level }}</span>
            </div>
            <div v-if="set.jp" class="s-jp" lang="ja">{{ set.jp }}</div>
            <h3>{{ set.title }}</h3>
            <p v-if="set.blurb" class="s-blurb">{{ set.blurb }}</p>

            <ul class="cats">
              <li v-for="c in set.categories.slice(0, 4)" :key="c.name">
                <span>{{ c.name }}</span><b>{{ c.count }}</b>
              </li>
              <li v-if="set.categories.length > 4" class="more">
                <span>+ {{ set.categories.length - 4 }} more categories</span>
              </li>
            </ul>
          </div>

          <div class="panel-card s-stats">
            <div><span class="num-l">{{ stats[k].total }}</span><span class="label">words</span></div>
            <div><span class="num-l lime">{{ stats[k].mastered }}</span><span class="label">mastered</span></div>
            <div><span class="num-l">{{ stats[k].learnSec ? fmtShort(stats[k].learnSec) : '0m' }}</span><span class="label">time</span></div>
          </div>

          <div class="s-bar">
            <div class="ring" :style="{ '--p': stats[k].pct }">
              <span>{{ Math.round(stats[k].pct) }}<small>%</small></span>
            </div>
            <div class="s-bar-text">
              <b>{{ stats[k].started ? 'In progress' : 'Not started' }}</b>
              <span>{{ stats[k].fav ? `★ ${stats[k].fav} favorites` : 'No favorites yet' }}</span>
            </div>
            <span class="cta">{{ stats[k].started ? 'Continue' : 'Start' }} <span class="arrow">→</span></span>
          </div>
        </button>

        <div class="shell set soon">
          <div class="panel-card soon-body">
            <div class="soon-mark">+</div>
            <div class="soon-title">Set {{ nextNum }}</div>
            <p>Drop the next CSV into <code>src/sets/</code> and it shows up here.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: 28px; }

/* nav */
.nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo {
  width: 42px; height: 42px; border-radius: 14px;
  display: grid; place-items: center;
  background: var(--accent); color: var(--accent-ink);
  font-size: 20px; font-weight: 700;
}
.b-title { font-size: 17px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.b-sub { font-size: 12px; color: var(--faint); }

/* dashboard */
.dash { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; }
.ov-main { display: flex; flex-direction: column; gap: 22px; padding: 26px 28px 28px; flex: 1; }
.ov-head h1 { font-size: 24px; font-weight: 700; letter-spacing: -.03em; line-height: 1.2; }
.ov-head p { margin-top: 4px; }

.pulse {
  height: 120px;
  display: flex; align-items: flex-end; gap: 3px;
  padding-bottom: 2px;
  border-bottom: 1px dashed var(--line-strong);
}
.pulse { position: relative; }
.pulse-hint {
  position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%);
  padding: 6px 14px; border-radius: 999px; background: var(--surface-2);
  font-size: 12px; font-weight: 500; color: var(--muted); white-space: nowrap;
}
.pulse i {
  flex: 1; min-width: 2px; border-radius: 3px;
  background: var(--surface-3);
  transform-origin: bottom;
  animation: grow .7s var(--spring) both;
}
.pulse i.l { background: var(--good); }
.pulse i.m { background: var(--accent); }
@keyframes grow { from { transform: scaleY(0); } }

.ov-meta { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); }
.ov-meta b { color: var(--text); font-weight: 650; }
.ov-big { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
.ov-big .label { margin-top: 6px; font-size: 13px; }

.lime-pill {
  display: inline-flex; align-items: center; justify-content: center;
  height: 40px; padding: 0 20px; border-radius: var(--r-pill);
  background: var(--accent); color: var(--accent-ink);
  font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.lime-pill.sm { height: 26px; padding: 0 12px; font-size: 11.5px; }

.trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 18px 24px; }
.trio div { display: flex; flex-direction: column; gap: 2px; }
.trio b { font-size: 14px; font-weight: 650; }
.trio span { font-size: 12.5px; color: var(--faint); }

.zones .z-head { padding: 22px 24px; }
.z-head p { font-size: 14px; color: var(--muted); line-height: 1.55; }
.z-head b { color: var(--text); font-weight: 650; }
.z-list { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 14px 24px; }
.zone { display: flex; align-items: center; gap: 14px; padding: 10px 0; }
.zone + .zone { border-top: 1px solid var(--line); }
.z-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-3); flex: none; }
.z-dot.l { background: var(--good); }
.z-dot.m { background: var(--accent); }
.z-text { flex: 1; display: flex; flex-direction: column; }
.z-text b { font-size: 14.5px; font-weight: 650; }
.z-text span { font-size: 12px; color: var(--faint); }
.z-n { font-size: 20px; font-weight: 650; letter-spacing: -.03em; min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; }

/* sets */
.sec-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; padding: 0 6px; }
.sec-head h2 { font-size: 22px; font-weight: 700; letter-spacing: -.03em; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: 16px;
}

.set {
  text-align: left; color: inherit; font: inherit;
  cursor: pointer;
  transition: transform .3s var(--ease), border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.set:hover { transform: translateY(-3px); border-color: var(--line-strong); box-shadow: 0 30px 60px -30px rgba(0, 0, 0, .9); }
.set:hover .cta { background: #d8cff9; }
.set:hover .arrow { transform: translateX(3px); }

.s-main { display: flex; flex-direction: column; gap: 6px; padding: 24px 24px 20px; }
.s-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.s-no { font-size: 13px; font-weight: 650; color: var(--muted); }
.chip {
  font-size: 11.5px; font-weight: 600; color: var(--muted);
  background: var(--surface-2); border-radius: var(--r-pill); padding: 4px 11px;
}
.s-jp { font-size: 34px; font-weight: 600; letter-spacing: .02em; line-height: 1.2; }
.s-main h3 { font-size: 19px; font-weight: 700; letter-spacing: -.025em; line-height: 1.3; }
.s-blurb { font-size: 13px; color: var(--faint); line-height: 1.6; margin-top: 2px; }

.cats { list-style: none; margin-top: 14px; display: flex; flex-direction: column; }
.cats li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; font-size: 13px; border-top: 1px solid var(--line); }
.cats li span { color: var(--muted); }
.cats li b { font-weight: 650; font-variant-numeric: tabular-nums; }
.cats li.more span { color: var(--faint); font-size: 12px; }

.s-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 18px 24px; }
.s-stats div { display: flex; flex-direction: column; gap: 2px; }
.lime { color: var(--accent); }

.s-bar {
  display: flex; align-items: center; gap: 12px;
  margin-top: auto;
  padding: 8px 8px 8px 10px;
  background: var(--surface); border-radius: var(--r-pill);
}
.ring {
  --p: 0;
  width: 44px; height: 44px; border-radius: 50%; flex: none;
  display: grid; place-items: center;
  background:
    radial-gradient(closest-side, var(--surface) 76%, transparent 78%),
    conic-gradient(var(--accent) calc(var(--p) * 1%), var(--surface-3) 0);
}
.ring span { font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ring small { font-size: 8.5px; color: var(--faint); }
.s-bar-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.s-bar-text b { font-size: 13px; font-weight: 650; }
.s-bar-text span { font-size: 11.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cta {
  display: inline-flex; align-items: center; gap: 6px;
  height: 44px; padding: 0 20px; border-radius: var(--r-pill);
  background: var(--accent); color: var(--accent-ink);
  font-size: 13.5px; font-weight: 700; white-space: nowrap;
  transition: background .2s var(--ease);
}
.arrow { display: inline-block; transition: transform .25s var(--ease); }

.soon { cursor: default; background: transparent; border-style: dashed; border-color: var(--line-strong); }
.soon:hover { transform: none; box-shadow: none; }
.soon-body {
  flex: 1; min-height: 260px; background: transparent;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px;
}
.soon-mark {
  width: 52px; height: 52px; border-radius: 50%; margin-bottom: 10px;
  display: grid; place-items: center;
  background: var(--surface); color: var(--muted); font-size: 24px; font-weight: 300;
}
.soon-title { font-size: 16px; font-weight: 700; letter-spacing: -.02em; }
.soon p { font-size: 12.5px; color: var(--faint); max-width: 30ch; }
code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--muted); background: var(--surface); padding: 1px 6px; border-radius: 6px; }

@media (max-width: 900px) {
  .dash { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .ov-main { padding: 22px 20px; }
  .trio, .s-stats { padding: 16px 18px; }
  .s-bar-text { display: none; }
  .s-bar { justify-content: space-between; }
}
</style>
