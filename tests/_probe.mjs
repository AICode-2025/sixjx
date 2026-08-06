import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/engine/ParserService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const text = fs.readFileSync(path.join(root, '六.txt'), 'utf8')
const lines = text.split(/\r?\n/)

// 区间 L705-L725 逐段测试
for (let start = 704; start <= 714; start++) {
  const seg = lines.slice(start, 722).join('\n')
  const r = parse(seg)
  const bad = r.errors.filter(e => e.line >= 712 && e.line <= 722).length
  const nan = r.items.filter(i => !isFinite(i.total_amount)).length
  console.log(`start=${start + 1} (L${start + 1}) -> bad712-722=${bad} nan=${nan} items=${r.items.length}`)
}
console.log('---')
// 单独 L709-L714
for (const [a, b] of [[708, 712], [708, 713], [708, 714], [708, 715], [708, 720]]) {
  const seg = lines.slice(a, b).join('\n')
  const r = parse(seg)
  console.log(`L${a + 1}-L${b}:`, JSON.stringify(r.errors.map(e => 'L' + e.line + ':' + e.message)))
}
