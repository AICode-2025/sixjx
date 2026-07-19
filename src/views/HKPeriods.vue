<template>
  <div class="hk-periods-page">
    <div class="page-header">
      <h2>香港期号管理</h2>
      <div class="header-actions">
        <el-button type="warning" @click="importFromLocal">导入默认数据</el-button>
        <el-button type="primary" @click="showAdd = true">新增期号</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe border size="small" style="width:100%">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="period_no" label="期号" width="120" />
      <el-table-column prop="draw_date" label="开奖日期" width="140" />
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" min-width="160">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="editRow(row)">编辑</el-button>
          <el-popconfirm title="确认删除此期号？" @confirm="delRow(row.id)">
            <template #reference>
              <el-button type="danger" link size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showAdd" title="新增期号" width="400px" @close="resetForm">
      <el-form :model="form" label-width="80px">
        <el-form-item label="期号" required>
          <el-input v-model="form.period_no" placeholder="如 2026083" maxlength="7" />
        </el-form-item>
        <el-form-item label="开奖日期" required>
          <el-date-picker v-model="form.draw_date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="编辑期号" width="400px" @close="resetForm">
      <el-form :model="form" label-width="80px">
        <el-form-item label="期号" required>
          <el-input v-model="form.period_no" placeholder="如 2026083" maxlength="7" />
        </el-form-item>
        <el-form-item label="开奖日期" required>
          <el-date-picker v-model="form.draw_date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="submitEdit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const API_BASE = ''
const token = () => sessionStorage.getItem('admin_token')

const list = ref([])
const loading = ref(false)
const showAdd = ref(false)
const showEdit = ref(false)
const submitting = ref(false)
const editingId = ref(null)
const form = ref({ period_no: '', draw_date: '' })

async function fetchList() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/periods/hk`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
    const data = await res.json()
    if (data.code === 0) list.value = data.data || []
    else ElMessage.error(data.message || '加载失败')
  } catch (_) {
    ElMessage.error('网络错误')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = { period_no: '', draw_date: '' }
  editingId.value = null
}

async function submitForm() {
  if (!form.value.period_no || !form.value.draw_date) {
    return ElMessage.warning('请填写完整信息')
  }
  submitting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/periods/hk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form.value)
    })
    const data = await res.json()
    if (data.code === 0) {
      ElMessage.success('创建成功')
      showAdd.value = false
      fetchList()
    } else {
      ElMessage.error(data.message || '创建失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  } finally {
    submitting.value = false
  }
}

function editRow(row) {
  editingId.value = row.id
  form.value = { period_no: row.period_no, draw_date: row.draw_date }
  showEdit.value = true
}

async function submitEdit() {
  if (!form.value.period_no || !form.value.draw_date) {
    return ElMessage.warning('请填写完整信息')
  }
  submitting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/periods/hk/${editingId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form.value)
    })
    const data = await res.json()
    if (data.code === 0) {
      ElMessage.success('更新成功')
      showEdit.value = false
      fetchList()
    } else {
      ElMessage.error(data.message || '更新失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  } finally {
    submitting.value = false
  }
}

async function delRow(id) {
  try {
    const res = await fetch(`${API_BASE}/api/periods/hk/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` }
    })
    const data = await res.json()
    if (data.code === 0) {
      ElMessage.success('删除成功')
      fetchList()
    } else {
      ElMessage.error(data.message || '删除失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  }
}

// 从本地硬编码导入全部默认期号
async function importFromLocal() {
  const defaultPeriods = [
    ['2026001','2026-01-03'],['2026002','2026-01-06'],['2026003','2026-01-08'],['2026004','2026-01-10'],
    ['2026005','2026-01-13'],['2026006','2026-01-15'],['2026007','2026-01-17'],['2026008','2026-01-20'],
    ['2026009','2026-01-22'],['2026010','2026-01-24'],['2026011','2026-01-27'],['2026012','2026-01-29'],
    ['2026013','2026-01-31'],['2026014','2026-02-03'],['2026015','2026-02-05'],['2026016','2026-02-07'],
    ['2026017','2026-02-10'],['2026018','2026-02-12'],['2026019','2026-02-15'],['2026020','2026-02-21'],
    ['2026021','2026-02-24'],['2026022','2026-02-26'],['2026023','2026-02-28'],['2026024','2026-03-03'],
    ['2026025','2026-03-05'],['2026026','2026-03-07'],['2026027','2026-03-10'],['2026028','2026-03-12'],
    ['2026029','2026-03-17'],['2026030','2026-03-19'],['2026031','2026-03-21'],['2026032','2026-03-24'],
    ['2026033','2026-03-26'],['2026034','2026-03-28'],['2026035','2026-03-31'],['2026036','2026-04-04'],
    ['2026037','2026-04-07'],['2026038','2026-04-09'],['2026039','2026-04-11'],['2026040','2026-04-14'],
    ['2026041','2026-04-16'],['2026042','2026-04-18'],['2026043','2026-04-21'],['2026044','2026-04-23'],
    ['2026045','2026-04-25'],['2026046','2026-05-02'],['2026047','2026-05-05'],['2026048','2026-05-07'],
    ['2026049','2026-05-10'],['2026050','2026-05-12'],['2026051','2026-05-14'],['2026052','2026-05-16'],
    ['2026053','2026-05-19'],['2026054','2026-05-21'],['2026055','2026-05-23'],['2026056','2026-05-26'],
    ['2026057','2026-05-28'],['2026058','2026-05-30'],['2026059','2026-06-02'],['2026060','2026-06-04'],
    ['2026061','2026-06-06'],['2026062','2026-06-09'],['2026063','2026-06-11'],['2026064','2026-06-14'],
    ['2026065','2026-06-18'],['2026066','2026-06-20'],['2026067','2026-06-23'],['2026068','2026-06-25'],
    ['2026069','2026-06-28'],['2026070','2026-06-30'],['2026071','2026-07-02'],['2026072','2026-07-05'],
    ['2026073','2026-07-07'],['2026074','2026-07-09'],['2026075','2026-07-11'],['2026076','2026-07-14'],
    ['2026077','2026-07-16'],['2026078','2026-07-21'],['2026079','2026-07-23'],['2026080','2026-07-25'],
    ['2026081','2026-07-28'],['2026082','2026-07-30']
  ]
  try {
    const res = await fetch(`${API_BASE}/api/periods/hk/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ list: defaultPeriods.map(([n, d]) => ({ period_no: n, draw_date: d })) })
    })
    const data = await res.json()
    if (data.code === 0) {
      ElMessage.success(data.message || '导入完成')
      fetchList()
    } else {
      ElMessage.error(data.message || '导入失败')
    }
  } catch (_) {
    ElMessage.error('网络错误')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.hk-periods-page {
  padding: 20px;
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
.header-actions {
  display: flex;
  gap: 10px;
}
</style>
