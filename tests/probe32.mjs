/**
 * 缺陷修复验证脚本（32 组构造用例）
 * 覆盖《代码改动缺陷风险报告》12 条缺陷 + 3 个担忧点，验证修复是否彻底。
 *
 * 运行：node tests/probe32.mjs   （或 npm run probe32）
 * 说明：本文件不参与 vitest 收集（文件名不含 .test/.spec），仅供手动回归。
 */
import { parse } from '../../src/engine/ParserService.js'

// ---------- 微型断言 ----------
let passed = 0
let failed = 0
let info = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, message: e.message })
    console.log(`  [FAIL] ${name}\n         → ${e.message}`)
  }
}

// 记录性验证：缺陷已确认但修复待业务确认（五行 39 归属）
function checkInfo(name, fn) {
  try {
    fn()
    info++
    console.log(`  [INFO] ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, message: e.message })
    console.log(`  [FAIL] ${name}\n         → ${e.message}`)
  }
}

const toEqual = (actual, expected) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`期望 ${b}，实际 ${a}`)
}
const isTrue = (v, msg = '') => { if (!v) throw new Error(msg || '断言为真失败') }
const notThrow = (fn) => { try { fn() } catch (e) { throw new Error(`不应抛出异常：${e.message}`) } }

// ============================================================
// #1 P0 多注行拆分：保留玩法前缀与前置号码
// ============================================================
console.log('\n#1 P0 多注行拆分（玩法前缀/前置号码不丢失）')
check('平01=10 07=20 → 2 个平（前缀保留，赔率 7）', () => {
  const res = parse('平01=10 07=20')
  toEqual(res.items.length, 2)
  isTrue(res.items.every(i => i.play_type === '平'), 'play_type 应为平')
  toEqual(res.items[0].amount_per_bet, 10)
  toEqual(res.items[1].amount_per_bet, 20)
  toEqual(res.items[0].odds, 7)
})
check('01 02 07=10 08=20 → 前置号码保留（3注+1注）', () => {
  const res = parse('01 02 07=10 08=20')
  toEqual(res.items.length, 2)
  toEqual(res.items[0].numbers, [1, 2, 7])
  toEqual(res.items[0].total_amount, 30)
  toEqual(res.items[1].numbers, [8])
  toEqual(res.items[1].amount_per_bet, 20)
})
check('二中二01=10 02=10 03=20 → 报号码不足，不静默变特', () => {
  const res = parse('二中二01=10 02=10 03=20')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('不足')), '应报号码不足')
})
check('特01=10 02=20（无前缀默认特）→ 2 个特', () => {
  const res = parse('01=10 02=20')
  toEqual(res.items.length, 2)
  isTrue(res.items.every(i => i.play_type === '特'), 'play_type 应为特')
  toEqual(res.items[0].amount_per_bet, 10)
  toEqual(res.items[1].amount_per_bet, 20)
})

// ============================================================
// #2 P1 超界号码：明确报错，不静默删号
// ============================================================
console.log('\n#2 P1 超界号码')
check('01 50 各10 → 报「号码必须在01-49之间」', () => {
  const res = parse('01 50 各10')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('号码必须在01-49之间') && e.message.includes('50')), '应报超界号码 50')
})
check('37-300各10 → 范围展开超界报错（不截断成13注）', () => {
  const res = parse('37-300各10')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('号码必须在01-49之间')), '应报超界')
})

// ============================================================
// #3 P1 总额模式：非整除明确报错，总额不漂移
// ============================================================
console.log('\n#3 P1 总额模式非整除')
check('鼠蛇总100 → 报「无法平均分摊」（不再 104）', () => {
  const res = parse('鼠蛇总100')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('无法平均分摊')), '应报无法分摊')
})
check('7码二中二 总100 → 报「无法平均分摊」（不再 105）', () => {
  const res = parse('01 02 03 04 05 06 07 二中二 总100')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('无法平均分摊')), '应报无法分摊')
})
check('01 02 共50 → 整除仍正常（各25元）', () => {
  const res = parse('01 02 共50')
  toEqual(res.items.length, 1)
  toEqual(res.items[0].amount_per_bet, 25)
  toEqual(res.items[0].total_amount, 50)
})

// ============================================================
// #4 P1 双色并集 + 组合玩法：拆成各色独立一笔
// ============================================================
console.log('\n#4 P1 双色并集组合玩法')
check('红蓝二中二各50 → 拆 2 笔（256注 12800元）', () => {
  const res = parse('红蓝二中二各50')
  toEqual(res.items.length, 2)
  const cnt = res.items.reduce((s, i) => s + i.bet_count, 0)
  const amt = res.items.reduce((s, i) => s + i.total_amount, 0)
  toEqual(cnt, 256)
  toEqual(amt, 12800)
})
check('红蓝各50 → 特玩法并集 33 码（不拆分，行为不变）', () => {
  const res = parse('红蓝各50')
  toEqual(res.items.length, 1)
  toEqual(res.items[0].numbers.length, 33)
  toEqual(res.items[0].total_amount, 1650)
})

// ============================================================
// #5 P2 五行 39 重复归属（确认缺陷仍在，修复待业务对照表）
// ============================================================
console.log('\n#5 P2 五行 39 重复归属（记录性验证）')
checkInfo('木火各10 → 命中 [39]（39 同属木/火，缺陷确认存在，待业务提供权威对照表后修复）', () => {
  const res = parse('木火各10')
  toEqual(res.items.length, 1)
  toEqual(res.items[0].numbers, [39])
})

// ============================================================
// #6 P2 中文数字两位数+号
// ============================================================
console.log('\n#6 P2 中文数字两位数+号')
check('三十号10 → 号码 30', () => {
  const item = parse('三十号10').items[0]
  toEqual(item.numbers, [30])
  toEqual(item.amount_per_bet, 10)
})
check('十二号10 / 十五号10 → 12 / 15（不再错转十2号）', () => {
  toEqual(parse('十二号10').items[0].numbers, [12])
  toEqual(parse('十五号10').items[0].numbers, [15])
})

// ============================================================
// #7 P2 小数金额：按用户既定规则更正为整数并提醒（预期行为）
// ============================================================
console.log('\n#7 P2 小数金额（既定行为：更正为整数 + 提醒）')
check('01 02各1.5 → 2元/注 + warning（总额 4）', () => {
  const res = parse('01 02各1.5')
  toEqual(res.items[0].amount_per_bet, 2)
  toEqual(res.items[0].total_amount, 4)
  isTrue(res.warnings.some(w => w.message.includes('更正为整数')), '应有更正提醒')
})
check('01 02 12.5 → 13元/注 + warning（总额 26）', () => {
  const res = parse('01 02 12.5')
  toEqual(res.items[0].amount_per_bet, 13)
  toEqual(res.items[0].total_amount, 26)
  isTrue(res.warnings.some(w => w.message.includes('更正为整数')), '应有更正提醒')
})

// ============================================================
// #8 P2 总N 词序：仅行尾生效（业务确认不支持「号码+总N+玩法词」）
// ============================================================
console.log('\n#8 P2 总N 词序敏感（仅行尾）')
check('…总100 二中二 → 明确报错（不支持该词序）', () => {
  const res = parse('01 02 03 04 05 06 07 总100 二中二')
  toEqual(res.items.length, 0)
  isTrue(res.errors.length > 0, '应报错')
})
check('…二中二 总100 → 报「无法平均分摊」（非整除）', () => {
  const res = parse('01 02 03 04 05 06 07 二中二 总100')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('无法平均分摊')), '应报无法分摊')
})

// ============================================================
// #9 P3 parse() 空值保护
// ============================================================
console.log('\n#9 P3 入参空值保护')
check('parse(null) 不抛异常', () => {
  notThrow(() => parse(null))
  const res = parse(null)
  toEqual(res.items.length, 0)
  toEqual(res.errors.length, 0)
})
check('parse(undefined) 不抛异常', () => {
  notThrow(() => parse(undefined))
  toEqual(parse(undefined).items.length, 0)
})

// ============================================================
// #10 P3 赔率来源：客户端本地系数优先，未设置回退默认
// ============================================================
console.log('\n#10 P3 赔率注入（oddsMap）')
check('特用本地系数 50：parse("01 各10", 1, {1:50})', () => {
  toEqual(parse('01 各10', 1, { 1: 50 }).items[0].odds, 50)
})
check('三中三未设置 → 回退默认 700', () => {
  toEqual(parse('01 02 03 三中三各10', 1, { 1: 50 }).items[0].odds, 700)
})

// ============================================================
// #11 P3 连肖 item.numbers 置空（不暴露 0-11 生肖下标）
// ============================================================
console.log('\n#11 P3 连肖 numbers 契约')
check('二连肖 牛马 各10 → numbers=[]，zodiacs=[牛,马]', () => {
  const item = parse('二连肖 牛马 各10').items[0]
  toEqual(item.numbers, [])
  toEqual(item.zodiacs, ['牛', '马'])
  toEqual(item.zodiac_indices.length, 2)
})
check('平特一肖 牛 各10 → numbers=[]，zodiacs=[牛]', () => {
  const item = parse('平特一肖 牛 各10').items[0]
  toEqual(item.numbers, [])
  toEqual(item.zodiacs, ['牛'])
})

// ============================================================
// #12 P3 无金额行继承：向前回溯 + 跳过坏行 + 保留原金额
// ============================================================
console.log('\n#12 P3 金额继承')
check('01 02 各10\\n01 02 07 → 第2行向前回溯继承（总额 50）', () => {
  const res = parse('01 02 各10\n01 02 07')
  toEqual(res.items.length, 2)
  toEqual(res.total_amount, 50)
  isTrue(res.warnings.some(w => w.message.includes('继承')), '应有继承提醒')
})
check('01 02 07\\nabc\\n01 02 各10 → 跳过坏行向后继承（总额 50）', () => {
  const res = parse('01 02 07\nabc\n01 02 各10')
  toEqual(res.items.length, 2)
  toEqual(res.total_amount, 50)
  isTrue(res.warnings.some(w => w.message.includes('继承')), '应有继承提醒')
})
check('01 02 07\\n01 02 各10 → 向后继承（总额 50）', () => {
  const res = parse('01 02 07\n01 02 各10')
  toEqual(res.items.length, 2)
  toEqual(res.total_amount, 50)
})

// ============================================================
// 担忧点 1：「1-5」为范围语义（业务已确认）
// ============================================================
console.log('\n担忧点1 「-」范围语义（业务确认）')
check('1-5各10 → 5 注（1,2,3,4,5）', () => {
  const item = parse('1-5各10').items[0]
  toEqual(item.numbers, [1, 2, 3, 4, 5])
  toEqual(item.bet_count, 5)
  toEqual(item.total_amount, 50)
})

// ============================================================
// 担忧点 2：「3个号」组合词归一歧义 → 直接报错
// ============================================================
console.log('\n担忧点2 「3个号」组合词歧义')
check('3个号各10 → 报「金额标记组合存在歧义」', () => {
  const res = parse('3个号各10')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('金额标记组合存在歧义')), '应报歧义')
})
check('01 每注10 / 01 各注10 → 合法标记不受影响', () => {
  toEqual(parse('01 每注10').items[0].amount_per_bet, 10)
  toEqual(parse('01 各注10').items[0].amount_per_bet, 10)
})

// ============================================================
// 担忧点 3：并列对立属性 → 报互斥（业务确认）
// ============================================================
console.log('\n担忧点3 并列对立属性报互斥')
check('家禽野兽各10 → 报互斥分组', () => {
  const res = parse('家禽野兽各10')
  toEqual(res.items.length, 0)
  isTrue(res.errors.some(e => e.message.includes('互斥分组')), '应报互斥')
})
check('前肖后肖各10 / 单笔双笔各10 → 报互斥分组', () => {
  for (const t of ['前肖后肖各10', '单笔双笔各10']) {
    const res = parse(t)
    toEqual(res.items.length, 0)
    isTrue(res.errors.some(e => e.message.includes('互斥分组')), `应报互斥：${t}`)
  }
})
check('家禽各10 / 红蓝各50 → 单属性与波色并集不受影响', () => {
  isTrue(parse('家禽各10').items[0].numbers.length > 0, '家禽应正常')
  toEqual(parse('红蓝各50').items[0].numbers.length, 33)
})

// ============================================================
// 汇总
// ============================================================
console.log('\n==========================================')
console.log(`总用例：32  通过：${passed}  失败：${failed}  记录性：${info}`)
if (failed > 0) {
  console.log('\n失败明细：')
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`)
  process.exit(1)
}
console.log('全部通过。')
