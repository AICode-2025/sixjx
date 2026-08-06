import { describe, it, expect } from 'vitest'
import {
  getZodiacByNumber, getNumbersByZodiac, getAgeByZodiac, getZodiacByAge,
  getWaveColor, extractZodiacsFromText
} from '../../../src/engine/ZodiacMapper.js'

describe('ZodiacMapper', () => {

  it('号码→生肖映射（2026 标准约定：1岁=当年，2岁=去年，3岁=前年）', () => {
    expect(getZodiacByNumber(1, 2026)).toBe('马')
    expect(getZodiacByNumber(2, 2026)).toBe('蛇')
    expect(getZodiacByNumber(3, 2026)).toBe('龙')
    expect(getZodiacByNumber(13, 2026)).toBe('马')
    expect(getZodiacByNumber(7, 2026)).toBe('鼠')
    // 跨年：2025 号码1=蛇、2=龙；2024 号码1=龙、2=兔
    expect(getZodiacByNumber(1, 2025)).toBe('蛇')
    expect(getZodiacByNumber(2, 2025)).toBe('龙')
    expect(getZodiacByNumber(1, 2024)).toBe('龙')
    expect(getZodiacByNumber(2, 2024)).toBe('兔')
  })

  it('生肖→号码列表', () => {
    expect(getNumbersByZodiac('马', 2026)).toEqual([1, 13, 25, 37, 49])
    expect(getNumbersByZodiac('鼠', 2026)).toEqual([7, 19, 31, 43])
  })

  it('生肖↔年龄互转', () => {
    expect(getAgeByZodiac('马', 2026)).toBe(1)
    expect(getZodiacByAge(1, 2026)).toBe('马')
  })

  it('波色判定', () => {
    expect(getWaveColor(1)).toBe('红波')
    expect(getWaveColor(5)).toBe('绿波')
    expect(getWaveColor(3)).toBe('蓝波')
  })

  it('文本生肖提取', () => {
    const found = extractZodiacsFromText('马牛', 2026)
    expect(found.map(f => f.zodiac)).toEqual(['牛', '马'].sort())
  })
})