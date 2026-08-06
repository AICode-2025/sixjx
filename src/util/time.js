/**
 * 时间工具：数据库统一存 UTC（datetime('now')），展示层按北京时间（UTC+8）转换
 * 解决管理端时间与北京时区错位 8 小时的问题
 */

const OFFSET_MS = 8 * 60 * 60 * 1000

function pad(n) {
  return String(n).padStart(2, '0')
}

function format(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** 'YYYY-MM-DD HH:MM:SS'（UTC 存储值）→ 北京展示时间（同格式字符串） */
export function toBeijing(utcStr) {
  if (!utcStr) return ''
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return String(utcStr)
  return format(new Date(d.getTime() + OFFSET_MS))
}

/**
 * 北京日期 'YYYY-MM-DD' → UTC 边界 'YYYY-MM-DD HH:MM:SS'（供 D1 文本比较）
 * endOfDay=true 时取当日 23:59:59 北京，用于 <= 筛选
 */
export function beijingDateToUtc(dateStr, endOfDay = false) {
  if (!dateStr) return ''
  const d = new Date(String(dateStr) + (endOfDay ? 'T23:59:59' : 'T00:00:00') + '+08:00')
  if (isNaN(d.getTime())) return ''
  return format(d)
}

export default { toBeijing, beijingDateToUtc }