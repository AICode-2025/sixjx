import { Hono } from 'hono'

const activation = new Hono()

// 生成6位激活码：1字母 + 5数字，排除I/O/Z
function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXY'
  return letters[Math.floor(Math.random() * letters.length)] +
    String(Math.floor(Math.random() * 100000)).padStart(5, '0')
}

// 列表（分页，支持状态筛选）
activation.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const pageSize = parseInt(c.req.query('pageSize') || '20')
  const offset = (page - 1) * pageSize
  const keyword = c.req.query('keyword') || ''
  const statusFilter = c.req.query('status') || ''

  let baseSql = 'FROM activation_codes'
  const wheres = []
  const binds = []

  if (keyword) {
    wheres.push('(code LIKE ? OR device_name LIKE ? OR device_id LIKE ?)')
    const like = `%${keyword}%`
    binds.push(like, like, like)
  }
  if (statusFilter) {
    wheres.push('status = ?')
    binds.push(statusFilter)
  }

  if (wheres.length > 0) {
    baseSql += ' WHERE ' + wheres.join(' AND ')
  }

  const countSql = 'SELECT COUNT(*) as total ' + baseSql
  const listSql = 'SELECT * ' + baseSql + ' ORDER BY id DESC LIMIT ? OFFSET ?'

  const total = await c.env.DB.prepare(countSql).bind(...binds).first()
  const list = await c.env.DB.prepare(listSql).bind(...binds, pageSize, offset).all()

  return c.json({
    code: 0,
    data: {
      list: list.results,
      total: total.total,
      page,
      pageSize
    }
  })
})

// 创建单个
activation.post('/', async (c) => {
  const code = generateCode()
  await c.env.DB.prepare(
    'INSERT INTO activation_codes (code, status) VALUES (?, ?)'
  ).bind(code, 'unactivated').run()

  return c.json({ code: 0, data: { code }, message: '创建成功' })
})

// 批量创建
activation.post('/batch', async (c) => {
  const { count } = await c.req.json()
  const num = Math.min(Math.max(parseInt(count) || 10, 1), 100)
  const codes = []

  for (let i = 0; i < num; i++) {
    const code = generateCode()
    codes.push(code)
  }

  const stmt = c.env.DB.prepare('INSERT INTO activation_codes (code, status) VALUES (?, ?)')
  for (const code of codes) {
    await stmt.bind(code, 'unactivated').run()
  }

  return c.json({ code: 0, data: { codes, count: codes.length }, message: `成功生成 ${codes.length} 个激活码` })
})

// 删除
activation.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const item = await c.env.DB.prepare('SELECT * FROM activation_codes WHERE id = ?').bind(id).first()

  if (!item) {
    return c.json({ code: 1, message: '记录不存在' })
  }
  if (item.status === 'activated') {
    return c.json({ code: 1, message: '已激活的码不能删除' })
  }

  await c.env.DB.prepare('DELETE FROM activation_codes WHERE id = ?').bind(id).run()
  return c.json({ code: 0, message: '已删除' })
})

// 批量删除
activation.post('/batch-delete', async (c) => {
  const { ids } = await c.req.json()
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ code: 1, message: '请选择要删除的记录' })
  }

  // 检查是否有已激活的记录
  const activated = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM activation_codes WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'activated'`
  ).bind(...ids).first()

  if (activated.cnt > 0) {
    return c.json({ code: 1, message: '已激活的码不能删除' })
  }

  // 只删除未激活的记录
  await c.env.DB.prepare(
    `DELETE FROM activation_codes WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'unactivated'`
  ).bind(...ids).run()

  return c.json({ code: 0, message: `已删除 ${ids.length} 个激活码` })
})

// 禁用
activation.post('/:id/disable', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(
    "UPDATE activation_codes SET status = 'disabled' WHERE id = ?"
  ).bind(id).run()
  return c.json({ code: 0, message: '已禁用' })
})

// 解绑
activation.post('/:id/unbind', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(
    "UPDATE activation_codes SET device_id = NULL, device_name = NULL, status = 'unactivated', activated_at = NULL WHERE id = ?"
  ).bind(id).run()
  return c.json({ code: 0, message: '已解绑' })
})

// 验证激活码（用户端调用）
activation.post('/verify', async (c) => {
  const { code } = await c.req.json()
  const item = await c.env.DB.prepare(
    'SELECT * FROM activation_codes WHERE code = ?'
  ).bind(code).first()

  if (!item) {
    return c.json({ code: 1, message: '激活码无效' })
  }
  if (item.status === 'disabled') {
    return c.json({ code: 1, message: '激活码已被禁用' })
  }

  return c.json({ code: 0, data: { status: item.status, device_id: item.device_id } })
})

// 注册设备（用户端调用）
activation.post('/register', async (c) => {
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

export { activation }
