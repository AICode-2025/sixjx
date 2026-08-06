<template>
  <div>
    <el-card>
      <template #header><span>近期同步报表</span></template>
      <div class="table-wrap">
        <el-table :data="recentReports" stripe v-loading="loading" style="width:100%">
          <el-table-column prop="period_no" label="期号" width="100" />
          <el-table-column prop="lottery_type" label="彩种" width="70" />
          <el-table-column prop="user_count" label="同步用户数" min-width="90" />
          <el-table-column prop="total_bet" label="总报单额" min-width="100" show-overflow-tooltip />
          <el-table-column prop="total_payout" label="总派发" min-width="100" show-overflow-tooltip />
          <el-table-column prop="total_profit" label="总盈亏" min-width="100" show-overflow-tooltip />
          <el-table-column prop="last_synced" label="最后同步" min-width="120" show-overflow-tooltip />
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api/client.js'

const loading = ref(false)
const recentReports = ref([])

onMounted(async () => {
  loading.value = true
  try {
    const data = await api.get('/api/sync-reports', { page: 1, pageSize: 10 })
    recentReports.value = data.list
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.table-wrap {
  overflow-x: auto;
}
</style>
