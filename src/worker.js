import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './api/auth.js'
import { activation } from './api/activation.js'
import { syncReports } from './api/sync-reports.js'
import { periods, syncHKPeriods } from './api/periods.js'
import { aggregator } from './data-aggregator/index.js'
import { authMiddleware } from './middleware/auth.js'
import { fetchExternalAPI, getAPIUrl } from './data-aggregator/fetcher.js'
import {
  extractRecords as extractRecordsAgg,
  normalizeRecord as normalizeRecordAgg
} from './data-aggregator/normalizer.js'

const app = new Hono()

// CORS
app.use('*', cors())

// ── 数据库初始化（首次请求时运行）──
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'super_admin',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  device_id TEXT,
  device_name TEXT,
  issuer TEXT DEFAULT '',
  status TEXT DEFAULT 'unactivated',
  activated_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activation_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_status ON activation_codes(status);
CREATE TABLE IF NOT EXISTS sync_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_code TEXT NOT NULL,
  period_no TEXT NOT NULL,
  lottery_id INTEGER DEFAULT 1,
  total_bet REAL DEFAULT 0,
  total_payout REAL DEFAULT 0,
  total_profit REAL DEFAULT 0,
  report_data TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_period ON sync_reports(period_no);
CREATE INDEX IF NOT EXISTS idx_sync_code ON sync_reports(activation_code);
CREATE INDEX IF NOT EXISTS idx_sync_synced_at ON sync_reports(synced_at);
CREATE TABLE IF NOT EXISTS sync_report_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  lottery_type TEXT,
  period_no TEXT NOT NULL,
  bet_number TEXT,
  play_type TEXT,
  total_amount REAL DEFAULT 0,
  total_payout REAL DEFAULT 0,
  total_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_item_period ON sync_report_items(period_no);
CREATE INDEX IF NOT EXISTS idx_item_lottery ON sync_report_items(lottery_type);
CREATE INDEX IF NOT EXISTS idx_item_number ON sync_report_items(bet_number);
CREATE INDEX IF NOT EXISTS idx_item_report ON sync_report_items(report_id);
CREATE TABLE IF NOT EXISTS api_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', '123456', 'super_admin');
CREATE TABLE IF NOT EXISTS hk_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_no TEXT UNIQUE NOT NULL,
  draw_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hk_period_no ON hk_periods(period_no);
CREATE TABLE IF NOT EXISTS hk_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_no TEXT UNIQUE NOT NULL,
  draw_date TEXT NOT NULL,
  n1 INTEGER NOT NULL, n2 INTEGER NOT NULL, n3 INTEGER NOT NULL,
  n4 INTEGER NOT NULL, n5 INTEGER NOT NULL, n6 INTEGER NOT NULL,
  special INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hk_result_period ON hk_results(period_no);
CREATE TABLE IF NOT EXISTS mo_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_no TEXT UNIQUE NOT NULL,
  draw_date TEXT NOT NULL,
  n1 INTEGER NOT NULL, n2 INTEGER NOT NULL, n3 INTEGER NOT NULL,
  n4 INTEGER NOT NULL, n5 INTEGER NOT NULL, n6 INTEGER NOT NULL,
  special INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mo_result_period ON mo_results(period_no);
