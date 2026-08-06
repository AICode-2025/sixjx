<template>
  <div>
    <el-card style="margin-bottom:16px">
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

    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:16px;font-weight:600">报单统计</div>
            <div style="font-size:12px;color:#909399;margin-top:4px">所有用户的「特」玩法报单数据，按彩票类型区分</div>
          </div>
          <el-button size="small" @click="fetchData">刷新</el-button>
        </div>
      </template>

      <div class="filter-bar">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span
            v-for="tab in lotteryTabs"
            :key="tab"
            :class="['tab-btn', { active: currentType === tab }]"
            :style="tabStyle(tab)"
            @click="switchType(tab)"
          >{{ tab }}</span>
        </div>
        <el-select v-model="selectedPeriod" placeholder="全部期号" size="small" style="min-width:120px" @change="onPeriodChange">
          <el-option label="全部期号" value="" />
          <el-option v-for="p in availablePeriods" :key="p" :label="p" :value="p" />
        </el-select>
      </div>

      <div v-loading="loading" style="min-height:200px">
        <div v-if="numberList.length === 0" style="padding:48px 24px;text-align:center;color:#909399">
          {{ currentType }}暂无报单数据
        </div>
        <div v-else v-for="item in numberList" :key="item.bet_number" :style="numberRowStyle(item)">
          <div style="display:flex;flex:1;align-items:center;gap:12px">
            <div :style="numberBubbleStyle(item)">{{ item.bet_number }}</div>
            <div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden">
              <div :style="energyBarStyle(item)"></div>
            </div>
          </div>
          <div style="font-size:14px;font-weight:600;color:#1f2937;white-space:nowrap;min-width:60px;text-align:right;padding-right:16px">
            {{ formatAmount(item.total_amount) }}
          </div>
          <div :style="simResultStyle(item)" style="font-size:13px;font-weight:700;white-space:nowrap;width:100px;text-align:right">
            {{ formatSimResult(calcSimValue(item)) }}
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api/client.js'

const loading = ref(false)
const numberList = ref([])
const currentType = ref('澳门')
const lotteryTabs = ref(['澳门', '香港'])
const selectedPeriod = ref('')
const availablePeriods = ref([])
const rawData = ref([])

// 同步报表记录（按期号×彩种汇总 + 展开用户明细）
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
    fetchData()
  } catch (err) {
    ElMessage.error(err.message || '删除失败')
  }
}

const waveMap = {
  '01':'蓝波','02':'蓝波','03':'蓝波','04':'蓝波','05':'蓝波','06':'蓝波','07':'蓝波','08':'蓝波',
  '09':'蓝波','10':'蓝波',
  '11':'红波','12':'红波','13':'红波','14':'红波','15':'红波','16':'红波','17':'红波','18':'红波','19':'红波','20':'红波',
  '21':'蓝波','22':'蓝波','23':'蓝波','24':'蓝波','25':'蓝波','26':'蓝波','27':'蓝波','28':'蓝波','29':'蓝波','30':'蓝波',
  '31':'绿波','32':'绿波','33':'绿波','34':'绿波','35':'绿波','36':'绿波','37':'绿波','38':'绿波','39':'绿波','40':'绿波',
  '41':'红波','42':'红波','43':'红波','44':'红波','45':'红波','46':'红波','47':'红波','48':'红波','49':'红波'
}

const waveColors = { '红波': '#dc2626', '绿波': '#16a34a', '蓝波': '#2563eb' }
const waveBgs = { '红波': '#fef2f2', '绿波': '#f0fdf4', '蓝波': '#eff6ff' }

function getWave(num) { return waveMap[num] || '' }
function getWaveColor(num) { return waveColors[getWave(num)] || '#6b7280' }
function getWaveBg(num) { return waveBgs[getWave(num)] || '#f9fafb' }

function formatAmount(val) {
  if (!val) return '0'
  return Number(val).toFixed(0)
}

