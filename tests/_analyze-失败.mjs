import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/engine/ParserService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const text = fs.readFileSync(path.join(root, '六.txt'), 'utf8')
const lines = text.split(/\r?\n/).map(l => l.trim())

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
  return [...'鼠牛虎兔龙蛇马羊猴鸡狗猪'].some(z => l.includes(z))
}

// 收集完全失败行
const fails = []
lines.forEach((l, idx) => {
  if (isControlLine(l)) return
  if (!looksLikeBet(l)) return
  const r = parse(l)
  if (r.errors.length > 0 && r.items.length === 0) {
    fails.push({ line: idx + 1, text: l, err: r.errors.map(e => e.message) })
  }
})

function categorize(f) {
  const err = f.err.join(';')
  const tailMatch = err.match(/后出现"([^"]*)"/)
  const tail = tailMatch ? tailMatch[1] : ''
  if (err.includes('类型关键字冲突')) return 'E. 香港/澳门地域冲突'
  if (err.includes('存在歧义')) {
    if (/总\d+/.test(tail) || /斤|米/.test(tail)) return 'B. 金额+单位+合计尾随(斤/米+总N)'
    if (tail.includes('-')) return 'C. 连字符多注拆分(-各N-…-)'
    if (/^(冷|男|女|奥|香|门|。)/.test(tail)) return 'D. 尾随单字/地域简写'
    return 'F. 其他拆分歧义'
  }
  if (err.includes('无法从下一行继承金额')) return 'A. 纯数字列表无金额标记'
  if (err.includes('未能提取到有效号码')) {
    if (/红|蓝|绿/.test(f.text)) return 'G. 双色组合交集为空(红蓝/红绿/蓝绿)'
    return 'H. 无有效号码(分类词/占位行)'
  }
  if (err.includes('未能识别到金额')) return 'I. 未识别到金额'
  return 'Z. 其他'
}

const groups = {}
for (const f of fails) {
  const c = categorize(f)
  ;(groups[c] = groups[c] || []).push(f)
}

const orderMap = ['A. 纯数字列表无金额标记', 'B. 金额+单位+合计尾随(斤/米+总N)', 'C. 连字符多注拆分(-各N-…-)', 'D. 尾随单字/地域简写', 'E. 香港/澳门地域冲突', 'F. 其他拆分歧义', 'G. 双色组合交集为空(红蓝/红绿/蓝绿)', 'H. 无有效号码(分类词/占位行)', 'I. 未识别到金额', 'Z. 其他']
const order = orderMap.filter(c => groups[c]).concat(Object.keys(groups).filter(c => !orderMap.includes(c)))

let out = ''
out += '===== 六.txt 完全失败案例详细清单（72 条） =====\n'
out += `共 ${fails.length} 条完全失败（无任何 items 产出）\n\n`

let n = 0
for (const c of order) {
  const list = groups[c]
  out += `\n════════════════════════════════════════\n`
  out += `【${c}】 ${list.length} 条\n`
  out += `════════════════════════════════════════\n`
  for (const f of list) {
    n++
    out += `  [${n}] L${f.line} | ${f.text}\n`
    for (const e of f.err) out += `      → ${e}\n`
  }
}

out += `\n\n===== 分类汇总 =====\n`
for (const c of order) out += `  ${c}: ${groups[c].length} 条\n`

fs.writeFileSync(path.join(root, '六-失败案例清单.txt'), out, 'utf8')
console.log(`已写入：${path.join(root, '六-失败案例清单.txt')}（共 ${fails.length} 条失败）`)
console.log('\n===== 分类汇总 =====')
for (const c of order) console.log(`  ${c}: ${groups[c].length} 条`)