`

let dbReady = false

async function ensureDB(c) {
  if (dbReady) return
  const stmts = INIT_SQL.split(';').map(s => s.trim()).filter(Boolean)
  for (const sql of stmts) {
    try { await c.env.DB.prepare(sql).run() } catch (_) {}
  }
  dbReady = true
}

app.use('*', async (c, next) => {
  // 只对 API 路由初始化 DB
  if (c.req.path.startsWith('/api/')) {
    await ensureDB(c)
  }
  await next()
})

// ── 公开路由（不需要登录）──

// 健康检查
app.get('/api/system/health', async (c) => {
  return c.json({ code: 0, data: { status: 'ok', time: new Date().toISOString() } })
})

// 诊断：POST 测试
app.post('/api/system/test', async (c) => {
  return c.json({ code: 0, method: c.req.method, path: c.req.path })
})

// 客户端 API 配置获取（公开，无需认证）
app.get('/api/client/config', async (c) => {
  const configs = await c.env.DB.prepare(
    "SELECT key, value FROM api_config WHERE key IN ('api_url_newmacau','api_url_hk','api_url_history')"
  ).all()
  const result = {}
  for (const row of (configs.results || [])) {
    result[row.key] = row.value
  }
  return c.json({
    code: 0,
    data: {
      macauApiUrl: result.api_url_newmacau || 'https://api3.marksix6.net/lottery_api.php?type=newMacau',
      hongkongApiUrl: result.api_url_hk || 'https://api3.marksix6.net/lottery_api.php?type=hk',
      historyApiUrl: result.api_url_history || 'https://api3.marksix6.net/lottery_api.php?type=newMacau',
    }
  })
})

// 系统配置读取
app.get('/api/system/api-config', async (c) => {
  const configs = await c.env.DB.prepare('SELECT * FROM api_config').all()
  const result = {}
  for (const row of (configs.results || [])) {
    result[row.key] = row.value
  }
  return c.json({ code: 0, data: result })
})

// 激活码验证（用户端APP调用）
app.post('/api/activation/verify', async (c) => {
  const { code } = await c.req.json()
  const item = await c.env.DB.prepare(
    'SELECT * FROM activation_codes WHERE code = ?'
  ).bind(code).first()
  if (!item) return c.json({ code: 1, message: '激活码无效' })
  if (item.status === 'disabled') return c.json({ code: 1, message: '激活码已被禁用' })
  return c.json({ code: 0, data: { status: item.status, device_id: item.device_id } })
})

// 注册设备（用户端APP调用）
app.post('/api/activation/register', async (c) => {
  const { code, device_id, device_name } = await c.req.json()
  const item = await c.env.DB.prepare(
    'SELECT * FROM activation_codes WHERE code = ?'
  ).bind(code).first()
  if (!item) return c.json({ code: 1, message: '激活码无效' })
  if (item.status === 'disabled') return c.json({ code: 1, message: '激活码已被禁用' })
  if (item.status === 'activated' && item.device_id !== device_id) {
    return c.json({ code: 1, message: '激活码已被其他设备绑定' })
  }
  await c.env.DB.prepare(
    "UPDATE activation_codes SET device_id = ?, device_name = ?, status = 'activated', activated_at = datetime('now') WHERE code = ?"
  ).bind(device_id, device_name || '', code).run()
  return c.json({ code: 0, message: '激活成功' })
})

// ── 需要认证的路由 ──
app.use('/api/auth/me', authMiddleware())
app.use('/api/auth/change-password', authMiddleware())
app.use('/api/activation', authMiddleware())
// sync-reports POST（客户端推送）免认证，GET（管理端查询）需登录
app.use('/api/sync-reports', async (c, next) => {
  if (c.req.method === 'POST') {
    await next()
  } else {
    return authMiddleware()(c, next)
  }
})
app.use('/api/system/api-config', authMiddleware())
app.use('/api/lottery/proxy', authMiddleware())
// periods GET（客户端拉取）免认证，POST/PUT/DELETE（管理端操作）需登录
app.use('/api/periods', async (c, next) => {
  if (c.req.method === 'GET') {
    await next()
  } else {
    return authMiddleware()(c, next)
  }
})

app.route('/api/auth', auth)
app.route('/api/activation', activation)
app.route('/api/sync-reports', syncReports)
app.route('/api/periods', periods)
app.route('/api', aggregator)
app.post('/api/system/api-config', async (c) => {
  const user = c.get('user')
  if (user.role !== 'super_admin') {
    return c.json({ code: 403, message: '无权限' })
  }
  const body = await c.req.json()
  for (const [key, value] of Object.entries(body)) {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO api_config (key, value) VALUES (?, ?)'
    ).bind(key, String(value)).run()
  }
  return c.json({ code: 0, message: '保存成功' })
})

// 拉取历史开奖结果（客户端APP调用）
app.get('/api/lottery/fetch-history', async (c) => {
  const lotteryId = Number(c.req.query('lottery_id')) || 1
  const year = c.req.query('year') || String(new Date().getFullYear())

  // 香港：从本地 hk_results 表返回
  if (lotteryId === 2) {
    try {
      const rows = await c.env.DB.prepare(
        'SELECT * FROM hk_results WHERE period_no LIKE ? ORDER BY period_no DESC'
      ).bind(year + '%').all()
      const results = (rows.results || []).map(r => ({
        period_no: r.period_no,
        openCode: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.special].join(','),
        opentime: r.draw_date
      }))
      return c.json({
        code: 0,
        data: { records: results, total: results.length }
      })
    } catch (err) {
      return c.json({ code: 1, message: '获取香港历史数据失败: ' + err.message })
    }
  }

  // 澳门：优先从本地 mo_results 表读取，表为空时外部拉取兜底
  try {
    const moRows = await c.env.DB.prepare(
      'SELECT * FROM mo_results WHERE period_no LIKE ? ORDER BY period_no DESC'
    ).bind(year + '%').all()
    let results = (moRows.results || []).map(r => ({
      period_no: r.period_no,
      openCode: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.special].join(','),
      opentime: r.draw_date
    }))
    if (results.length === 0) {
      const url = `https://history.macaumarksix.com/history/macaujc2/y/${year}`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const data = await res.json()
      const records = extractRecords(data)
      results = []
      for (const record of records) {
        const norm = normalizeRecord(record, lotteryId)
        if (norm) results.push(norm)
      }
    }
    return c.json({
      code: 0,
      data: { records: results, total: results.length }
    })
  } catch (err) {
    return c.json({ code: 1, message: '获取历史数据失败: ' + err.message })
  }
})

