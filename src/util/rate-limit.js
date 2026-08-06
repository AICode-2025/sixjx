/**
 * 简易内存限流（按 IP 滑动窗口）
 * 注意：Worker isolate 之间不共享计数，仅作为基础防护；
 * 生产环境建议叠加 Cloudflare 防火墙规则或托管限流
 */

const WINDOW_MS = 60 * 1000
const MAX_HITS = 20

const buckets = new Map()

function clientKey(c, label) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown'
  return `${label}:${ip}`
}

export function rateLimit({ windowMs = WINDOW_MS, max = MAX_HITS, label = 'api' } = {}) {
  return async (c, next) => {
    const key = clientKey(c, label)
    const now = Date.now()
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
    } else {
      bucket.count += 1
      if (bucket.count > max) {
        return c.json({ code: 429, message: '请求过于频繁，请稍后再试' }, 429)
      }
    }
    // 防止 Map 无限增长：超过阈值时清理过期桶
    if (buckets.size > 10000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k)
      }
    }
    await next()
  }
}

export default { rateLimit }