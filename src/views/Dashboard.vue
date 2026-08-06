<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:16px;font-weight:600">同步报表记录</div>
            <div style="font-size:12px;color:#909399;margin-top:4px">按 期号×彩种 汇总，点击行展开该期用户明细，可删除单条用户记录</div>
          </div>
          <el-button size="small" @click="fetchReports">刷新</el-button>
        </div>
      </template>
      <el-table :data="reportList" stripe border size="small" v-loading="reportLoading" style="width:100%" @expand-change="onExpand">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-loading="detailLoadingKey === expandKey(row)" style="padding:8px 16px">
              <el-table :data="detailMap[expandKey(row)] || []" size="small" border style="width:100%">
                <el-table-column prop="activation_code" label="激活码" min-width="130" />
                <el-table-column prop="total_bet" label="报单额" width="90" align="right" />
                <el-table-column prop="total_payout" label="派发" width="90" align="right" />
                <el-table-column prop="total_profit" label="盈亏" width="90" align="right" />
                <el-table-column prop="synced_at" label="同步时间" min-width="130" />
                <el-table-column label="操作" width="80" align="center">
                  <template #default="{ row: u }">
                    <el-popconfirm title="确认删除该用户该期记录？" @confirm="delReport(u, row)">
                      <template #reference>
                        <el-button type="danger" link size="small">删除</el-button>
                      </template>
                    </el-popconfirm>
                  </template>
                </el-table-column>
              </el-table>
              <div v-if="!detailMap[expandKey(row)] || detailMap[expandKey(row)].length === 0" style="color:#909399;padding:8px">暂无用户明细</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="period_no" label="期号" width="110" />
        <el-table-column prop="lottery_type" label="彩种" width="80" />
        <el-table-column prop="user_count" label="同步用户数" width="100" align="center" />
        <el-table-column prop="total_bet" label="总报单额" min-width="100" align="right" />
        <el-table-column prop="total_payout" label="总派发" min-width="100" align="right" />
        <el-table-column prop="total_profit" label="总盈亏" min-width="100" align="right" />
        <el-table-column prop="last_synced" label="最后同步" min-width="130" show-overflow-tooltip />
      </el-table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <el-pagination background layout="prev, pager, next, total" :total="reportTotal" :page-size="reportPageSize" v-model:current-page="reportPage" @current-change="fetchReports" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api/client.js'

const reportLoading = ref(false)
const reportList = ref([])
const reportTotal = ref(0)
const reportPage = ref(1)
const reportPageSize = ref(10)
const detailMap = ref({})
const detailLoadingKey = ref('')

function expandKey(row) {
  return `${row.period_no}_${row.lottery_id}`
}

async function fetchReports() {
  reportLoading.value = true
  try {
    const data = await api.get('/api/sync-reports', { page: reportPage.value, pageSize: reportPageSize.value })
    reportList.value = data.list || []
    reportTotal.value = data.total || 0
  } catch (err) {
    console.error(err)
  } finally {
    reportLoading.value = false
  }
}

async function onExpand(row, expandedRows) {
  const isExpanded = expandedRows.some(r => r.period_no === row.period_no && r.lottery_id === row.lottery_id)
  if (!isExpanded) return
  const key = expandKey(row)
  if (detailMap.value[key]) return
  detailLoadingKey.value = key
  try {
    detailMap.value[key] = await api.get(`/api/sync-reports/detail/${row.period_no}`, { lottery_id: row.lottery_id })
  } catch (err) {
    console.error(err)
  } finally {
    detailLoadingKey.value = ''
  }
}

async function delReport(user, row) {
  try {
    await api.del(`/api/sync-reports/${user.id}`)
    ElMessage.success('删除成功')
    const key = expandKey(row)
    detailMap.value[key] = (detailMap.value[key] || []).filter(u => u.id !== user.id)
    fetchReports()
  } catch (err) {
    ElMessage.error(err.message || '删除失败')
  }
}

onMounted(fetchReports)
</script>
