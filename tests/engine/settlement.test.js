import { describe, it, expect } from 'vitest'
import { settle, settlePeriod } from '../../../src/engine/SettlementEngine.js'
import { getZodiacByNumber } from '../../../src/engine/ZodiacMapper.js'

// 2026 年开奖样例：特码 1（马），平码 [2,4,6,9,10,11]
const SPECIAL = 1
const FLATS = [2, 4, 6, 9, 10, 11]
const YEAR = new Date().getFullYear()

function baseItem(overrides) {
  return { numbers: [], play_type_id: 1, bet_count: 1, amount_per_bet: 10, odds: 47, ...overrides }
}

describe('SettlementEngine', () => {
  it('特：命中/未命中', () => {
    const win = settle([baseItem({ numbers: [1, 7], bet_count: 2 })], SPECIAL, FLATS)[0]
    expect(win.is_win).toBe(true)
    expect(win.payout).toBe(10 * 47)
    expect(win.profit_loss).toBe(10 * 47 - 20)

    const lose = settle([baseItem({ numbers: [7] })], SPECIAL, FLATS)[0]
    expect(lose.is_win).toBe(false)
    expect(lose.payout).toBe(0)
  })

  it('平：每个命中号码一注', () => {
    const r = settle([baseItem({ numbers: [2, 10, 12], play_type_id: 2, odds: 7 })], SPECIAL, FLATS)[0]
    expect(r.is_win).toBe(true)
    expect(r.payout).toBe(10 * 7 * 2) // 2、10 两个平码命中
    expect(r.profit_loss).toBe(10 * 7 * 2 - 30)
  })

  it('二中二：C(n,2) 组合计数', () => {
    const r = settle([baseItem({ numbers: [2, 4, 8], play_type_id: 3, odds: 65 })], SPECIAL, FLATS)[0]
    // 组合 (2,4)(2,8)(4,8)，仅 (2,4) 全中
    expect(r.matched_count).toBe(1)
    expect(r.payout).toBe(10 * 65)
    expect(r.profit_loss).toBe(10 * 65 - 30)
  })

  it('三中三：全中才赢', () => {
    const r = settle([baseItem({ numbers: [2, 4, 6], play_type_id: 4, odds: 700 })], SPECIAL, FLATS)[0]
    expect(r.matched_count).toBe(1)
    expect(r.payout).toBe(10 * 700)

    const miss = settle([baseItem({ numbers: [2, 4, 8], play_type_id: 4, odds: 700 })], SPECIAL, FLATS)[0]
    expect(miss.is_win).toBe(false)
  })

  it('三中二：中2个按三中二系数，中3个按自然三中三固定100倍', () => {
    const two = settle([baseItem({ numbers: [2, 4, 8], play_type_id: 7, odds: 20 })], SPECIAL, FLATS)[0]
    expect(two.matched_count).toBe(1)
    expect(two.payout).toBe(10 * 20)

    const three = settle([baseItem({ numbers: [2, 4, 6], play_type_id: 7, odds: 20 })], SPECIAL, FLATS)[0]
    expect(three.matched_count).toBe(0)
    expect(three.natural_sanzhongsan_count).toBe(1)
    expect(three.payout).toBe(10 * 100)
    expect(three.is_win).toBe(true)
  })

  it('平特一肖：投注生肖出现在开奖结果（含特）', () => {
    const horse = getZodiacByNumber(1, YEAR) // 特码生肖
    const r = settle([baseItem({ zodiacs: [horse], play_type_id: 5, odds: 2 })], SPECIAL, FLATS)[0]
    expect(r.is_win).toBe(true)
    expect(r.payout).toBe(10 * 2)

    const miss = settle([baseItem({ zodiacs: ['鼠'], play_type_id: 5, odds: 2 })], SPECIAL, FLATS)[0]
    expect(miss.is_win).toBe(false)
  })

  it('二连肖：两个生肖都出现才赢', () => {
    const z1 = getZodiacByNumber(1, YEAR)
    const z2 = getZodiacByNumber(2, YEAR)
    const r = settle([baseItem({ zodiacs: [z1, z2], play_type_id: 6, odds: 4 })], SPECIAL, FLATS)[0]
    expect(r.is_win).toBe(true)

    const miss = settle([baseItem({ zodiacs: [z1, '鼠'], play_type_id: 6, odds: 4 })], SPECIAL, FLATS)[0]
    expect(miss.is_win).toBe(false)
  })

  it('settlePeriod 汇总：总投注/总派发/总盈亏', () => {
    const items = [
      baseItem({ numbers: [1], bet_count: 1 }),               // 特中：470
      baseItem({ numbers: [7], bet_count: 1 }),               // 特未中：0
      baseItem({ numbers: [2, 10, 12], play_type_id: 2, odds: 7, bet_count: 3 }) // 平：140
    ]
    const { results, summary } = settlePeriod(items, { special_number: SPECIAL, flat_numbers: FLATS })
    expect(results.length).toBe(3)
    expect(summary.total_bet).toBe(10 + 10 + 30)
    expect(summary.total_payout).toBe(470 + 0 + 140)
    expect(summary.total_profit_loss).toBe(470 + 140 - 50)
  })

  it('开奖结果不完整时返回错误', () => {
    const { error } = settlePeriod([baseItem({})], { special_number: 1, flat_numbers: [2, 3] })
    expect(error).toBe('开奖结果不完整')
  })
})