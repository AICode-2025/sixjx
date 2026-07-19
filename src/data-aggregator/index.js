/**
 * 数据聚合与 API 发布模块
 * 路由挂载在 /api 下，无需认证（客户端调用）
 *
 * GET /api/init?code=xxx  验证激活码 + 返回全量数据
 * GET /api/hk             手动刷新香港数据
 * GET /api/mo             手动刷新澳门数据
 */

import { Hono } from 'hono'
import { fetchExternalAPI, getAPIUrl } from './fetcher.js'
import { extractRecords, normalizeRecord } from './normalizer.js'
import { isCacheFresh, saveResults, getResults } from './cache.js'

const aggregator = new Hono()

// ── 工具函数 ──

async function verifyCode(c, code) {
  const item = await c.env.DB.prepare(
    'SELECT * FROM activation_codes WHERE code = ?'
  ).bind(code).first()
  if (!item) return { valid: false, message: '激活码无效' }
  if (item.status === 'disabled') return { valid: false, message: '激活码已被禁用' }
  return { valid: true, data: item }
}

async function refreshHK(c) {
  const urls = await getAPIUrl(c)
  const { success, data, error } = await fetchExternalAPI(urls.hk)
  if (!success) {
    const cached = await getResults(c, 'hk_results', String(new Date().getFullYear()))
    if (cached.length > 0) return { source: 'cache', count: cached.length }
    return { source: 'error', error }
  }
  const records = extractRecords(data)
  const normalized = records.map(normalizeRecord).filter(Boolean)
  if (normalized.length === 0) return { source: 'empty' }
  await saveResults(c, 'hk_results', normalized)
  return { source: 'api', count: normalized.length }
}

async function refreshMacau(c) {
  const urls = await getAPIUrl(c)
  const { success, data, error } = await fetchExternalAPI(urls.mo)
  if (!success) {
    const cached = await getResults(c, 'mo_results', String(new Date().getFullYear()))
    if (cached.length > 0) return { source: 'cache', count: cached.length }
    return { source: 'error', error }
  }
  const records = extractRecords(data)
  const normalized = records.map(normalizeRecord).filter(Boolean)
  if (normalized.length === 0) return { source: 'empty' }
  await saveResults(c, 'mo_results', normalized)
  return { source: 'api', count: normalized.length }
}

// ── 路由定义 ──

// GET /api/init?code=xxx - 返回完整数据（code 可选，提供时校验激活码）
aggregator.get('/init', async (c) => {
  const code = c.req.query('code')
  if (code) {
    const verify = await verifyCode(c, code)
    if (!verify.valid) return c.json({ code: 1, message: verify.message })
  }

  // 并行拉取香港和澳门数据
  const [hk, mo] = await Promise.all([refreshHK(c), refreshMacau(c)])

  // 返回最新缓存
  const hkData = await getResults(c, 'hk_results', String(new Date().getFullYear()))
  const moData = await getResults(c, 'mo_results', String(new Date().getFullYear()))

  return c.json({
    code: 0,
    data: {
      hk: { list: hkData, refresh: hk },
      mo: { list: moData, refresh: mo }
    }
  })
})

// GET /api/hk - 刷新香港数据
aggregator.get('/hk', async (c) => {
  const result = await refreshHK(c)
  return c.json({ code: result.source === 'error' ? 1 : 0, data: result })
})

// GET /api/mo - 刷新澳门数据
aggregator.get('/mo', async (c) => {
  const result = await refreshMacau(c)
  return c.json({ code: result.source === 'error' ? 1 : 0, data: result })
})

export { aggregator }
