<script setup>
defineProps({
  word: { type: Object, required: true },
  dir: { type: String, required: true },      // 'je' | 'ej'
  flipped: { type: Boolean, default: false },
  known: { type: Number, default: 0 },
  masterAt: { type: Number, default: 3 },
  fav: { type: Boolean, default: false }
})
defineEmits(['flip', 'fav'])
</script>

<template>
  <div class="card" :class="{ flipped }" @click="$emit('flip')">
    <header class="top">
      <span class="num">{{ String(word.n).padStart(3, '0') }}</span>
      <span class="cat">{{ word.cat }}</span>
      <span class="right">
        <span v-if="known >= masterAt" class="mastered">Mastered</span>
        <span v-else class="dots" :title="`${known} / ${masterAt}`">
          <i v-for="k in masterAt" :key="k" :class="{ f: k <= known }"></i>
        </span>
        <button
          class="star"
          :class="{ on: fav }"
          :title="fav ? 'Remove from favorites (F)' : 'Add to favorites (F)'"
          :aria-pressed="fav"
          @click.stop="$emit('fav')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"
                  stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
        </button>
      </span>
    </header>

    <div class="body">
      <!-- front -->
      <div class="front">
        <div v-if="dir === 'je'" class="jp" lang="ja">{{ word.jp }}</div>
        <template v-else>
          <div class="en">{{ word.en }}</div>
          <div v-if="word.pos" class="pos">{{ word.pos }}</div>
        </template>
      </div>

      <!-- back -->
      <div class="back">
        <span class="rule"></span>
        <template v-if="dir === 'je'">
          <div class="ro">{{ word.ro }}</div>
          <div class="en sm">{{ word.en }}</div>
          <div v-if="word.pos" class="pos">{{ word.pos }}</div>
        </template>
        <template v-else>
          <div class="jp sm" lang="ja">{{ word.jp }}</div>
          <div class="ro">{{ word.ro }}</div>
        </template>
      </div>
    </div>

    <footer class="hint">Tap to reveal</footer>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  padding: clamp(20px, 2.2vw, 30px) clamp(22px, 2.6vw, 36px);
  background: var(--surface);
  border-radius: var(--r-card);
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  transition: background .3s var(--ease);
}
.card::after {
  /* soft bloom once the answer is revealed */
  content: ""; position: absolute; inset: auto -20% -60% -20%; height: 80%;
  background: radial-gradient(closest-side, rgba(201, 189, 245, .07), transparent);
  opacity: 0; transition: opacity .5s var(--ease); pointer-events: none;
}
.card.flipped::after { opacity: 1; }
.card:hover { background: #211c2a; }

.top {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 10px;
  font-size: 12px;
  color: var(--faint);
}
.num {
  font-size: 13px; font-weight: 700; color: var(--text);
  font-variant-numeric: tabular-nums;
  background: var(--surface-2); border-radius: 999px; padding: 4px 11px;
}
.cat { font-size: 12.5px; font-weight: 500; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.right { margin-left: auto; display: inline-flex; align-items: center; gap: 10px; }
.star {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px;
  background: var(--surface-2); border: 0; border-radius: 50%;
  color: var(--muted); cursor: pointer;
  transition: color .2s var(--ease), background .2s var(--ease), transform .2s var(--spring);
}
.star path { fill: transparent; transition: fill .2s var(--ease); }
.star:hover { color: var(--text); background: var(--surface-3); }
.star:active { transform: scale(.88); }
.star.on { color: var(--accent-ink); background: var(--accent); }
.star.on path { fill: var(--accent-ink); }
.dots { display: inline-flex; gap: 4px; padding: 7px 10px; background: var(--surface-2); border-radius: 999px; }
.dots i { width: 14px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .14); transition: background .3s var(--ease); }
.dots i.f { background: var(--accent); }
.mastered {
  height: 28px; padding: 0 12px; display: inline-flex; align-items: center;
  border-radius: 999px; background: var(--accent); color: var(--accent-ink);
  font-size: 11.5px; font-weight: 700;
}

.body {
  position: relative; z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px 4px;
}
.front, .back { display: flex; flex-direction: column; align-items: center; }

.back {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity .35s var(--ease), transform .45s var(--spring);
  pointer-events: none;
}
.flipped .back { opacity: 1; transform: none; }

.rule { width: 36px; height: 4px; border-radius: 2px; background: var(--accent); margin: 26px 0 22px; }

.jp {
  font-size: clamp(56px, 7.4vw, 120px);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: .01em;
  word-break: keep-all;
}
.jp.sm { font-size: clamp(42px, 4.8vw, 80px); }

.en {
  font-size: clamp(26px, 3vw, 46px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -.035em;
  max-width: 24ch;
  text-wrap: balance;
}
.en.sm { font-size: clamp(20px, 2vw, 30px); margin-top: 6px; letter-spacing: -.025em; }

.ro {
  font-size: clamp(15px, 1.3vw, 19px);
  font-weight: 500;
  color: var(--muted);
  letter-spacing: .02em;
  margin-top: 6px;
}
.back > .ro:first-of-type { margin-top: 0; }

.pos {
  margin-top: 18px;
  font-size: 12px; font-weight: 600;
  color: var(--muted);
  padding: 5px 13px;
  background: var(--surface-2);
  border-radius: 999px;
}

.hint {
  position: relative; z-index: 1;
  align-self: center;
  font-size: 12px; font-weight: 500;
  color: var(--faint);
  transition: opacity .25s var(--ease);
}
.flipped .hint { opacity: 0; }

@media (max-width: 480px) {
  .card { min-height: 340px; }
}
</style>
