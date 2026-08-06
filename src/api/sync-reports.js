import { Hono } from 'hono'
import { toBeijing, beijingDateToUtc } from '../util/time.js'

const syncReports = new Hono()

// ─── 列表（首页用） ───
syncReports.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const pageSize = parseInt(c.req.query('pageSize') || '10')
  const offset = (page - 1) * pageSize

  // total 与列表行同口径：期号×彩种 组数
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT period_no || '_' || lottery_id) as t FROM sync_reports"
  ).first()
  const rows = await c.env.DB.prepare(`
    SELECT period_no, lottery_id, COUNT(DISTINCT activation_code) as user_count,
           SUM(total_bet) as total_bet, SUM(total_payout) as total_payout,
           SUM(total_profit) as total_profit, MAX(synced_at) as last_synced
    FROM sync_reports
    GROUP BY period_no, lottery_id
    ORDER BY period_no DESC, lottery_id
    LIMIT ? OFFSET ?
  `).bind(pageSize, offset).all()

  return c.json({
    code: 0,
    data: {
      list: rows.results.map(r => ({
        period_no: r.period_no,
        lottery_id: r.lottery_id,
        lottery_type: r.lottery_id === 2 ? '香港' : '澳门',
        user_count: r.user_count,
        total_bet: Math.round(r.total_bet || 0),
        total_payout: Math.round(r.total_payout || 0),
        total_profit: Math.round(r.total_profit || 0),
        last_synced: toBeijing(r.last_synced || '')
      })),
      total: totalRow.t,
      page, pageSize
    }
  })
})

// ─── 报单统计：按号码聚合 ───
syncReports.get('/number-stats', async (c) => {
  const periodNo = c.req.query('period_no') || ''
  const dateFrom = c.req.query('date_from') || ''
  const dateTo = c.req.query('date_to') || ''

  let where = 'WHERE 1=1'
  const binds = []

  if (periodNo) {
    where += ' AND i.period_no = ?'
    binds.push(periodNo)
  }
  if (dateFrom) {
    // 北京日期 → UTC 边界（库内 synced_at 为 UTC）
    where += ' AND r.synced_at >= ?'
    binds.push(beijingDateToUtc(dateFrom))
  }
  if (dateTo) {
    where += ' AND r.synced_at <= ?'
    binds.push(beijingDateToUtc(dateTo, true))
  }

  const rows = await c.env.DB.prepare(`
    SELECT i.lottery_type, i.period_no, i.bet_number,
           SUM(i.total_amount) as total_amount,
           SUM(i.total_payout) as total_payout,
           SUM(i.total_count) as total_count
    FROM sync_report_items i
    LEFT JOIN sync_reports r ON i.report_id = r.id
    ${where}
    GROUP BY i.lottery_type, i.period_no, i.bet_number
  `).bind(...binds).all()

  // 上报明细为多注组合串（如 "1,13,25,37,49"），拆分到单号码（补零对齐 01-49）后聚合，
  // 前端按单号 01-49 渲染，组合串口径会导致整页空白
  const singleAgg = new Map() // `${type}|${num}` -> { total_amount, total_payout, total_count, periods: Set }
  for (const row of (rows.results || [])) {
    const nums = String(row.bet_number || '').split(',').map(s => s.trim()).filter(Boolean)
    if (nums.length === 0) continue
    const type = row.lottery_type || '澳门'
    const perAmount = (row.total_amount || 0) / nums.length
    const perPayout = (row.total_payout || 0) / nums.length
    const perCount = (row.total_count || 0) / nums.length
    for (const n of nums) {
      const num = String(n).padStart(2, '0')
      const key = `${type}|${num}`
      if (!singleAgg.has(key)) {
        singleAgg.set(key, { total_amount: 0, total_payout: 0, total_count: 0, periods: new Set() })
      }
      const agg = singleAgg.get(key)
      agg.total_amount += perAmount
      agg.total_payout += perPayout
      agg.total_count += perCount
      if (row.period_no) agg.periods.add(row.period_no)
    }
  }

  // 按彩票类型分组
  const byLottery = {}
  for (const [key, agg] of singleAgg) {
    const sep = key.indexOf('|')
    const type = key.slice(0, sep)
    const num = key.slice(sep + 1)
    if (!byLottery[type]) {
      byLottery[type] = { periods: new Set(), list: [], total_amount: 0 }
    }
    const bucket = byLottery[type]
    for (const p of agg.periods) bucket.periods.add(p)
    bucket.list.push({
      bet_number: num,
      total_amount: agg.total_amount,
      total_payout: agg.total_payout,
      total_count: agg.total_count
    })
    bucket.total_amount += agg.total_amount
  }
  for (const type in byLottery) {
    byLottery[type].list.sort((a, b) => parseInt(a.bet_number, 10) - parseInt(b.bet_number, 10))
  }

  const lotteryList = Object.entries(byLottery).map(([type, data]) => {
    const maxAmount = data.list.length > 0
      ? Math.max(...data.list.map(i => i.total_amount))
      : 0
    return {
      lottery_type: type,
      periods: Array.from(data.periods).sort().reverse(),
      list: data.list,
      total_amount: data.total_amount,
      max_amount: maxAmount
    }
  })

  // 澳门在前
  lotteryList.sort((a, b) => a.lottery_type === '澳门' ? -1 : 1)

  const grandTotal = lotteryList.reduce((s, lt) => s + lt.total_amount, 0)

  return c.json({
    code: 0,
    data: { lottery_list: lotteryList, total_amount: grandTotal }
  })
})

