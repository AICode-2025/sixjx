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

// 手动采集香港期号：开奖日期从官方日历（kjrq.html）采集，期号以采集源锚点（qishu.js）顺延
periods.post('/hk/collect', async (c) => {
  const items = await generateFutureFromCalendar(c, 366)
  if (items.length === 0) {
    return c.json({ code: 1, message: '日历采集失败或已无未来期号可采集' })
  }
  const ins = c.env.DB.prepare('INSERT OR IGNORE INTO hk_periods (period_no, draw_date) VALUES (?, ?)')
  let success = 0
  for (const it of items) {
    await ins.bind(it.period_no, it.draw_date).run()
    success++
  }
  return c.json({ code: 0, data: { list: items, success }, message: `采集完成：${success}条` })
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

// 采集香港开奖日历（kjrq.html，静态 HTML 全年日历，td_kj 标记开奖日）
// 未来开奖日期以此日历为唯一来源，严禁按星期几规则推算
async function fetchHKCalendarDates() {
  try {
    const resp = await fetch('https://neetnx-vm3gds.strongfaithpower.com:2096/htm/kjrq.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }
    })
    if (!resp.ok) return []
    const html = await resp.text()
    const dates = []
    const monthRe = /<div id="nf(\d{6})"([\s\S]*?)<\/div>/g
    let m
    while ((m = monthRe.exec(html)) !== null) {
      const year = Number(m[1].slice(0, 4))
      const month = Number(m[1].slice(4, 6))
      const dayRe = /<td class="td_kj[^"]*">\s*(\d{1,2})\s*<\/td>/g
      let dm
      while ((dm = dayRe.exec(m[2])) !== null) {
        dates.push(`${year}-${String(month).padStart(2, '0')}-${String(Number(dm[1])).padStart(2, '0')}`)
      }
    }
    return dates.sort()
  } catch (_) {
    return []
  }
}

// 采集当前期号锚点（qishu.js：hqishu = 下一期期号）
async function fetchHKNextIssue() {
  try {
    const resp = await fetch('https://bvtryh-mwxbg.ruiz-kam-ears.com:2096/kj/caiji/qishu.js', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!resp.ok) return ''
    const m = (await resp.text()).match(/hqishu\s*=\s*'?(\d+)'?/)
    return m ? m[1] : ''
  } catch (_) {
    return ''
  }
}

// 基于日历生成未来期号：日期取日历开奖日（今天起 maxDays 天内，默认 31），期号以 hqishu 为锚点顺延
async function generateFutureFromCalendar(c, maxDays = 31) {
  const dates = await fetchHKCalendarDates()
  if (dates.length === 0) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const future = dates
    .filter(ds => new Date(ds + 'T00:00:00').getTime() >= today.getTime())
    .slice(0, maxDays)
  if (future.length === 0) return []

  // 期号锚点：优先 qishu.js（hqishu 可能为 7 位完整期号或 3 位年内序号），失败时降级为已有最大期号顺延
  let anchorYear = 0
  let anchorSeq = 0
  const rawNo = await fetchHKNextIssue()
  if (/^\d{7}$/.test(rawNo)) {
    anchorYear = Number(rawNo.slice(0, 4))
    anchorSeq = Number(rawNo.slice(4))
  } else if (/^\d{1,3}$/.test(rawNo) && Number(rawNo) > 0) {
    // 3 位年内序号：hqishu 即「下一期」，对应未来第一个开奖日的年份
    anchorYear = Number(future[0].slice(0, 4))
    anchorSeq = Number(rawNo)
  } else {
    const [maxRow, resRow] = await Promise.all([
      c.env.DB.prepare('SELECT period_no FROM hk_periods ORDER BY period_no DESC LIMIT 1').first(),
      c.env.DB.prepare('SELECT period_no, draw_date FROM hk_results ORDER BY period_no DESC LIMIT 1').first()
    ])
    const base = [maxRow && maxRow.period_no, resRow && resRow.period_no].filter(Boolean).sort().pop() || ''
    if (base) {
      // 若最后一条已开奖结果的日期仍落在未来列表内，则它本身就是未来列表第一项，期号不再 +1
      const no = resRow && future.includes(resRow.draw_date) ? base : String(Number(base) + 1)
      anchorYear = Number(no.slice(0, 4))
      anchorSeq = Number(no.slice(4))
    }
  }
  if (!anchorYear || !anchorSeq) return []

  // future[0] 即锚点「下一期」；先使用再递增
  let year = anchorYear
  let seq = anchorSeq - 1
  const items = []
  for (const ds of future) {
    const y = Number(ds.slice(0, 4))
    if (y !== year) { year = y; seq = 0 }
    seq++
    items.push({ period_no: `${year}${String(seq).padStart(3, '0')}`, draw_date: ds })
  }
  return items
}

// 香港期号自动同步：已开奖结果补入期号表 + 无未来期号时从开奖日历采集预填未来 31 天
// 供公开结果接口与 Cron 调用，幂等，用户端零操作
async function syncHKPeriods(c) {
  try {
    // 1) 同步已开奖结果 → 期号表（缺失插入，日期不一致时纠正为真实开奖日期）
    const resRows = await c.env.DB.prepare(
      'SELECT period_no, draw_date FROM hk_results ORDER BY period_no ASC'
    ).all()
    const results = resRows.results || []
    if (results.length > 0) {
      const periodRows = await c.env.DB.prepare(
        'SELECT period_no, draw_date FROM hk_periods'
      ).all()
      const existing = new Map((periodRows.results || []).map(p => [p.period_no, p.draw_date]))
      const ins = c.env.DB.prepare('INSERT OR IGNORE INTO hk_periods (period_no, draw_date) VALUES (?, ?)')
      const upd = c.env.DB.prepare('UPDATE hk_periods SET draw_date = ? WHERE period_no = ?')
      for (const r of results) {
        if (!existing.has(r.period_no)) {
          await ins.bind(r.period_no, r.draw_date).run()
        } else if (existing.get(r.period_no) !== r.draw_date) {
          await upd.bind(r.draw_date, r.period_no).run()
        }
      }
    }

    // 2) 期号表无未来期号时，从开奖日历采集预填未来 31 天（期号以采集源锚点顺延）
    const maxRow = await c.env.DB.prepare(
      'SELECT period_no, draw_date FROM hk_periods ORDER BY period_no DESC LIMIT 1'
    ).first()
    const today = new Date()
    const hasFuture = !!(maxRow && maxRow.draw_date && new Date(maxRow.draw_date + 'T00:00:00') >= today)
    if (!hasFuture) {
      const items = await generateFutureFromCalendar(c)
      if (items.length > 0) {
        const ins = c.env.DB.prepare('INSERT OR IGNORE INTO hk_periods (period_no, draw_date) VALUES (?, ?)')
        for (const it of items) {
          await ins.bind(it.period_no, it.draw_date).run()
        }
      }
    }
  } catch (e) {
    console.error('[SyncHKPeriods] 同步失败:', e.message)
  }
}

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
  await syncHKPeriods(c)
  const rows = await c.env.DB.prepare(
    'SELECT * FROM hk_results ORDER BY period_no DESC'
  ).all()
  return c.json({ code: 0, data: rows.results || [] })
})

// 获取香港开奖结果（按年份）
periods.get('/hk/results/:year', async (c) => {
  const year = c.req.param('year')
  await syncHKPeriods(c)
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

export { periods, syncHKPeriods }
