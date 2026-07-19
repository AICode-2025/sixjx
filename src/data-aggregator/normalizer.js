/**
 * 数据格式归一化
 * 将不同外部 API 的响应统一为 { period_no, n1-n6, special, draw_date }
 * 后续新增 API 源只需扩展 extractRecords 或 normalizeRecord
 */

/**
 * 从外部 API 响应中提取记录数组
 * 支持常见的 JSON 包裹格式
 */
export function extractRecords(data) {
  if (!data || typeof data !== 'object') return []
  // 直接返回数组
  if (Array.isArray(data)) return data
  // { result: true, data: [...] }
  if (data.result === true && Array.isArray(data.data)) return data.data
  // { code: 0, data: [...] }
  if ((data.code === 0 || data.code === 200) && Array.isArray(data.data)) return data.data
  // { code: 0, data: { list: [...] } }
  if ((data.code === 0 || data.code === 200) && data.data && Array.isArray(data.data.list)) return data.data.list
  // 单条格式
  if (data.openCode || data.opencode) return [data]
  return []
}

/**
 * 标准化单条开奖记录 → { period_no, draw_date, n1-n6, special }
 * 支持字段名：openCode/opencode/open_code, expect/period_no/issue, opentime/date/draw_date
 */
export function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null
  const openCode = record.openCode || record.opencode || record.open_code || ''
  if (!openCode) return null

  const parts = String(openCode).split(',').map(s => Number(s.trim())).filter(n => n >= 1 && n <= 49)
  if (parts.length < 7) return null

  return {
    period_no: record.expect || record.period_no || record.issue || '',
    draw_date: (record.opentime || record.date || record.draw_date || '').slice(0, 10),
    n1: parts[0], n2: parts[1], n3: parts[2],
    n4: parts[3], n5: parts[4], n6: parts[5],
    special: parts[6]
  }
}
