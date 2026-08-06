/**
 * 密码哈希工具（WebCrypto PBKDF2，无第三方依赖，兼容 Cloudflare Workers）
 * 兼容旧版明文密码：verify 时命中明文会标记 needsUpgrade，由调用方落库升级
 */

// 迭代次数受 Cloudflare Workers 免费计划 CPU 时间限制（10ms/请求），120000 次会超限导致 500
const ITERATIONS = 1000
const KEY_LENGTH = 32 // 256-bit
const HASH = 'SHA-256'
const PREFIX = 'pbkdf2$v1$'

function bufToB64(buf) {
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function b64ToBuf(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password, salt, iterations = ITERATIONS) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH },
    keyMaterial,
    KEY_LENGTH * 8
  )
  return new Uint8Array(bits)
}

/** 生成密码哈希（随机盐），格式：pbkdf2$v1$<iter>$<salt>$<key> */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt, ITERATIONS)
  return PREFIX + ITERATIONS + '$' + bufToB64(salt) + '$' + bufToB64(key)
}

/**
 * 校验密码
 * @returns {{ ok: boolean, needsUpgrade: boolean }} needsUpgrade 表示命中旧版明文，调用方应升级为哈希
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith(PREFIX)) {
    const parts = stored.split('$')
    // 新格式 5 段（含迭代次数）；兼容旧格式 4 段（用当前默认迭代次数）
    if (parts.length !== 4 && parts.length !== 5) return { ok: false, needsUpgrade: false }
    const iter = parts.length === 5 ? parseInt(parts[2], 10) : ITERATIONS
    const saltIdx = parts.length === 5 ? 3 : 2
    const keyIdx = parts.length === 5 ? 4 : 3
    if (!Number.isFinite(iter) || iter < 1) return { ok: false, needsUpgrade: false }
    const salt = b64ToBuf(parts[saltIdx])
    const expected = b64ToBuf(parts[keyIdx])
    const key = await deriveKey(password, salt, iter)
    if (key.length !== expected.length) return { ok: false, needsUpgrade: false }
    let diff = 0
    for (let i = 0; i < key.length; i++) diff |= key[i] ^ expected[i]
    return { ok: diff === 0, needsUpgrade: false }
  }
  // 旧版明文密码：仅做相等比对，成功后由调用方升级
  const ok = stored === String(password)
  return { ok, needsUpgrade: ok }
}

export default { hashPassword, verifyPassword }