function calcSimValue(item) {
  const odds = 47.0
  const total = rawData.value.reduce((s, lt) => {
    if (lt.lottery_type === currentType.value) {
      return s + (lt.list || []).reduce((ss, i) => ss + (i.total_amount || 0), 0)
    }
    return s
  }, 0)
  return total - (item.total_amount * odds)
}

function formatSimResult(amount) {
  if (amount === null || amount === undefined) return '—'
  const n = Math.round(amount)
  const formatted = Math.abs(n).toLocaleString()
  return amount >= 0 ? '+' + formatted : '-' + formatted
}

function getSimColor(amount) {
  if (amount === null || amount === undefined) return '#9ca3af'
  if (amount <= -30000) return '#991b1b'
  if (amount <= -10000) return '#c2410c'
  if (amount > 0) return '#15803d'
  return '#9ca3af'
}

function tabStyle(tab) {
  const isActive = tab === currentType.value
  const color = tab === '澳门' ? '#dc2626' : '#2563eb'
  return {
    cursor: 'pointer',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    background: isActive ? color : '#f3f4f6',
    color: isActive ? '#fff' : '#374151',
    border: 'none',
    transition: 'all 0.2s'
  }
}

function numberRowStyle(item) {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: getWaveBg(item.bet_number),
    borderRadius: '6px',
    marginBottom: '6px'
  }
}

function numberBubbleStyle(item) {
  return {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: '#fff',
    background: getWaveColor(item.bet_number)
  }
}

function energyBarStyle(item) {
  const maxAmount = getMaxAmount()
  const pct = maxAmount > 0 ? Math.round(item.total_amount / maxAmount * 100) : 0
  return {
    height: '100%',
    borderRadius: '4px',
    background: getWaveColor(item.bet_number),
    width: pct + '%'
  }
}

function simResultStyle(item) {
  return {
    fontSize: '13px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    width: '100px',
    textAlign: 'right',
    color: getSimColor(calcSimValue(item))
  }
}

function getMaxAmount() {
  if (numberList.value.length === 0) return 0
  return Math.max(...numberList.value.map(i => i.total_amount))
}

function switchType(tab) {
  currentType.value = tab
  selectedPeriod.value = ''
  updatePeriods(tab)
  renderCurrentType()
}

function updatePeriods(type) {
  const data = rawData.value.find(lt => lt.lottery_type === type)
  availablePeriods.value = data ? (data.periods || []) : []
}

function onPeriodChange() {
  fetchData()
}

function renderCurrentType() {
  const data = rawData.value.find(lt => lt.lottery_type === currentType.value)
  if (data && data.list) {
    const numMap = {}
    for (const item of (data.list || [])) {
      numMap[item.bet_number] = item
    }
    const fullList = []
    for (let i = 1; i <= 49; i++) {
      const key = String(i).padStart(2, '0')
      if (numMap[key]) {
        fullList.push(numMap[key])
      } else {
        fullList.push({ bet_number: key, total_amount: 0, total_payout: 0, total_count: 0 })
      }
    }
    numberList.value = fullList
  } else {
    numberList.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const params = {}
    if (selectedPeriod.value) params.period_no = selectedPeriod.value

    const data = await api.get('/api/sync-reports/number-stats', params)
    rawData.value = data.lottery_list || []
    if (rawData.value.length > 0) {
      rawData.value.sort((a, b) => a.lottery_type === '澳门' ? -1 : 1)
      currentType.value = rawData.value[0].lottery_type
      lotteryTabs.value = rawData.value.map(lt => lt.lottery_type)
      updatePeriods(currentType.value)
      renderCurrentType()
    } else {
      lotteryTabs.value = ['澳门', '香港']
      currentType.value = '澳门'
      availablePeriods.value = []
      numberList.value = []
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  fetchReports()
})
</script>

<style scoped>
.tab-btn {
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  transition: all 0.2s;
  user-select: none;
}
.tab-btn:hover { opacity: 0.85; }
.filter-bar {
  padding: 8px 0 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 16px;
}
@media (max-width: 480px) {
  .filter-bar { flex-direction: column; align-items: stretch; }
}
</style>
