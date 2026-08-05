import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { activation } from '../src/api/activation.js'

// 生成一个记录所有 prepare/bind 调用的 mock D1
// 说明：D1 支持 prepare 一次、bind/run 多次（批量创建复用同一 stmt），
// 因此 record.binds 记录每次 bind 调用的参数组（数组的数组）
function createMockDB() {
  const calls = []
  const db = {
    calls,
    prepare(sql) {
      const record = { sql, binds: [] }
      calls.push(record)
      const stmt = {
        bind(...args) {
          record.binds.push(args)
          return stmt
        },
        async first() {
          return { total: 0 }
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { success: true }
        }
      }
      return stmt
    }
  }
  return db
}

const insertSql = 'INSERT INTO activation_codes (code, status, issuer) VALUES (?, ?, ?)'
const codePattern = /^[A-HJ-NP-Y]\d{5}$/

function buildApp(db) {
  const app = new Hono()
  app.route('/api/activation', activation)
  return app
}

describe('激活码生成 - issuer 字段', () => {
  let db
  let app

  beforeEach(() => {
    db = createMockDB()
    app = buildApp(db)
  })

  it('单个创建：带 issuer 时正确保存到 INSERT 参数', async () => {
    const res = await app.request('/api/activation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issuer: '张三' })
    }, { DB: db })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(0)
    expect(body.data.code).toMatch(codePattern)

    const insert = db.calls.find(c => c.sql === insertSql)
    expect(insert).toBeDefined()
    expect(insert.binds).toHaveLength(1)
    const [code, status, issuer] = insert.binds[0]
    expect(code).toMatch(codePattern)      // code
    expect(status).toBe('unactivated')     // status
    expect(issuer).toBe('张三')            // issuer
  })

  it('单个创建：不带 issuer 时默认保存为空字符串', async () => {
    const res = await app.request('/api/activation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    }, { DB: db })

    expect(res.status).toBe(200)
    const insert = db.calls.find(c => c.sql === insertSql)
    expect(insert.binds[0][2]).toBe('')
  })

  it('单个创建：无 body 时也能正常创建（issuer 为空）', async () => {
    const res = await app.request('/api/activation', {
      method: 'POST'
    }, { DB: db })

    expect(res.status).toBe(200)
    const insert = db.calls.find(c => c.sql === insertSql)
    expect(insert.binds[0][2]).toBe('')
  })

  it('批量创建：每条记录都保存指定的 issuer', async () => {
    const count = 3
    const res = await app.request('/api/activation/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count, issuer: '渠道A' })
    }, { DB: db })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.count).toBe(count)
    expect(body.data.codes).toHaveLength(count)
    body.data.codes.forEach(code => expect(code).toMatch(codePattern))

    // 批量复用同一 stmt：只 prepare 一次，bind/run 多次
    const inserts = db.calls.filter(c => c.sql === insertSql)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].binds).toHaveLength(count)

    const codes = new Set(inserts[0].binds.map(b => b[0]))
    expect(codes.size).toBe(count) // 生成的码互不重复
    inserts[0].binds.forEach(b => {
      expect(b[1]).toBe('unactivated')
      expect(b[2]).toBe('渠道A')
    })
  })

  it('批量创建：不带 issuer 时全部为空字符串', async () => {
    const res = await app.request('/api/activation/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 2 })
    }, { DB: db })

    expect(res.status).toBe(200)
    const insert = db.calls.find(c => c.sql === insertSql)
    expect(insert.binds).toHaveLength(2)
    insert.binds.forEach(b => expect(b[2]).toBe(''))
  })

  it('列表：按 issuer 筛选时 SQL 带 issuer = ? 且绑定筛选值', async () => {
    const res = await app.request('/api/activation?issuer=张三', {}, { DB: db })

    expect(res.status).toBe(200)
    const select = db.calls.find(c => c.sql.includes('FROM activation_codes'))
    expect(select.sql).toContain('issuer = ?')
    expect(select.binds[0]).toContain('张三')
  })

  it('列表：不筛选 issuer 时 SQL 不含 issuer 条件', async () => {
    const res = await app.request('/api/activation', {}, { DB: db })

    expect(res.status).toBe(200)
    const select = db.calls.find(c => c.sql.includes('FROM activation_codes'))
    expect(select.sql).not.toContain('issuer')
  })
})
