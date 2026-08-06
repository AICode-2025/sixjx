/**
 * 全量回归测试（真实数据）
 * - 真实内置数据：results-2026.js（216 澳门 + 84 香港）
 * - 覆盖：数据完整性 / 解析 / 结算 / 同步金额口径 / 生肖年份映射
 * 运行：npm test（vitest run）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import resultsData from '../../src/data/results-2026.js'
import { parse } from '../../src/engine/ParserService.js'
import { settle } from '../../src/engine/SettlementEngine.js'
import { getZodiacByNumber } from '../../src/engine/ZodiacMapper.js'
import * as ref from '../../src/engine/ReferenceService.js'

// ============================================================
// 真实开奖数据（澳门 2026001 期）：特=29，平=[27,8,43,33,42,11]
// ============================================================
const MACAU_2026001 = resultsData['1'][0]
const SPECIAL = MACAU_2026001.special_number   // 29
const FLATS = [1, 2, 3, 4, 5, 6].map(i => MACAU_2026001['flat_number_' + i]) // [27,8,43,33,42,11]

const ODDS = { 1: 47, 2: 7, 3: 65, 4: 700, 7: 20, 5: 2, 6: 4, 8: 11, 9: 31, 10: 100 }

/** 与 src/engine/sync.js 同步上报金额一致的映射（修复后：整笔金额优先 total_amount） */
function syncAmount(item) {
  const perBet = parseFloat(item.amount_per_bet ?? item.amount ?? 0)
  const count = parseInt(item.bet_count ?? item.count ?? 1) || 1
  const itemAmount = (typeof item.total_amount === 'number' && isFinite(item.total_amount) && item.total_amount > 0)
    ? item.total_amount
    : perBet * count
  return Math.round(itemAmount * 100) / 100
}

function getItem(r, playTypeId) {
  const it = r.items.find(i => i.play_type_id === playTypeId)
  expect(it, `应能解析出玩法 id=${playTypeId}`).toBeTruthy()
  return it
}

// ============================================================
// A. 真实数据完整性
// ============================================================
describe('A. 真实内置数据完整性', () => {
  it('共 300 条：216 澳门 + 84 香港', () => {
    expect(resultsData['1'].length).toBe(216)
    expect(resultsData['2'].length).toBe(84)
  })

  it('全部号码均在 01-49 范围，且每期 7 个号码互不重复', () => {
    for (const lotteryId of ['1', '2']) {
      for (const r of resultsData[lotteryId]) {
        const nums = []
        for (let i = 1; i <= 6; i++) nums.push(Number(r['flat_number_' + i]))
        nums.push(Number(r.special_number))
        for (const n of nums) {
          expect(n).toBeGreaterThanOrEqual(1)
          expect(n).toBeLessThanOrEqual(49)
        }
        expect(new Set(nums).size).toBe(7)
      }
    }
  })

  it('澳门期号 = 年份 + 年积日（如 2026-08-04 → 2026216）', () => {
    for (const r of resultsData['1']) {
      const d = new Date(r.draw_date + 'T00:00:00')
      const start = new Date(d.getFullYear(), 0, 1)
      const doy = Math.floor((d - start) / 86400000) + 1
      expect(r.period_no).toBe(String(d.getFullYear() * 1000 + doy))
    }
  })

  it('香港期号唯一、日期严格递增', () => {
    const periods = resultsData['2']
    const seen = new Set()
    let prev = ''
    for (const r of periods) {
      expect(seen.has(r.period_no)).toBe(false)
      seen.add(r.period_no)
      expect(r.draw_date > prev).toBe(true)
      prev = r.draw_date
    }
  })
})

