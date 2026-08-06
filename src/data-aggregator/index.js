/**
 * 数据聚合与 API 发布模块
 * 路由挂载在 /api 下，无需认证（客户端调用）
 *
 * GET /api/init          返回全量数据
 * GET /api/hk             手动刷新香港数据
 * GET /api/mo             手动刷新澳门数据
 */

import { Hono } from 'hono'
import { fetchExternalAPI, getAPIUrl } from './fetcher.js'
import { extractRecords, normalizeRecord } from './normalizer.js'
import { isCacheFresh, saveResults, getResults } from './cache.js'

const aggregator = new Hono()

async function refreshHK(c) {
  const urls = await getAPIUrl(c)
  const { success, data, error } = await fetchExternalAPI(urls.hk)
  if (!success) {
    const cached = await getResults(c, 'hk_results', String(new Date().getFullYear()))
    if (cached.length > 0) return { source: 'cache', count: cached.length }
    return { source: 'error', error }
  }
  const records = extractRecords(data)
  const normalized = records.map(r => normalizeRecord(r, false)).filter(Boolean)
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
  const normalized = records.map(r => normalizeRecord(r, true)).filter(Boolean)
  if (normalized.length === 0) return { source: 'empty' }
  await saveResults(c, 'mo_results', normalized)
  return { source: 'api', count: normalized.length }
}

// ── 路由定义 ──

// GET /api/init - 返回完整数据
aggregator.get('/init', async (c) => {
  const year = String(new Date().getFullYear())
  // 历史记录已在 D1，缓存新鲜（30 分钟内）时直接返回，避免每次请求都拉外部源导致响应缓慢
  const [hkFresh, moFresh] = await Promise.all([isCacheFresh(c, 'hk_results'), isCacheFresh(c, 'mo_results')])
  let hk = { source: 'cache' }
  let mo = { source: 'cache' }
  if (!hkFresh || !moFresh) {
    const [r1, r2] = await Promise.all([
      hkFresh ? null : refreshHK(c),
      moFresh ? null : refreshMacau(c)
    ])
    hk = r1 || hk
    mo = r2 || mo
  }

  // 返回 D1 最新数据
  const hkData = await getResults(c, 'hk_results', year)
  const moData = await getResults(c, 'mo_results', year)

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
