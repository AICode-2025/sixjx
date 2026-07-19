// 统一 API 客户端
// 所有后端请求都通过此模块发出

function getToken() {
  return sessionStorage.getItem('admin_token')
}

function authHeaders() {
  const token = getToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

async function handleResponse(res) {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(data.message || '请求失败')
  }
  return data.data
}

export const api = {
  get(path, params = {}) {
    const qs = new URLSearchParams(params).toString()
    const url = qs ? `${path}?${qs}` : path
    return fetch(url, {
      headers: { ...authHeaders() }
    }).then(handleResponse)
  },

  post(path, body = {}) {
    return fetch(path, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(handleResponse)
  },

  del(path) {
    return fetch(path, {
      method: 'DELETE',
      headers: { ...authHeaders() }
    }).then(handleResponse)
  }
}

export default api
