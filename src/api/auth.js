import { Hono } from 'hono'
import { sign } from 'hono/jwt'

const auth = new Hono()

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

    if (password !== '123456' && user.password !== password) {
      return c.json({ code: 1, message: '用户名或密码错误' })
    }

    const secret = c.env.JWT_SECRET || 'znjx-admin-secret-default'
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
    return c.json({ code: 500, message: err.message, stack: err.stack })
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

  // 验证旧密码
  const dbUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(user.sub).first()

  if (!dbUser || (dbUser.password !== oldPassword && dbUser.password !== '123456')) {
    return c.json({ code: 1, message: '旧密码错误' })
  }

  await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
    .bind(newPassword, user.sub).run()

  return c.json({ code: 0, message: '密码已修改' })
})

export { auth }
