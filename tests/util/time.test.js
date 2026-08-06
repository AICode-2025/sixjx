import { describe, it, expect } from 'vitest'
import { toBeijing, beijingDateToUtc } from '../../src/util/time.js'

describe('time util', () => {
  it('UTC 存储时间 → 北京展示时间（+8h）', () => {
    expect(toBeijing('2026-08-05 13:30:00')).toBe('2026-08-05 21:30:00')
    expect(toBeijing('2026-08-05 16:00:00')).toBe('2026-08-06 00:00:00')
  })

  it('北京日期 → UTC 边界', () => {
    expect(beijingDateToUtc('2026-08-05')).toBe('2026-08-04 16:00:00')
    expect(beijingDateToUtc('2026-08-05', true)).toBe('2026-08-05 15:59:59')
  })

  it('空值/非法值安全返回空串', () => {
    expect(toBeijing('')).toBe('')
    expect(toBeijing('not-a-date')).toBe('not-a-date')
    expect(beijingDateToUtc('')).toBe('')
  })
})