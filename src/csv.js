// Parses a vocab CSV with columns: japanese, romaji, english_meaning, category, part_of_speech
export function parseCSV(text) {
  const rows = []
  let row = [], cur = '', q = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }

  const head = rows.shift().map(h => h.trim().toLowerCase())
  const idx = n => head.findIndex(h => h.includes(n))
  const iJ = idx('japanese'), iR = idx('romaji'), iE = idx('english'), iC = idx('category'), iP = idx('part')

  return rows
    .filter(r => r.length > 1 && r[iJ] && r[iJ].trim())
    .map(r => ({
      jp: r[iJ].trim(),
      ro: (r[iR] || '').trim(),
      en: (r[iE] || '').trim(),
      cat: iC >= 0 ? (r[iC] || '').trim() : '',
      pos: iP >= 0 ? (r[iP] || '').trim() : ''
    }))
}
