/**
 * 外部 API 拉取器
 * 支持超时、重试，API URL 从 D1 api_config 表动态读取
 */

const DEFAULT_TIMEOUT = 10000
const MAX_RETRIES = 2

export async function fetchExternalAPI(url, { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { success: true, data: await res.json() }
    } catch (err) {
      lastErr = err
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
  return { success: false, error: lastErr.message }
}

/**
 * 从 D1 api_config 表读取外部 API URL
 * 未配置时使用 1234kj.com 默认值
 */
export async function getAPIUrl(c) {
  const configs = await c.env.DB.prepare(
    "SELECT key, value FROM api_config WHERE key IN ('api_url_newmacau','api_url_hk')"
  ).all()
  const cfg = {}
  for (const row of (configs.results || [])) {
    cfg[row.key] = row.value
  }
  return {
    hk: cfg.api_url_hk || 'https://1234kj.com/api/opencode/2034?type=all',
    mo: cfg.api_url_newmacau || 'https://1234kj.com/api/opencode/2033?type=all'
  }
}
