<template>
  <div class="results-page">
    <div class="page-header">
      <h2>开奖结果</h2>
      <el-button type="primary" @click="refreshCurrent" :loading="refreshing">刷新</el-button>
    </div>

    <el-tabs v-model="activeTab" @tab-change="fetchData">
      <el-tab-pane label="香港" name="hk">
        <div class="table-wrap">
          <el-table :data="hkList" v-loading="loading" stripe border size="small" style="width:100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="period_no" label="期号" width="110" />
            <el-table-column prop="draw_date" label="日期" width="110" />
            <el-table-column label="平码" min-width="280">
              <template #default="{ row }">
                <span v-for="(n, i) in [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6]" :key="i"
                      class="ball flat-ball">{{ n }}</span>
              </template>
            </el-table-column>
            <el-table-column label="特码" width="80" align="center">
              <template #default="{ row }">
                <span class="ball special-ball">{{ row.special }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-popconfirm title="确认删除？" @confirm="delRow('hk', row.id)">
                  <template #reference>
                    <el-button type="danger" link size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="澳门" name="mo">
        <div class="table-wrap">
          <el-table :data="moList" v-loading="loading" stripe border size="small" style="width:100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="period_no" label="期号" width="110" />
            <el-table-column prop="draw_date" label="日期" width="110" />
            <el-table-column label="平码" min-width="280">
              <template #default="{ row }">
                <span v-for="(n, i) in [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6]" :key="i"
                      class="ball flat-ball">{{ n }}</span>
              </template>
            </el-table-column>
            <el-table-column label="特码" width="80" align="center">
              <template #default="{ row }">
                <span class="ball special-ball">{{ row.special }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-popconfirm title="确认删除？" @confirm="delRow('mo', row.id)">
                  <template #reference>
                    <el-button type="danger" link size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const API_BASE = ''
const token = () => sessionStorage.getItem('admin_token')
const headers = () => ({ Authorization: `Bearer ${token()}` })

const activeTab = ref('hk')
const loading = ref(false)
const refreshing = ref(false)
const hkList = ref([])
const moList = ref([])

async function fetchData() {
  loading.value = true
  try {
    const res = await fetch(
      `${API_BASE}/api/periods/${activeTab.value}/results`,
      { headers: headers() }
    )
    const data = await res.json()
    if (data.code === 0) {
      if (activeTab.value === 'hk') hkList.value = data.data || []
      else moList.value = data.data || []
    } else {
      ElMessage.error(data.message || '加载失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  } finally {
    loading.value = false
  }
}

async function refreshCurrent() {
  refreshing.value = true
  try {
    const res = await fetch(`${API_BASE}/api/${activeTab.value}`, { headers: headers() })
    const data = await res.json()
    ElMessage.info(data.data?.source === 'api' ? '已从API获取最新数据' : '使用缓存数据')
    fetchData()
  } catch (_) {
    ElMessage.error('刷新失败')
  } finally {
    refreshing.value = false
  }
}

async function delRow(type, id) {
  try {
    const res = await fetch(`${API_BASE}/api/periods/${type}/results/${id}`, {
      method: 'DELETE',
      headers: headers()
    })
    const data = await res.json()
    if (data.code === 0) {
      ElMessage.success('删除成功')
      fetchData()
    } else {
      ElMessage.error(data.message || '删除失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  }
}

onMounted(fetchData)
</script>

<style scoped>
.results-page {
  padding: 20px;
}
.table-wrap {
  overflow-x: auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.ball {
  display: inline-block;
  width: 28px;
  height: 28px;
  line-height: 28px;
  text-align: center;
  border-radius: 50%;
  margin: 2px;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
}
.flat-ball {
  background: #409eff;
}
.special-ball {
  background: #e6a23c;
}
</style>