// ============================================================
// B. 解析回归（真实格式）
// ============================================================
describe('B. 解析回归（真实格式）', () => {
  it('特 多号一行各N元：01 02 03 各50 → 3注，总额150', () => {
    const r = parse('01 02 03 各50')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 1)
    expect(it.numbers).toEqual([1, 2, 3])
    expect(it.bet_count).toBe(3)
    expect(it.amount_per_bet).toBe(50)
    expect(it.total_amount).toBe(150)
  })

  it('特 等号格式：01=10 07=20 → 2 个单号 item', () => {
    const r = parse('01=10 07=20')
    expect(r.errors.length).toBe(0)
    expect(r.items.length).toBe(2)
    expect(r.items[0].numbers).toEqual([1])
    expect(r.items[0].total_amount).toBe(10)
    expect(r.items[1].numbers).toEqual([7])
    expect(r.items[1].total_amount).toBe(20)
  })

  it('平 玩法：27 08 平各10 → 2注，总额20', () => {
    const r = parse('27 08 平各10')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 2)
    expect(it.numbers).toEqual([8, 27])
    expect(it.bet_count).toBe(2)
    expect(it.total_amount).toBe(20)
  })

  it('【修复】平 关键字在金额之后（27 08 各10 平）→ 正确解析为平玩法，不再静默变特', () => {
    const r = parse('27 08 各10 平')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 2)
    expect(it.numbers).toEqual([8, 27])
    expect(it.bet_count).toBe(2)
    expect(it.total_amount).toBe(20)
  })

  it('【修复】组合玩法标注在金额之后（02 04 06 各10 二中二）→ 二中二玩法', () => {
    const r = parse('02 04 06 各10 二中二')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 3)
    expect(it.bet_count).toBe(3)
    expect(it.total_amount).toBe(30)
  })

  it('二中二：02 04 06 二中二各10 → C(3,2)=3注，总额30', () => {
    const r = parse('02 04 06 二中二各10')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 3)
    expect(it.bet_count).toBe(3)
    expect(it.total_amount).toBe(30)
  })

  it('三中三：01 02 03 04 三中三各5 → C(4,3)=4注，总额20', () => {
    const r = parse('01 02 03 04 三中三各5')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 4)
    expect(it.bet_count).toBe(4)
    expect(it.total_amount).toBe(20)
  })

  it('三中二：01 02 03 04 三中二各5 → C(4,3)=4注，总额20', () => {
    const r = parse('01 02 03 04 三中二各5')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 7)
    expect(it.bet_count).toBe(4)
    expect(it.total_amount).toBe(20)
  })

  it('复式三中三：01 02 03 04 复式三中三各5 → 4注，总额20', () => {
    const r = parse('01 02 03 04 复式三中三各5')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 4)
    expect(it.bet_count).toBe(4)
    expect(it.total_amount).toBe(20)
  })

  it('平特一肖：狗 平特一肖各10 → 1注', () => {
    const r = parse('狗 平特一肖各10')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 5)
    expect(it.zodiacs).toEqual(['狗'])
    expect(it.total_amount).toBe(10)
  })

  it('二连肖：鼠 牛 二连肖各10 → 1注', () => {
    const r = parse('鼠 牛 二连肖各10')
    expect(r.errors.length).toBe(0)
    const it = getItem(r, 6)
    expect(it.zodiacs).toEqual(['鼠', '牛'])
    expect(it.total_amount).toBe(10)
  })

  it('三连肖/四连肖/五连肖：生肖数量必须恰好', () => {
    expect(parse('鼠 牛 猴 三连肖各10').items[0].play_type_id).toBe(8)
    expect(parse('鼠 牛 猴 虎 四连肖各10').items[0].play_type_id).toBe(9)
    expect(parse('鼠 牛 猴 虎 狗 五连肖各10').items[0].play_type_id).toBe(10)
    const r = parse('鼠 牛 三连肖各10')
    expect(r.items.length).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('波色/大小/单双 → 归类为特玩法', () => {
    expect(getItem(parse('红波 各20'), 1).numbers.length).toBeGreaterThan(0)
    expect(getItem(parse('大 各30'), 1).numbers.length).toBe(25)
    expect(getItem(parse('单 各15'), 1).numbers.length).toBe(25) // 1-49 共 25 个奇数
    expect(getItem(parse('小 各10'), 1).numbers.length).toBe(24)
  })

  it('金额继承：01 02 07 + 下一行 01 02 各10 → 第1行继承10(3注30) + 第2行独立(2注20)，总额50', () => {
    const r = parse('01 02 07\n01 02 各10')
    expect(r.errors.length).toBe(0)
    expect(r.items.length).toBe(2)
    expect(r.total_amount).toBe(50)
    expect(r.warnings.length).toBe(1)
    expect(r.items[0].bet_count).toBe(3)
    expect(r.items[0].total_amount).toBe(30)
    expect(r.items[1].total_amount).toBe(20)
  })

  it('【修复】金额单独一行合并：01 02 07\\n各50 → 3注×50=150，无残留报错', () => {
    const r = parse('01 02 07\n各50')
    expect(r.errors.length).toBe(0)
    expect(r.items.length).toBe(1)
    expect(r.items[0].bet_count).toBe(3)
    expect(r.items[0].total_amount).toBe(150)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('金额后缀：01 各10元 → 金额10（可解析）', () => {
    const r = parse('01 各10元')
    expect(r.errors.length).toBe(0)
    expect(r.items[0].amount_per_bet).toBe(10)
  })

  it('【修复】01 各10块 → 金额10（元/块单位一致，不再报歧义）', () => {
    const r = parse('01 各10块')
    expect(r.errors.length).toBe(0)
    expect(r.items[0].amount_per_bet).toBe(10)
  })

  it('无玩法标注 → 默认特', () => {
    expect(parse('01 02 各10').items[0].play_type_id).toBe(1)
  })

  it('错误输入：无效号码/重复/组合号码不足/敏感词', () => {
    expect(parse('00 各10').errors.length).toBeGreaterThan(0)
    expect(parse('50 各10').errors.length).toBeGreaterThan(0)
    expect(parse('01 二中二各10').errors.length).toBeGreaterThan(0)
    expect(parse('赌博 各10').errors.length).toBeGreaterThan(0)
    expect(parse('香港 澳门 01 各10').errors.length).toBeGreaterThan(0)
  })

  it('重复号码去重：01 01 各10 → 仅 1 个号码', () => {
    const r = parse('01 01 各10')
    expect(r.errors.length).toBe(0)
    expect(r.items[0].numbers).toEqual([1])
    expect(r.items[0].total_amount).toBe(10)
  })

  it('组合玩法 注数 = C(n,k)，与单注金额一致', () => {
    // 一致性：平/特 的 bet_count 必须等于 numbers.length，否则结算与同步口径会分叉
    const r = parse('01 02 03 各10\n平 05 06 各20\n02 04 06 二中二各10\n01 02 03 04 三中三各5\n01 02 03 三中二各5')
    expect(r.errors.length).toBe(0)
    for (const it of r.items) {
      expect(it.total_amount).toBe(it.bet_count * it.amount_per_bet)
      if (it.play_type_id === 1 || it.play_type_id === 2) {
        expect(it.bet_count).toBe(it.numbers.length)
      }
    }
  })
})

// ============================================================
// C. 结算回归（真实开奖：澳门 2026001，特29 平[27,8,43,33,42,11]）
// ============================================================
describe('C. 结算回归（真实开奖数据）', () => {
  it('特：命中特码 29 → 10×47=470；未中 30 → 0', () => {
    const win = settle(parse('29 各10').items, SPECIAL, FLATS)[0]
    expect(win.is_win).toBe(true)
    expect(win.payout).toBe(10 * ODDS[1])
    expect(win.profit_loss).toBe(10 * ODDS[1] - 10)
    const lose = settle(parse('30 各10').items, SPECIAL, FLATS)[0]
    expect(lose.is_win).toBe(false)
    expect(lose.payout).toBe(0)
  })

  it('特：仅比对特码，平码 27 不算中特', () => {
    const r = settle(parse('27 28 各10').items, SPECIAL, FLATS)[0]
    expect(r.is_win).toBe(false)
    expect(r.profit_loss).toBe(-20)
  })

  it('平：27∈平 → 70；29（特码）不计入平', () => {
    const hit = settle(parse('27 平各10').items, SPECIAL, FLATS)[0]
    expect(hit.is_win).toBe(true)
    expect(hit.payout).toBe(10 * ODDS[2])
    const miss = settle(parse('29 平各10').items, SPECIAL, FLATS)[0]
    expect(miss.is_win).toBe(false)
    expect(miss.payout).toBe(0)
  })

  it('平：多号全命中 → 每号一注', () => {
    const r = settle(parse('27 08 平各10').items, SPECIAL, FLATS)[0]
    expect(r.is_win).toBe(true)
    expect(r.payout).toBe(20 * ODDS[2])
    expect(r.profit_loss).toBe(20 * ODDS[2] - 20)
  })

  it('二中二：27,08,10 → 仅(27,8)中 → 1注×65', () => {
    const r = settle(parse('27 08 10 二中二各10').items, SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(1)
    expect(r.payout).toBe(10 * ODDS[3])
    expect(r.profit_loss).toBe(10 * ODDS[3] - 30)
  })

  it('三中三：27,08,43 全在平 → 1注×700', () => {
    const r = settle(parse('27 08 43 三中三各10').items, SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(1)
    expect(r.payout).toBe(10 * ODDS[4])
  })

  it('三中二：恰好2个在平（27,08,10）→ 1注×20', () => {
    const r = settle(parse('27 08 10 三中二各10').items, SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(1)
    expect(r.natural_sanzhongsan_count).toBe(0)
    expect(r.payout).toBe(10 * ODDS[7])
  })

  it('三中二：3个全在平（27,08,43）→ 仅自然三中三 100倍，不叠加三中二', () => {
    const r = settle(parse('27 08 43 三中二各10').items, SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(0)
    expect(r.natural_sanzhongsan_count).toBe(1)
    expect(r.payout).toBe(10 * 100)
  })

  it('三中二：4码 27,08,43,03 → 3个三中二 + 1个自然三中三', () => {
    const r = settle(parse('27 08 43 03 三中二各5').items, SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(3)
    expect(r.natural_sanzhongsan_count).toBe(1)
    expect(r.payout).toBe(3 * 5 * ODDS[7] + 5 * 100)
    expect(r.profit_loss).toBe(3 * 5 * ODDS[7] + 5 * 100 - 20)
  })

  it('平特一肖：狗（仅特码29）→ 命中；羊 → 不中', () => {
    const hit = settle(parse('狗 平特一肖各10').items, SPECIAL, FLATS)[0]
    expect(hit.is_win).toBe(true)
    expect(hit.payout).toBe(10 * ODDS[5])
    const miss = settle(parse('羊 平特一肖各10').items, SPECIAL, FLATS)[0]
    expect(miss.is_win).toBe(false)
  })

  it('连肖：二/三/四/五连肖 全部命中', () => {
    expect(settle(parse('鼠 牛 二连肖各10').items, SPECIAL, FLATS)[0].payout).toBe(10 * ODDS[6])
    expect(settle(parse('鼠 牛 猴 三连肖各10').items, SPECIAL, FLATS)[0].payout).toBe(10 * ODDS[8])
    expect(settle(parse('鼠 牛 猴 虎 四连肖各10').items, SPECIAL, FLATS)[0].payout).toBe(10 * ODDS[9])
    expect(settle(parse('鼠 牛 猴 虎 狗 五连肖各10').items, SPECIAL, FLATS)[0].payout).toBe(10 * ODDS[10])
  })

  it('批量结算：Σtotal_bet == Σitem.total_amount，盈亏一致', () => {
    const order = parse('29 各10\n平 27 08 各10\n27 08 10 二中二各10\n27 08 43 三中二各10\n狗 平特一肖各10')
    expect(order.errors.length).toBe(0)
    const results = settle(order.items, SPECIAL, FLATS)
    let bet = 0
    let payout = 0
    for (const r of results) {
      bet += r.amount_per_bet * r.bet_count
      payout += r.payout
      expect(r.profit_loss).toBe(r.payout - r.amount_per_bet * r.bet_count)
    }
    expect(bet).toBe(order.total_amount)
    expect(payout).toBeGreaterThan(0)
  })
})

// ============================================================
// D. 同步金额口径回归（P1-1 修复验证）
// ============================================================
describe('D. 同步金额口径（P1-1 修复验证）', () => {
  it('同步上报金额 == item.total_amount（整笔），非单注金额', () => {
    const r = parse('香港\n01 02 03 各50\n平 05 06 各20\n02 04 06 二中二各10\n01 02 03 04 三中三各5\n27 08 10 三中二各10\n狗 平特一肖各20\n鼠 牛 二连肖各10\n大 各30\n红波 各20', 2)
    expect(r.errors.length).toBe(0)
    let synced = 0
    for (const it of r.items) {
      expect(syncAmount(it)).toBe(it.total_amount)
      synced += syncAmount(it)
    }
    expect(synced).toBe(r.total_amount)
  })

  it('旧逻辑（amount_per_bet）会低估的组合玩法场景被修正', () => {
    for (const txt of ['01 02 03 各50', '02 04 06 二中二各50', '01 02 03 04 三中三各5']) {
      const it = parse(txt).items[0]
      expect(syncAmount(it)).toBe(it.total_amount)
      expect(it.total_amount).toBeGreaterThan(it.amount_per_bet)
    }
  })
})

// ============================================================
// E. 生肖年份映射回归（P2-4 修复验证，使用真实数据全量校验）
// ============================================================
describe('E. 生肖年份映射（P2-4 修复验证）', () => {
  it('跨年映射：2024号码1=龙，2025=蛇，2026=马', () => {
    expect(getZodiacByNumber(1, 2024)).toBe('龙')
    expect(getZodiacByNumber(1, 2025)).toBe('蛇')
    expect(getZodiacByNumber(1, 2026)).toBe('马')
  })

  it('真实内置数据：2026 生肖按标准岁数映射（1=马，29→虎、27→龙、43→鼠）', () => {
    expect(getZodiacByNumber(1, 2026)).toBe('马')
    expect(getZodiacByNumber(2, 2026)).toBe('蛇')
    expect(getZodiacByNumber(3, 2026)).toBe('龙')
    expect(getZodiacByNumber(29, 2026)).toBe('虎')
    expect(getZodiacByNumber(27, 2026)).toBe('龙')
    expect(getZodiacByNumber(43, 2026)).toBe('鼠')
  })

  it('数据参考：年份筛选 2024/2025/2026 时号码生肖列与生肖频率正确', () => {
    const mk = (periodNo, sp) => ({
      lottery_id: 1, period_no: periodNo, draw_date: periodNo.slice(0, 4) + '-01-01',
      special_number: sp,
      flat_number_1: 2, flat_number_2: 3, flat_number_3: 4,
      flat_number_4: 5, flat_number_5: 6, flat_number_6: 7
    })
    globalThis.uni = {
      getStorageSync: (key) => key === 'local_lottery_results'
        ? JSON.stringify([mk('2024001', 1), mk('2025001', 1), mk('2026001', 1)])
        : '[]',
      setStorageSync: () => {}
    }

    // 2024 → 号码1 生肖=龙，龙频率=1（仅特码1属龙）
    let res = ref.getNumberFrequency({ lottery_id: 1, year: 2024 })
    expect(res.number_stats.find(n => n.number === 1).zodiac).toBe('龙')
    expect(res.zodiac_stats.find(z => z.zodiac === '龙').count).toBe(1)

    // 2025 → 号码1 生肖=蛇
    res = ref.getNumberFrequency({ lottery_id: 1, year: 2025 })
    expect(res.number_stats.find(n => n.number === 1).zodiac).toBe('蛇')
    expect(res.zodiac_stats.find(z => z.zodiac === '蛇').count).toBe(1)

    // 2026 → 号码1 生肖=马
    res = ref.getNumberFrequency({ lottery_id: 1, year: 2026 })
    expect(res.number_stats.find(n => n.number === 1).zodiac).toBe('马')
    expect(res.zodiac_stats.find(z => z.zodiac === '马').count).toBe(1)

    // 全部年份混算：按各自年份逐条映射（特1 + 平2-7 的生肖全部计入）
    // 2024:[龙,兔,虎,牛,鼠,猪,狗] 2025:[蛇,龙,兔,虎,牛,鼠,猪] 2026:[马,蛇,龙,兔,虎,牛,鼠]
    // 合计：龙3 兔3 虎3 牛3 鼠3 猪2 蛇2 马1 狗1；号码1列取最新期年份=马
    res = ref.getNumberFrequency({ lottery_id: 1 })
    expect(res.number_stats.find(n => n.number === 1).zodiac).toBe('马')
    expect(res.zodiac_stats.find(z => z.zodiac === '龙').count).toBe(3)
    expect(res.zodiac_stats.find(z => z.zodiac === '蛇').count).toBe(2)
    expect(res.zodiac_stats.find(z => z.zodiac === '马').count).toBe(1)
  })
})
