<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <span>激活码管理</span>
          <div style="display:flex;gap:8px">
            <el-button type="primary" size="small" @click="showGenerate = true">生成</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="statusFilter" @tab-change="page=1; fetchData()" style="margin-bottom:12px">
        <el-tab-pane label="全部" name="" />
        <el-tab-pane label="未激活" name="unactivated" />
        <el-tab-pane label="已激活" name="activated" />
        <el-tab-pane label="已禁用" name="disabled" />
      </el-tabs>

      <div class="search-bar">
        <el-input v-model="keyword" placeholder="搜索激活码/设备" style="max-width:300px;width:100%" clearable @clear="fetchData" />
        <el-button @click="fetchData">搜索</el-button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px" v-if="selectedIds.length > 0">
        <span style="font-size:13px;color:#606266">已选 {{ selectedIds.length }} 项</span>
        <el-button size="small" type="danger" @click="handleBatchDelete">批量删除</el-button>
        <el-button size="small" @click="selectedIds = []">取消选择</el-button>
      </div>

      <div style="overflow-x:auto">
        <el-table :data="list" stripe v-loading="loading" style="width:100%" @selection-change="onSelectionChange" @row-dblclick="copyCode">
          <el-table-column type="selection" width="50" />
          <el-table-column prop="code" label="激活码" min-width="140" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="device_name" label="设备名称" min-width="100" />
          <el-table-column label="操作" width="130">
            <template #default="{ row }">
              <el-button size="small" type="warning" @click="handleUnbind(row)" v-if="row.status === 'activated'">解绑</el-button>
              <el-button size="small" type="danger" @click="handleDelete(row)" v-if="row.status === 'unactivated'">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <el-pagination
          v-model:current-page="page"
          :page-sizes="[20, 50, 100]"
          :page-size="pageSize"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @size-change="pageSize = $event; fetchData()"
          @current-change="page = $event; fetchData()"
        />
      </div>
    </el-card>

    <el-dialog v-model="showGenerate" title="生成激活码" width="360px" @close="genCount=1">
      <el-form label-width="80px">
        <el-form-item label="生成数量">
          <el-input-number v-model="genCount" :min="1" :max="100" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerate = false">取消</el-button>
        <el-button type="primary" @click="handleGenerate" :loading="genLoading">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api/client.js'

const loading = ref(false)
const list = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const keyword = ref('')
const statusFilter = ref('')

const showGenerate = ref(false)
const genCount = ref(1)
const genLoading = ref(false)
const selectedIds = ref([])

function onSelectionChange(rows) {
  selectedIds.value = rows.map(r => r.id)
}

async function handleBatchDelete() {
  if (selectedIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个激活码？`, '确认')
    await api.post('/api/activation/batch-delete', { ids: selectedIds.value })
    ElMessage.success(`已删除 ${selectedIds.value.length} 个激活码`)
    selectedIds.value = []
    fetchData()
  } catch (err) {
    if (err.message !== 'cancel') ElMessage.error(err.message)
  }
}

function statusType(status) {
  return { unactivated: 'info', activated: 'success', disabled: 'danger' }[status] || 'info'
}

function statusText(status) {
  return { unactivated: '未激活', activated: '已激活', disabled: '已禁用' }[status] || status
}

async function fetchData() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    const data = await api.get('/api/activation', params)
    list.value = data.list
    total.value = data.total
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  const count = genCount.value
  if (count < 1) return
  genLoading.value = true
  try {
    if (count === 1) {
      const data = await api.post('/api/activation')
      ElMessage.success(`已生成：${data.code}`)
    } else {
      const data = await api.post('/api/activation/batch', { count })
      ElMessage.success(`已生成 ${data.codes.length} 个激活码`)
    }
    showGenerate.value = false
    genCount.value = 1
    fetchData()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    genLoading.value = false
  }
}

async function handleUnbind(row) {
  try {
    await ElMessageBox.confirm(`确定解绑激活码 ${row.code}？`, '确认')
    await api.post(`/api/activation/${row.id}/unbind`)
    ElMessage.success('已解绑')
    fetchData()
  } catch (err) {
    if (err.message !== 'cancel') ElMessage.error(err.message)
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除激活码 ${row.code}？`, '确认')
    await api.del(`/api/activation/${row.id}`)
    ElMessage.success('已删除')
    fetchData()
  } catch (err) {
    if (err.message !== 'cancel') ElMessage.error(err.message)
  }
}

function copyCode(row) {
  const code = row.code
  navigator.clipboard.writeText(code).then(() => {
    ElMessage.success(`已复制：${code}`)
  }).catch(() => {
    ElMessage.success(`已复制：${code}`)
  })
}

onMounted(fetchData)
</script>

<style scoped>
.search-bar {
  margin-bottom: 16px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
@media (max-width: 480px) {
  .search-bar { flex-direction: column; }
}
</style>
