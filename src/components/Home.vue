<script setup>
import { computed } from 'vue'
import { isMastered, isFav, known, setLearnTotal, fmtShort } from '../state.js'
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

const totals = computed(() => ({
  words: stats.value.reduce((a, s) => a + s.total, 0),
  mastered: stats.value.reduce((a, s) => a + s.mastered, 0),
  fav: stats.value.reduce((a, s) => a + s.fav, 0)
}))

const nextNum = computed(() => String((props.sets.at(-1)?.num || 0) + 1).padStart(2, '0'))
</script>

<template>
  <div class="home">
    <header class="nav">
      <div class="brand">
        <span class="mark" lang="ja">単語</span>
        <span class="title">Flashcards</span>
      </div>
      <div class="totals">
        <span><b>{{ totals.words }}</b> words</span>
        <span class="dot"></span>
        <span><b class="gold">{{ totals.mastered }}</b> mastered</span>
        <span class="dot"></span>
        <span><b>{{ totals.fav }}</b> favorites</span>
        <SyncBadge class="sync" @open="$emit('sync')" />
      </div>
    </header>

    <section class="hero">
      <div class="eyebrow">Japanese vocabulary</div>
      <h1>Choose a set</h1>
      <p>Learn a set card by card, then practice it until every word is mastered. A word is mastered after you get it right 3 times.</p>
    </section>

    <section class="grid">
      <button
        v-for="(set, k) in sets"
        :key="set.id"
        class="set"
        @click="$emit('open', set)"
      >
        <div class="set-top">
          <span class="set-no">Set {{ set.id }}</span>
          <span class="level">{{ set.level }}</span>
        </div>

        <div class="set-titles">
          <div v-if="set.jp" class="set-jp" lang="ja">{{ set.jp }}</div>
          <h2>{{ set.title }}</h2>
          <p v-if="set.blurb" class="blurb">{{ set.blurb }}</p>
        </div>

        <ul class="cats">
          <li v-for="c in set.categories" :key="c.name">{{ c.name }} <span>{{ c.count }}</span></li>
        </ul>

        <div class="set-foot">
          <div class="bar"><i :style="{ width: stats[k].pct + '%' }"></i></div>
          <div class="foot-row">
            <span class="nums">
              <span>{{ stats[k].total }} words</span>
              <span class="dot"></span>
              <span class="gold">{{ stats[k].mastered }} mastered</span>
              <template v-if="stats[k].fav">
                <span class="dot"></span>
                <span>★ {{ stats[k].fav }}</span>
              </template>
              <template v-if="stats[k].learnSec">
                <span class="dot"></span>
                <span title="Total learning time">⏱ {{ fmtShort(stats[k].learnSec) }}</span>
              </template>
            </span>
            <span class="cta">{{ stats[k].started ? 'Continue' : 'Start' }} <span class="arrow">→</span></span>
          </div>
        </div>
      </button>

      <div class="set soon">
        <div class="set-top"><span class="set-no">Set {{ nextNum }}</span></div>
        <div class="soon-body">
          <div class="soon-mark">+</div>
          <div class="soon-title">More sets coming</div>
          <p>Drop the next CSV into <code>src/sets/</code> and it will show up here.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: clamp(32px, 5vw, 56px); }

.nav { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: baseline; gap: 10px; }
.mark { font-size: 20px; font-weight: 600; letter-spacing: .04em; }
.title { font-size: 13px; color: var(--faint); }
.totals { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--muted); }
.totals b { color: var(--text); font-weight: 500; }
.totals .sync { margin-left: 10px; }
.nav { align-items: center; }
.gold, .totals b.gold { color: var(--accent); }
.dot { width: 3px; height: 3px; border-radius: 50%; background: var(--line-strong); display: inline-block; }

.hero { max-width: 640px; }
.eyebrow { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--faint); margin-bottom: 12px; }
.hero h1 { font-size: clamp(30px, 4vw, 44px); font-weight: 500; letter-spacing: -.02em; line-height: 1.15; }
.hero p { margin-top: 14px; color: var(--muted); font-size: 14.5px; max-width: 56ch; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  gap: 18px;
}

.set {
  display: flex; flex-direction: column; gap: 22px;
  min-height: 320px;
  padding: 24px;
  text-align: left;
  color: inherit; font: inherit;
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%);
  border: 1px solid var(--line);
  border-radius: 22px;
  cursor: pointer;
  transition: border-color .25s var(--ease), transform .25s var(--ease);
}
.set:hover { border-color: var(--line-strong); transform: translateY(-2px); }
.set:hover .arrow { transform: translateX(3px); }

.set-top { display: flex; justify-content: space-between; align-items: center; }
.set-no { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.level { font-size: 11px; color: var(--muted); border: 1px solid var(--line-strong); border-radius: 999px; padding: 2px 10px; }

.set-titles { display: flex; flex-direction: column; gap: 6px; }
.set-jp { font-size: 30px; font-weight: 500; letter-spacing: .04em; line-height: 1.2; }
.set h2 { font-size: 19px; font-weight: 500; letter-spacing: -.01em; }
.blurb { font-size: 13px; color: var(--muted); line-height: 1.6; margin-top: 4px; }

.cats { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.cats li {
  font-size: 11.5px; color: var(--muted);
  padding: 3px 10px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line);
}
.cats li span { color: var(--faint); margin-left: 3px; font-variant-numeric: tabular-nums; }

.set-foot { margin-top: auto; display: flex; flex-direction: column; gap: 12px; }
.bar { height: 3px; background: var(--line); border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; transition: width .4s var(--ease); }
.foot-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.nums { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.cta { font-size: 13px; font-weight: 500; white-space: nowrap; }
.arrow { display: inline-block; transition: transform .25s var(--ease); }

.soon {
  cursor: default;
  background: transparent;
  border-style: dashed;
}
.soon:hover { transform: none; border-color: var(--line); }
.soon-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; }
.soon-mark { font-size: 28px; font-weight: 300; color: var(--faint); line-height: 1; margin-bottom: 6px; }
.soon-title { font-size: 15px; font-weight: 500; color: var(--muted); }
.soon p { font-size: 12.5px; color: var(--faint); max-width: 30ch; }
code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--muted); background: var(--bg); padding: 1px 6px; border-radius: 5px; }
</style>
