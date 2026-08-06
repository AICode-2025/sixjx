import { verify } from 'hono/jwt'

export function authMiddleware() {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ code: 401, message: '未登录' }, 401)
    }

    // JWT 密钥必须通过环境变量/Secret 配置，禁止硬编码兜底
    const secret = c.env.JWT_SECRET
    if (!secret || secret.length < 16) {
      console.error('[auth] JWT_SECRET 未配置或过短')
      return c.json({ code: 500, message: '服务端 JWT_SECRET 未配置' }, 500)
    }

    try {
      const token = authHeader.slice(7)
      const payload = await verify(token, secret, 'HS256')
      c.set('user', payload)
      await next()
    } catch (err) {
      return c.json({ code: 401, message: '登录已过期' }, 401)
    }
  }
}