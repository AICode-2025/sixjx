import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { hashPassword, verifyPassword } from '../util/password.js'

const auth = new Hono()

function getJwtSecret(c) {
  const secret = c.env.JWT_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET 未配置或过短，请在 Cloudflare 通过 wrangler secret put JWT_SECRET 配置（至少16位）')
  }
  return secret
}

auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    if (!username || !password) {
      return c.json({ code: 1, message: '请输入用户名和密码' })
    }

    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first()

    if (!user) {
      return c.json({ code: 1, message: '用户名或密码错误' })
    }

    const check = await verifyPassword(password, user.password)
    if (!check.ok) {
      return c.json({ code: 1, message: '用户名或密码错误' })
    }

    // 旧版明文密码首次登录成功后升级为 PBKDF2 哈希
    if (check.needsUpgrade) {
      const hashed = await hashPassword(password)
      await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
        .bind(hashed, user.id).run()
    }

    const secret = getJwtSecret(c)
    const token = await sign(
      { sub: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 },
      secret
    )

    return c.json({
      code: 0,
      data: {
        token,
        user: { username: user.username, role: user.role }
      }
    })
  } catch (err) {
    console.error('[auth/login]', err)
    return c.json({ code: 500, message: '服务器内部错误' })
  }
})

auth.post('/logout', async (c) => {
  return c.json({ code: 0, message: '已退出' })
})

auth.get('/me', async (c) => {
  const user = c.get('user')
  return c.json({
    code: 0,
    data: { username: user.username, role: user.role }
  })
})

auth.post('/change-password', async (c) => {
  const user = c.get('user')
  const { oldPassword, newPassword } = await c.req.json()

  if (!oldPassword || !newPassword) {
    return c.json({ code: 1, message: '请填写旧密码和新密码' })
  }
  if (newPassword.length < 4) {
    return c.json({ code: 1, message: '密码至少4位' })
  }

  // 验证旧密码（支持旧版明文与新版哈希）
  const dbUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(user.sub).first()

  if (!dbUser) {
    return c.json({ code: 1, message: '用户不存在' })
  }

  const check = await verifyPassword(oldPassword, dbUser.password)
  if (!check.ok) {
    return c.json({ code: 1, message: '旧密码错误' })
  }

  const hashed = await hashPassword(newPassword)
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
    .bind(hashed, user.sub).run()

  return c.json({ code: 0, message: '密码已修改' })
})

export { auth }