// ─── 汇总统计（首页用） ───
syncReports.get('/summary', async (c) => {
  const dateFrom = c.req.query('date_from') || ''
  const dateTo = c.req.query('date_to') || ''

  let where = 'WHERE 1=1'
  const binds = []

  if (dateFrom) {
    where += ' AND synced_at >= ?'
    binds.push(beijingDateToUtc(dateFrom))
  }
  if (dateTo) {
    where += ' AND synced_at <= ?'
    binds.push(beijingDateToUtc(dateTo, true))
  }

  const result = await c.env.DB.prepare(`
    SELECT
      COUNT(DISTINCT activation_code) as user_count,
      COUNT(DISTINCT period_no) as report_count,
      COALESCE(SUM(total_bet), 0) as total_bet,
      COALESCE(SUM(total_payout), 0) as total_payout,
      COALESCE(SUM(total_profit), 0) as total_profit
    FROM sync_reports ${where}
  `).bind(...binds).first()

  return c.json({ code: 0, data: result })
})

// ─── 期号明细 ───
syncReports.get('/detail/:periodNo', async (c) => {
  const periodNo = c.req.param('periodNo')
  const lotteryId = c.req.query('lottery_id')
  let sql = `SELECT id, activation_code, device_id, lottery_id, total_bet, total_payout, total_profit, synced_at
    FROM sync_reports WHERE period_no = ?`
  const binds = [periodNo]
  if (lotteryId) { sql += ' AND lottery_id = ?'; binds.push(Number(lotteryId)) }
  sql += ' ORDER BY activation_code'
  const list = await c.env.DB.prepare(sql).bind(...binds).all()

  const rows = (list.results || []).map(r => ({ ...r, synced_at: toBeijing(r.synced_at || '') }))
  return c.json({ code: 0, data: rows })
})

