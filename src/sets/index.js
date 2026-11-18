import { parseCSV } from '../csv.js'

/*
  HOW TO ADD A SET
  1. Drop the CSV into this folder (src/sets/). Name it with "set_NN", e.g. jlpt_n3_vocabulary_set_02.csv
     Columns: japanese, romaji, english_meaning, category, part_of_speech
  2. (Optional) Give it a title below. Without one, a title is made from its categories.
*/
const META = {
  1: {
    title: 'Everyday Life & Communication',
    jp: '日常と会話',
    blurb: 'Errands, shopping and daily routines, the words that carry a conversation, work and study vocabulary, and core abstract nouns.'
  }
}

const files = import.meta.glob('./*.csv', { query: '?raw', import: 'default', eager: true })

export const sets = Object.entries(files)
  .map(([path, text]) => {
    const file = path.split('/').pop()
    const num = parseInt((file.match(/set[_-]?(\d+)/i) || [])[1]) || 0
    const lvl = file.match(/n([1-5])/i)
    const words = parseCSV(text)

    const counts = {}
    for (const w of words) if (w.cat) counts[w.cat] = (counts[w.cat] || 0) + 1
    const categories = Object.entries(counts).map(([name, count]) => ({ name, count }))

    const meta = META[num] || {}
    return {
      id: String(num).padStart(2, '0'),
      num,
      file,
      level: lvl ? `JLPT N${lvl[1]}` : 'Vocabulary',
      title: meta.title || categories.slice(0, 2).map(c => c.name).join(' & ') || `Set ${num}`,
      jp: meta.jp || '',
      blurb: meta.blurb || '',
      words,
      categories
    }
  })
  .sort((a, b) => a.num - b.num)
