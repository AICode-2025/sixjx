<template>
  <div class="results-page">
    <div class="page-header">
      <h2>开奖结果</h2>
      <el-button type="primary" @click="refreshCurrent" :loading="refreshing">刷新</el-button>
    </div>

    <div class="filter-bar">
      <el-select v-model="yearFilter" size="small" style="width:130px" @change="applyFilter">
        <el-option label="全部年份" value="" />
        <el-option v-for="y in yearOptions" :key="y" :label="y" :value="y" />
      </el-select>
      <span class="filter-count">共 {{ filteredCount }} 期</span>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="香港" name="hk">
        <div class="table-wrap">
          <el-table :data="hkList" v-loading="loading" stripe border size="small" style="width:100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="period_no" label="期号" width="110" />
            <el-table-column prop="draw_date" label="日期" width="110" />
            <el-table-column label="号码" min-width="320">
              <template #default="{ row }">
                <span v-for="(n, i) in [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6]" :key="i"
                      class="ball-wrap">
                  <span :class="ballClass(n, false)">{{ n }}</span>
                  <span class="zod">{{ zodiacOf(n) }}</span>
                </span>
                <span class="ball-sep">+</span>
                <span class="ball-wrap">
                  <span :class="ballClass(row.special, true)">{{ row.special }}</span>
                  <span class="zod">{{ zodiacOf(row.special) }}</span>
                </span>
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
            <el-table-column label="号码" min-width="320">
              <template #default="{ row }">
                <span v-for="(n, i) in [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6]" :key="i"
                      class="ball-wrap">
                  <span :class="ballClass(n, false)">{{ n }}</span>
                  <span class="zod">{{ zodiacOf(n) }}</span>
                </span>
                <span class="ball-sep">+</span>
                <span class="ball-wrap">
                  <span :class="ballClass(row.special, true)">{{ row.special }}</span>
                  <span class="zod">{{ zodiacOf(row.special) }}</span>
                </span>
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
// 年份筛选：全量数据 + 当前选中年份 + 可用年份选项
const hkAll = ref([])
const moAll = ref([])
const yearFilter = ref(String(new Date().getFullYear()))
const yearOptions = ref([])
const filteredCount = ref(0)

function buildYearOptions() {
  const rows = activeTab.value === 'hk' ? hkAll.value : moAll.value
  const set = new Set()
  rows.forEach(r => {
    const y = String(r.period_no).slice(0, 4)
    if (y) set.add(y)
  })
  yearOptions.value = Array.from(set).sort().reverse()
}

function applyFilter() {
  const rows = activeTab.value === 'hk' ? hkAll.value : moAll.value
  const y = yearFilter.value
  const target = y ? rows.filter(r => String(r.period_no).startsWith(y)) : rows
  if (activeTab.value === 'hk') hkList.value = target
  else moList.value = target
  filteredCount.value = target.length
}

function onTabChange() {
  yearFilter.value = String(new Date().getFullYear())
  fetchData()
}

// 波色映射
const RED_WAVE = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]
const GREEN_WAVE = [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]

// 生肖映射（2026 马年基准，与公开页 results.html 一致）
const ZODIAC = ['马', '蛇', '龙', '兔', '虎', '牛', '鼠', '猪', '狗', '鸡', '猴', '羊']
function zodiacOf(n) {
  return ZODIAC[(Number(n) - 1) % 12]
}

function getWave(n) {
  const num = Number(n)
  if (RED_WAVE.includes(num)) return '红波'
  if (GREEN_WAVE.includes(num)) return '绿波'
  return '蓝波'
}

function ballClass(n, isSpecial) {
  const wave = getWave(n)
  const waveMap = { '红波': 'ball-red', '绿波': 'ball-green', '蓝波': 'ball-blue' }
  return ['ball', waveMap[wave] || 'ball-blue', isSpecial ? 'ball-special' : 'ball-flat']
}

async function fetchData() {
  loading.value = true
  try {
    const res = await fetch(
      `${API_BASE}/api/periods/${activeTab.value}/results`,
      { headers: headers() }
    )
    const data = await res.json()
    if (data.code === 0) {
      const rows = data.data || []
      if (activeTab.value === 'hk') hkAll.value = rows
      else moAll.value = rows
      buildYearOptions()
      applyFilter()
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
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.filter-count {
  font-size: 12px;
  color: #9ca3af;
}
.ball {
  display: inline-block;
  width: 28px;
  height: 28px;
  line-height: 28px;
  text-align: center;
  border-radius: 50%;
  margin: 0;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
}
.ball-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin: 2px;
}
.zod {
  font-size: 9px;
  line-height: 1.2;
  margin-top: 1px;
  color: #6b7280;
  font-weight: 600;
}
.ball-sep {
  margin: 0 6px;
  color: #9ca3af;
  font-weight: 700;
  font-size: 13px;
}
.ball-red {
  background: #e74c3c;
}
.ball-blue {
  background: #3498db;
}
.ball-green {
  background: #27ae60;
}
/* 特码：金色外环 */
.ball-special {
  box-shadow: 0 0 0 2px #f1c40f, 0 0 0 3px #e67e22;
}
/* 平码：白色细环 */
.ball-flat {
  box-shadow: 0 0 0 1px rgba(255,255,255,0.5);
}
</style>
