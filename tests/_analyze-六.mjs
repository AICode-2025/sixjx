import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/engine/ParserService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const text = fs.readFileSync(path.join(root, '六.txt'), 'utf8')
const lines = text.split(/\r?\n/).map(l => l.trim())

const ZODIACS = '鼠牛虎兔龙蛇马羊猴鸡狗猪'
const CLASS_KW = /大|小|单|双|波|野|家禽|野兽|小数|合数|头|尾|岁|门|红|蓝|绿/

function isControlLine(l) {
  if (!l) return true
  if (l === '清' || l === '群数据清空成功' || l.startsWith('时间:') || l.includes('────────────') || l.includes('~~~~~~~分割线')) return true
  if (/^[-+]\d+(\.\d+)?\s*(【撤回不计入】)?$/.test(l)) return true
  if (l === '消息已撤回，已标记不计入') return true
  if (l.startsWith('@')) return true
  return false
}

function looksLikeBet(l) {
  if (/\d/.test(l)) return true
  return [...ZODIACS].some(z => l.includes(z))
}

function classify(l) {
  if (/二中二|三中二|三中三|连肖|平特/.test(l)) return '组合/生肖玩法'
  if (/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(l)) return '生肖'
  if (CLASS_KW.test(l)) return '分类(大小单双波尾头岁门)'
  if (/=\d/.test(l)) return '等号格式'
  if (/\/\d/.test(l)) return '斜杠格式'
  if (/\*/.test(l)) return '星号格式'
  return '纯数字'
}

const report = { total: 0, full: 0, partial: 0, failed: 0, empty: 0 }
const byGroup = {}
const failures = []
const partials = []

lines.forEach((l, idx) => {
  if (isControlLine(l)) return
  if (!looksLikeBet(l)) return
  report.total++
  const g = classify(l)
  byGroup[g] = byGroup[g] || { total: 0, full: 0, partial: 0, failed: 0, empty: 0 }
  byGroup[g].total++

  const r = parse(l)
  const ok = r.errors.length === 0 && r.items.length > 0
  const hasItems = r.items.length > 0
  if (ok) { report.full++; byGroup[g].full++ }
  else if (r.errors.length > 0 && hasItems) { report.partial++; byGroup[g].partial++; partials.push({ line: idx + 1, text: l, items: r.items.length, err: r.errors.map(e => e.message).slice(0, 2) }) }
  else if (r.errors.length > 0) { report.failed++; byGroup[g].failed++; failures.push({ line: idx + 1, text: l, err: r.errors.map(e => e.message).slice(0, 3) }) }
  else { report.empty++; byGroup[g].empty++ }
})

const lines2 = Object.entries(byGroup).sort((a, b) => b[1].total - a[1].total)
const pct = n => (report.total ? ((n / report.total) * 100).toFixed(1) : '0') + '%'

// 失败原因类别统计（按 error 消息归类）
const errTypes = {}
const typeOf = (msgs) => {
  const joined = msgs.join(';')
  if (joined.includes('存在歧义')) return '金额后尾随标点/单位/词 → 歧义拦截'
  if (joined.includes('未能提取到有效号码')) return '无号码(分类词/纯金额行)'
  if (joined.includes('未能识别到金额')) return '无金额标记(斜杠/中文金额/特殊格式)'
  if (joined.includes('无法从下一行继承金额')) return '拆行继承失败'
  if (joined.includes('类型关键字冲突')) return '香/澳地域冲突'
  return '其他'
}
const tally = (list, kf) => {
  list.forEach(f => {
    const t = kf(f)
    errTypes[t] = errTypes[t] || 0
    errTypes[t]++
  })
}
tally(failures, f => typeOf(f.err))
tally(partials, f => typeOf(f.err))

let out = ''
out += `===== 六.txt 解析统计（${lines.length} 行原始 → ${report.total} 行报单） =====\n\n`
out += `完整成功(errs=0 且 items>0): ${report.full}  ${pct(report.full)}\n`
out += `部分成功(errs>0 但有 items): ${report.partial}  ${pct(report.partial)}\n`
out += `完全失败(errs>0 无 items): ${report.failed}  ${pct(report.failed)}\n`
out += `空结果(无errs无items): ${report.empty}  ${pct(report.empty)}\n`
out += `综合成功率: ${pct(report.full + report.partial)}\n\n`

out += '----- 失败原因类别分布（失败177 + 部分51 = 228） -----\n'
const errSorted = Object.entries(errTypes).sort((a, b) => b[1] - a[1])
for (const [t, n] of errSorted) {
  out += `${n.toString().padStart(4)}  ${t}\n`
}
out += '\n'

out += '----- 按格式分组 -----\n'
for (const [g, s] of lines2) {
  out += `${g.padEnd(16)} 总${s.total}  成功${s.full}  部分${s.partial}  失败${s.failed}  空${s.empty}\n`
}

out += `\n===== 完全失败样例清单（${failures.length} 条） =====\n`
failures.slice(0, 120).forEach(f => {
  out += `L${f.line} | ${f.text.slice(0, 70)}\n        → ${f.err.join('; ')}\n`
})
if (failures.length > 120) out += `… 共 ${failures.length} 条，其余略\n`

out += `\n===== 部分成功样例（${partials.length} 条） =====\n`
partials.slice(0, 60).forEach(f => {
  out += `L${f.line} | ${f.text.slice(0, 70)}\n        → items=${f.items}; ${f.err.join('; ')}\n`
})
if (partials.length > 60) out += `… 共 ${partials.length} 条，其余略\n`

fs.writeFileSync(path.join(root, '六-解析分析.txt'), out, 'utf8')
console.log(out.slice(0, 2600))
console.log(`\n[完整清单已写入] ${path.join(root, '六-解析分析.txt')}`)
