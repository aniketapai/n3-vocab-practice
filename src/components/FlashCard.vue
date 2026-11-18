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
  min-height: 380px;
  display: flex;
  flex-direction: column;
  padding: clamp(18px, 2vw, 28px) clamp(20px, 2.4vw, 34px);
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, .03) inset,
    0 30px 60px -30px rgba(0, 0, 0, .6);
  cursor: pointer;
  user-select: none;
  transition: border-color .25s var(--ease);
}
.card:hover { border-color: var(--line-strong); }

.top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  font-size: 11px;
  color: var(--faint);
  letter-spacing: .06em;
}
.num { font-variant-numeric: tabular-nums; }
.cat { text-transform: uppercase; letter-spacing: .14em; font-size: 10px; }
.right { justify-self: end; display: inline-flex; align-items: center; gap: 12px; }
.star {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; margin: -7px -8px -7px 0;
  background: none; border: 0; border-radius: 9px;
  color: var(--faint); cursor: pointer;
  transition: color .2s var(--ease), background .2s var(--ease);
}
.star path { fill: transparent; transition: fill .2s var(--ease); }
.star:hover { color: var(--text); background: var(--line); }
.star.on { color: var(--accent); }
.star.on path { fill: var(--accent); }
.dots { display: inline-flex; gap: 5px; }
.dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--line-strong); transition: background .3s var(--ease); }
.dots i.f { background: var(--accent); }
.mastered { color: var(--accent); text-transform: uppercase; letter-spacing: .14em; font-size: 10px; }

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px 4px;
}
.front, .back { display: flex; flex-direction: column; align-items: center; }

.back {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity .35s var(--ease), transform .35s var(--ease);
  pointer-events: none;
}
.flipped .back { opacity: 1; transform: none; }

.rule { width: 28px; height: 1px; background: var(--line-strong); margin: 26px 0 22px; }

.jp {
  font-size: clamp(52px, 7vw, 112px);
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: .02em;
  word-break: keep-all;
}
.jp.sm { font-size: clamp(40px, 4.6vw, 76px); }

.en {
  font-size: clamp(22px, 2.6vw, 40px);
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -.01em;
  max-width: 28ch;
  text-wrap: balance;
}
.en.sm { font-size: clamp(18px, 1.8vw, 28px); margin-top: 4px; }

.ro {
  font-size: clamp(15px, 1.3vw, 20px);
  font-weight: 300;
  color: var(--muted);
  letter-spacing: .04em;
  margin-top: 6px;
}
.back > .ro:first-of-type { margin-top: 0; }

.pos {
  margin-top: 16px;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: .04em;
  padding: 3px 11px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--faint);
  letter-spacing: .04em;
  transition: opacity .25s var(--ease);
}
.flipped .hint { opacity: 0; }

@media (max-width: 480px) {
  .card { min-height: 340px; }
}
</style>
