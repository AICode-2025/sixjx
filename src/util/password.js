/**
 * 密码哈希工具（WebCrypto PBKDF2，无第三方依赖，兼容 Cloudflare Workers）
 * 兼容旧版明文密码：verify 时命中明文会标记 needsUpgrade，由调用方落库升级
 */

const ITERATIONS = 120000
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

async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    KEY_LENGTH * 8
  )
  return new Uint8Array(bits)
}

/** 生成密码哈希（随机盐） */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  return PREFIX + bufToB64(salt) + '$' + bufToB64(key)
}

/**
 * 校验密码
 * @returns {{ ok: boolean, needsUpgrade: boolean }} needsUpgrade 表示命中旧版明文，调用方应升级为哈希
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith(PREFIX)) {
    const parts = stored.split('$')
    if (parts.length !== 4) return { ok: false, needsUpgrade: false }
    const salt = b64ToBuf(parts[2])
    const expected = b64ToBuf(parts[3])
    const key = await deriveKey(password, salt)
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