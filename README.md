# N3 Vocab — Japanese flashcards

Minimal dark flashcards for JLPT N3 vocabulary. Built with Vue 3 + Vite.

- **Learn**: flip through cards, no grading
- **Practice**: Know / Don't know; a word is mastered after 3 "Know"s
- Japanese → English or English → Japanese, with a word-number range
- ★ Favorites, practiced separately with their own range
- **Timers**
  - Learn: a stopwatch times each range you learn (a "part"); the set's total learning time is the sum of its parts.
    It pauses when the tab is hidden or after 2 idle minutes.
  - Practice: pick a countdown (2 / 5 / 10 / 15 min) for a speed round; it starts on the first reveal, `P` pauses,
    and you get answered / known / missed / seconds-per-card at the end.
- Progress syncs between computers through a private GitHub gist

## Run locally

```
npm install
npm run dev
```

## Add a new set

1. Put the CSV in `src/sets/` with `set_NN` in the name, e.g. `jlpt_n3_vocabulary_set_02.csv`
   (columns: `japanese,romaji,english_meaning,category,part_of_speech`).
2. Optionally add a title for it in `src/sets/index.js`.

## Sync between computers

Click **Sync off** (top right) → create a GitHub token with only the `gist` scope → paste it.
Do the same on each computer. Progress, favorites, learning times and range settings are stored in a private
gist called `n3-vocab-sync` on your account. The token stays in that browser only.

## Deploy

Every push to `main` builds and publishes to GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).
