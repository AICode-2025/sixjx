import { Hono } from 'hono'

const periods = new Hono()

// 获取所有香港期号
periods.get('/hk', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM hk_periods ORDER BY period_no ASC'
  ).all()
  return c.json({ code: 0, data: rows.results || [] })
})

// 创建香港期号
periods.post('/hk', async (c) => {
  const { period_no, draw_date } = await c.req.json()
  if (!period_no || !draw_date) {
    return c.json({ code: 1, message: '参数不完整' })
  }
  if (!/^\d{7}$/.test(period_no)) {
    return c.json({ code: 1, message: '期号格式错误，需7位数字' })
  }
  try {
    await c.env.DB.prepare(
      'INSERT INTO hk_periods (period_no, draw_date) VALUES (?, ?)'
    ).bind(period_no, draw_date).run()
    return c.json({ code: 0, message: '创建成功' })
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return c.json({ code: 1, message: '期号已存在' })
    }
    return c.json({ code: 1, message: '创建失败' })
  }
})

// 批量创建
periods.post('/hk/batch', async (c) => {
  const { list } = await c.req.json()
  if (!Array.isArray(list) || list.length === 0) {
    return c.json({ code: 1, message: '列表为空' })
  }
  let success = 0
  let fail = 0
  for (const item of list) {
    try {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO hk_periods (period_no, draw_date) VALUES (?, ?)'
      ).bind(item.period_no, item.draw_date).run()
      success++
    } catch (_) {
      fail++
    }
  }
  return c.json({ code: 0, data: { success, fail }, message: `导入完成：成功${success}条，失败${fail}条` })
})

// 更新香港期号
periods.put('/hk/:id', async (c) => {
  const id = c.req.param('id')
  const { period_no, draw_date } = await c.req.json()
  const existing = await c.env.DB.prepare('SELECT * FROM hk_periods WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ code: 1, message: '期号不存在' })
  await c.env.DB.prepare(
    'UPDATE hk_periods SET period_no = ?, draw_date = ? WHERE id = ?'
  ).bind(period_no || existing.period_no, draw_date || existing.draw_date, id).run()
  return c.json({ code: 0, message: '更新成功' })
})

// 删除香港期号
periods.delete('/hk/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM hk_periods WHERE id = ?').bind(id).run()
  return c.json({ code: 0, message: '删除成功' })
})

// ========== 香港开奖结果 ==========

// 批量导入香港开奖结果
periods.post('/hk/results/batch', async (c) => {
  const { list } = await c.req.json()
  if (!Array.isArray(list) || list.length === 0) {
    return c.json({ code: 1, message: '列表为空' })
  }
  let success = 0
  let fail = 0
  for (const item of list) {
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO hk_results (period_no, draw_date, n1, n2, n3, n4, n5, n6, special)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        item.period_no, item.draw_date,
        item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.special
      ).run()
      success++
    } catch (_) {
      fail++
    }
  }
  return c.json({ code: 0, data: { success, fail }, message: `结果导入完成：成功${success}条，失败${fail}条` })
})

// 获取香港开奖结果列表
periods.get('/hk/results', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM hk_results ORDER BY period_no DESC'
  ).all()
  return c.json({ code: 0, data: rows.results || [] })
})

// 获取香港开奖结果（按年份）
periods.get('/hk/results/:year', async (c) => {
  const year = c.req.param('year')
  const rows = await c.env.DB.prepare(
    'SELECT * FROM hk_results WHERE period_no LIKE ? ORDER BY period_no DESC'
  ).bind(year + '%').all()
  return c.json({ code: 0, data: rows.results || [] })
})

// ========== 澳门开奖结果 ==========

// 获取澳门开奖结果列表
periods.get('/mo/results', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM mo_results ORDER BY period_no DESC'
  ).all()
  return c.json({ code: 0, data: rows.results || [] })
})

// 获取澳门开奖结果（按年份）
periods.get('/mo/results/:year', async (c) => {
  const year = c.req.param('year')
  const rows = await c.env.DB.prepare(
    'SELECT * FROM mo_results WHERE period_no LIKE ? ORDER BY period_no DESC'
  ).bind(year + '%').all()
  return c.json({ code: 0, data: rows.results || [] })
})

// 批量导入澳门开奖结果
periods.post('/mo/results/batch', async (c) => {
  const { list } = await c.req.json()
  if (!Array.isArray(list) || list.length === 0) {
    return c.json({ code: 1, message: '列表为空' })
  }
  let success = 0
  let fail = 0
  for (const item of list) {
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO mo_results (period_no, draw_date, n1, n2, n3, n4, n5, n6, special)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        item.period_no, item.draw_date,
        item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.special
      ).run()
      success++
    } catch (_) {
      fail++
    }
  }
  return c.json({ code: 0, data: { success, fail }, message: `结果导入完成：成功${success}条，失败${fail}条` })
})

// 删除澳门开奖结果
periods.delete('/mo/results/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM mo_results WHERE id = ?').bind(id).run()
  return c.json({ code: 0, message: '删除成功' })
})

export { periods }
