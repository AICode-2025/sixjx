import { Hono } from 'hono'

const syncReports = new Hono()

// ─── 列表（首页用） ───
syncReports.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const pageSize = parseInt(c.req.query('pageSize') || '10')
  const offset = (page - 1) * pageSize

  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) as t FROM sync_reports').first()
  const rows = await c.env.DB.prepare(`
    SELECT period_no, COUNT(DISTINCT activation_code) as user_count,
           SUM(total_bet) as total_bet, SUM(total_payout) as total_payout,
           SUM(total_profit) as total_profit, MAX(synced_at) as last_synced
    FROM sync_reports
    GROUP BY period_no
    ORDER BY period_no DESC
    LIMIT ? OFFSET ?
  `).bind(pageSize, offset).all()

  return c.json({
    code: 0,
    data: {
      list: rows.results.map(r => ({
        period_no: r.period_no,
        user_count: r.user_count,
        total_bet: Math.round(r.total_bet || 0),
        total_payout: Math.round(r.total_payout || 0),
        total_profit: Math.round(r.total_profit || 0),
        last_synced: r.last_synced || ''
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
    where += ' AND r.synced_at >= ?'
    binds.push(dateFrom)
  }
  if (dateTo) {
    where += ' AND r.synced_at <= ?'
    binds.push(dateTo + ' 23:59:59')
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
    ORDER BY i.lottery_type, CAST(i.bet_number AS INTEGER)
  `).bind(...binds).all()

  // 按彩票类型分组
  const byLottery = {}
  for (const row of (rows.results || [])) {
    const type = row.lottery_type || '澳门'
    if (!byLottery[type]) {
      byLottery[type] = { periods: new Set(), list: [], total_amount: 0 }
    }
    if (row.period_no) byLottery[type].periods.add(row.period_no)
    byLottery[type].list.push({
      bet_number: row.bet_number,
      total_amount: row.total_amount || 0,
      total_payout: row.total_payout || 0,
      total_count: row.total_count || 0
    })
    byLottery[type].total_amount += (row.total_amount || 0)
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
    binds.push(dateFrom)
  }
  if (dateTo) {
    where += ' AND synced_at <= ?'
    binds.push(dateTo + ' 23:59:59')
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
  const list = await c.env.DB.prepare(`
    SELECT id, activation_code, lottery_id, total_bet, total_payout, total_profit, synced_at
    FROM sync_reports WHERE period_no = ?
    ORDER BY activation_code
  `).bind(periodNo).all()

  return c.json({ code: 0, data: list.results })
})

// ─── 用户列表 ───
syncReports.get('/users', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT DISTINCT activation_code FROM sync_reports ORDER BY activation_code
  `).all()

  return c.json({ code: 0, data: result.results.map(r => r.activation_code) })
})

// ─── CSV 导出 ───
syncReports.get('/export', async (c) => {
  const dateFrom = c.req.query('date_from') || ''
  const dateTo = c.req.query('date_to') || ''

  let where = 'WHERE 1=1'
  const binds = []

  if (dateFrom) { where += ' AND synced_at >= ?'; binds.push(dateFrom) }
  if (dateTo) { where += ' AND synced_at <= ?'; binds.push(dateTo + ' 23:59:59') }

  const data = await c.env.DB.prepare(`
    SELECT period_no, activation_code, total_bet, total_payout, total_profit, synced_at
    FROM sync_reports ${where}
    ORDER BY period_no DESC, activation_code
  `).bind(...binds).all()

  const header = '期号,激活码,报单额,派发,盈亏,同步时间\n'
  const rows = data.results.map(r =>
    `${r.period_no},${r.activation_code},${r.total_bet},${r.total_payout},${r.total_profit},${r.synced_at}`
  ).join('\n')

  return c.text('\uFEFF' + header + rows, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename=sync_reports.csv'
  })
})

// ─── 用户端上报（支持明细项目） ───
syncReports.post('/', async (c) => {
  const body = await c.req.json()
  const { activation_code, period_no, lottery_id, lottery_type, total_bet, total_payout, total_profit, items } = body

  if (!activation_code || !period_no) {
    return c.json({ code: 1, message: '缺少必要参数' })
  }

  // 创建主报表
  const result = await c.env.DB.prepare(`
    INSERT INTO sync_reports (activation_code, period_no, lottery_id, total_bet, total_payout, total_profit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    activation_code, period_no, lottery_id || 1,
    total_bet || 0, total_payout || 0, total_profit || 0
  ).run()

  const reportId = result.meta.last_row_id

  // 写入明细項目
  if (items && Array.isArray(items) && items.length > 0) {
    const stmt = c.env.DB.prepare(`
      INSERT INTO sync_report_items (report_id, lottery_type, period_no, bet_number, play_type, total_amount, total_payout, total_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of items) {
      await stmt.bind(
        reportId,
        item.lottery_type || lottery_type || '澳门',
        period_no,
        item.bet_number || '',
        item.play_type || '特',
        item.amount || 0,
        item.payout || 0,
        item.bet_count || 0
      ).run()
    }
  }

  return c.json({ code: 0, message: '上报成功' })
})

export { syncReports }
