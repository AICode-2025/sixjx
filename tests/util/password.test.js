import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/util/password.js'

describe('password util', () => {
  it('哈希后可正确校验', async () => {
    const hash = await hashPassword('s3cret!')
    expect(hash.startsWith('pbkdf2$v1$')).toBe(true)
    const check = await verifyPassword('s3cret!', hash)
    expect(check.ok).toBe(true)
    expect(check.needsUpgrade).toBe(false)
  })

  it('错误密码不通过', async () => {
    const hash = await hashPassword('s3cret!')
    const check = await verifyPassword('wrong', hash)
    expect(check.ok).toBe(false)
  })

  it('同一密码两次哈希盐不同（结果不同）', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
  })

  it('旧版明文密码：命中时标记 needsUpgrade', async () => {
    const check = await verifyPassword('123456', '123456')
    expect(check.ok).toBe(true)
    expect(check.needsUpgrade).toBe(true)
  })

  it('旧版明文密码：不匹配时失败', async () => {
    const check = await verifyPassword('abcdef', '123456')
    expect(check.ok).toBe(false)
  })
})