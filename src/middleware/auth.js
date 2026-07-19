import { verify } from 'hono/jwt'

export function authMiddleware() {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ code: 401, message: '未登录' }, 401)
    }

    try {
      const token = authHeader.slice(7)
      const secret = c.env.JWT_SECRET || 'znjx-admin-secret-default'
      const payload = await verify(token, secret, 'HS256')
      c.set('user', payload)
      await next()
    } catch (err) {
      return c.json({ code: 401, message: '登录已过期' }, 401)
    }
  }
}