// 从 API 响应中提取记录数组
function extractRecords(data) {
  if (!data || typeof data !== 'object') return []
  // 索引数组 → 直接返回
  if (Array.isArray(data)) return data
  // { result: true, data: [...] }
  if (data.result === true && Array.isArray(data.data)) return data.data
  // { code: 0, data: [...] }
  if ((data.code === 0 || data.code === 200) && Array.isArray(data.data)) return data.data
  // 单条格式 { openCode, expect }
  if (data.openCode && data.expect) return [data]
  return []
}

// 标准化单条开奖记录
function normalizeRecord(record, lotteryId) {
  // 澳门 marksix 格式: { expect, openCode, opentime }
  if (record.openCode || record.opencode) {
    const oc = record.openCode || record.opencode || ''
    return { period_no: record.expect || '', openCode: oc, opentime: record.opentime || '' }
  }
  if (lotteryId !== 2) return null
  // 香港 HKJC 格式: { id, date, no, sno }
  const no = record.no || ''
  const sno = record.sno || ''
  if (no) {
    const openCode = sno ? no + ',' + sno : no
    return { period_no: record.id || '', openCode, opentime: record.date || '' }
  }
  return null
}

// 彩票代理
app.get('/api/lottery/proxy', async (c) => {
  const type = c.req.query('type') || 'newMacau'

  // 从数据库读取配置，未配置时使用 config.js 的默认值
  const configs = await c.env.DB.prepare(
    "SELECT key, value FROM api_config WHERE key IN ('api_url_newmacau','api_url_hk','api_url_history')"
  ).all()
  const cfg = {}
  for (const row of (configs.results || [])) {
    cfg[row.key] = row.value
  }

  const apis = {
    newMacau: cfg.api_url_newmacau || 'https://api3.marksix6.net/lottery_api.php?type=newMacau',
    hk: cfg.api_url_hk || 'https://api3.marksix6.net/lottery_api.php?type=hk',
    history: cfg.api_url_history || 'https://api3.marksix6.net/lottery_api.php?type=newMacau'
  }
  const url = apis[type] || apis.newMacau
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const data = await res.json()
    return c.json(data)
  } catch (err) {
    return c.json({ code: 1, message: '获取数据失败' })
  }
})

export default app

/**
 * 批量写入开奖结果到 D1（INSERT OR IGNORE 按 period_no 去重）
 */
async function saveResultsToDB(c, table, list) {
  let success = 0
  const stmt = c.env.DB.prepare(
    `INSERT OR IGNORE INTO ${table} (period_no, draw_date, n1, n2, n3, n4, n5, n6, special)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const item of list) {
    try {
      await stmt.bind(item.period_no, item.draw_date, item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.special).run()
      success++
    } catch (_) {}
  }
  return success
}

/**
 * 拉取单个外部源并写入对应结果表
 * 取归一化后最新 5 条入库，避免全量写入浪费 D1 配额（存量由导入脚本负责）
 */
async function syncLatestToDB(c, table, url) {
  const { success, data, error } = await fetchExternalAPI(url)
  if (!success) {
    console.error(`[Cron] ${table} 拉取失败: ${error}`)
    return
  }
  const records = extractRecordsAgg(data)
  const normalized = records.map(normalizeRecordAgg).filter(Boolean)
  if (normalized.length === 0) {
    console.error(`[Cron] ${table} 无可解析数据`)
    return
  }
  normalized.sort((a, b) => String(b.period_no).localeCompare(String(a.period_no)))
  const latest = normalized.slice(0, 5)
  const n = await saveResultsToDB(c, table, latest)
  console.log(`[Cron] ${table}: 解析 ${normalized.length} 条，写入最新 ${n} 条`)
}

// Cron Trigger: 每天21:32-21:40每2分钟拉取开奖结果并入库
// 澳门 21:33-21:36 出结果，香港开奖日 21:30 出结果；INSERT OR IGNORE 幂等可重复执行
export async function scheduled(event, env, ctx) {
  const c = { env }
  const urls = await getAPIUrl(c).catch(() => null)
  if (!urls) return
  await Promise.all([
    syncLatestToDB(c, 'mo_results', urls.mo),
    syncLatestToDB(c, 'hk_results', urls.hk)
  ])
  // 结果入库后自动同步香港期号
  await syncHKPeriods(c)
}
