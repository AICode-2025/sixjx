/**
 * D1 缓存读写
 * 冷数据持久化到 hk_results / mo_results 表
 */

const CACHE_TTL_MINUTES = 30

/**
 * 检查缓存是否新鲜（最新记录是否在 TTL 内）
 */
export async function isCacheFresh(c, table) {
  try {
    const row = await c.env.DB.prepare(
      `SELECT created_at FROM ${table} ORDER BY created_at DESC LIMIT 1`
    ).first()
    if (!row || !row.created_at) return false
    const elapsed = (Date.now() - new Date(row.created_at + 'Z').getTime()) / 1000 / 60
    return elapsed < CACHE_TTL_MINUTES
  } catch (_) {
    return false
  }
}

/**
 * 批量写入开奖结果（D1 batch 分批，避免逐条串行写入导致接口缓慢）
 */
export async function saveResults(c, table, list) {
  const stmt = c.env.DB.prepare(
    `INSERT OR IGNORE INTO ${table} (period_no, draw_date, n1, n2, n3, n4, n5, n6, special)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let success = 0
  const BATCH_SIZE = 100
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE).map(item =>
      stmt.bind(item.period_no, item.draw_date, item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.special)
    )
    if (chunk.length === 0) continue
    try {
      const results = await c.env.DB.batch(chunk)
      success += results.filter(r => r.success).length
    } catch (_) {
      // 单批失败跳过，不阻塞返回
    }
  }
  return { success, fail: list.length - success }
}

/**
 * 从 D1 读取开奖结果
 */
export async function getResults(c, table, year) {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE period_no LIKE ? ORDER BY period_no DESC`
  ).bind(year + '%').all()
  return rows.results || []
}