// ─── 用户列表 ───
syncReports.get('/users', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT DISTINCT activation_code FROM sync_reports ORDER BY activation_code
  `).all()

  return c.json({ code: 0, data: result.results.map(r => r.activation_code) })
})

// CSV 字段转义（防逗号/引号/换行破坏列结构）
function csvField(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// ─── CSV 导出 ───
syncReports.get('/export', async (c) => {
  const dateFrom = c.req.query('date_from') || ''
  const dateTo = c.req.query('date_to') || ''

  let where = 'WHERE 1=1'
  const binds = []

  if (dateFrom) { where += ' AND synced_at >= ?'; binds.push(beijingDateToUtc(dateFrom)) }
  if (dateTo) { where += ' AND synced_at <= ?'; binds.push(beijingDateToUtc(dateTo, true)) }

  const data = await c.env.DB.prepare(`
    SELECT period_no, activation_code, total_bet, total_payout, total_profit, synced_at
    FROM sync_reports ${where}
    ORDER BY period_no DESC, activation_code
  `).bind(...binds).all()

  const header = '期号,激活码,报单额,派发,盈亏,同步时间\n'
  const rows = data.results.map(r =>
    `${csvField(r.period_no)},${csvField(r.activation_code)},${r.total_bet},${r.total_payout},${r.total_profit},${csvField(toBeijing(r.synced_at || ''))}`
  ).join('\n')

  return c.text('\uFEFF' + header + rows, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename=sync_reports.csv'
  })
})

// ─── 用户端上报（支持明细项目） ───
syncReports.post('/', async (c) => {
  const body = await c.req.json()
  const { activation_code, period_no, lottery_id, lottery_type, total_bet, total_payout, total_profit, items, device_id } = body

  // ── 基础校验 ──
  if (!activation_code || typeof activation_code !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(activation_code)) {
    return c.json({ code: 1, message: '激活码缺失或格式错误' })
  }
  if (!period_no || typeof period_no !== 'string' || !/^\d{5,9}$/.test(period_no)) {
    return c.json({ code: 1, message: '期号缺失或格式错误' })
  }
  const lid = lottery_id === 2 ? 2 : 1

  const bet = Number(total_bet) || 0
  const payout = Number(total_payout) || 0
  const profit = Number(total_profit) || 0
  if (!isFinite(bet) || !isFinite(payout) || !isFinite(profit) || bet < 0 || payout < 0) {
    return c.json({ code: 1, message: '金额参数不合法' })
  }

  // 明细校验（防超大报文/非法数值）
  let itemsList = []
  if (items && Array.isArray(items)) {
    if (items.length > 2000) {
      return c.json({ code: 1, message: '明细条数过多（上限2000）' })
    }
    for (const item of items) {
      const amt = Number(item.amount || item.total_amount || 0)
      const pay = Number(item.payout || item.total_payout || 0)
      const cnt = Number(item.bet_count || item.total_count || 0)
      if (!isFinite(amt) || !isFinite(pay) || !isFinite(cnt) || amt < 0 || pay < 0 || cnt < 0) {
        return c.json({ code: 1, message: '明细金额参数不合法' })
      }
      if (typeof item.bet_number === 'string' && item.bet_number.length > 200) {
        return c.json({ code: 1, message: '投注号码过长' })
      }
      itemsList.push(item)
    }
  }

  // 幂等：同一激活码+彩种+期号仅保留一条主报表，重复上报直接跳过（澳门/香港同号期互不干扰）
  const existing = await c.env.DB.prepare(
    'SELECT id FROM sync_reports WHERE activation_code = ? AND period_no = ? AND lottery_id = ?'
  ).bind(activation_code, period_no, lid).first()
  if (existing) {
    return c.json({ code: 0, message: '该期已上报（跳过重复）' })
  }

  // 创建主报表
  const result = await c.env.DB.prepare(`
    INSERT INTO sync_reports (activation_code, device_id, period_no, lottery_id, total_bet, total_payout, total_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    activation_code, typeof device_id === 'string' ? device_id.slice(0, 64) : '',
    period_no, lid, bet, payout, profit
  ).run()

  const reportId = result.meta.last_row_id

  // 写入明细項目（D1 batch 原子执行，失败回滚主表，避免"主表存在、明细缺失"且后续被幂等拦截）
  if (itemsList.length > 0) {
    const stmt = c.env.DB.prepare(`
      INSERT INTO sync_report_items (report_id, lottery_type, period_no, bet_number, play_type, total_amount, total_payout, total_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const batches = itemsList.map(item => stmt.bind(
      reportId,
      item.lottery_type || lottery_type || '澳门',
      period_no,
      item.bet_number || '',
      item.play_type || '特',
      Number(item.amount || item.total_amount || 0),
      Number(item.payout || item.total_payout || 0),
      Number(item.bet_count || item.total_count || 0)
    ))
    try {
      await c.env.DB.batch(batches)
    } catch (e) {
      await c.env.DB.prepare('DELETE FROM sync_reports WHERE id = ?').bind(reportId).run()
      return c.json({ code: 1, message: '明细写入失败' })
    }
  }

  return c.json({ code: 0, message: '上报成功' })
})

export { syncReports }