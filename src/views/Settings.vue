<template>
  <el-card>
    <template #header><span>系统设置</span></template>

    <div class="settings-body">
      <el-form label-width="120px" style="max-width:500px">
        <el-form-item label="当前用户">
          <el-input :model-value="username" disabled />
        </el-form-item>
        <el-form-item label="角色">
          <el-input :model-value="role" disabled />
        </el-form-item>
      </el-form>

      <el-divider />

      <h3 style="margin-bottom:16px">数据源配置</h3>
      <el-form :model="apiConfig" label-width="140px" style="max-width:700px">
        <el-form-item label="澳门数据API">
          <el-input v-model="apiConfig.api_url_newmacau" placeholder="https://api3.marksix6.net/lottery_api.php?type=newMacau" size="small" />
        </el-form-item>
        <el-form-item label="香港数据API">
          <el-input v-model="apiConfig.api_url_hk" placeholder="https://api3.marksix6.net/lottery_api.php?type=hk" size="small" />
        </el-form-item>
        <el-form-item label="历史数据API">
          <el-input v-model="apiConfig.api_url_history" placeholder="https://api-2.df1888.com/api/Lottery/GetLotteryList" size="small" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="small" @click="saveApiConfig" :loading="apiSaving">保存配置</el-button>
          <el-button size="small" @click="loadApiConfig">重置</el-button>
        </el-form-item>
      </el-form>

      <el-divider />

      <h3 style="margin-bottom:16px">修改密码</h3>
      <el-form :model="pwdForm" label-width="120px" style="max-width:500px" ref="pwdFormRef">
        <el-form-item label="旧密码" prop="oldPassword" :rules="[{ required: true, message: '请输入旧密码' }]">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword" :rules="[{ required: true, message: '请输入新密码' }, { min: 4, message: '至少4位' }]">
          <el-input v-model="pwdForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="changePassword" :loading="pwdLoading">修改密码</el-button>
        </el-form-item>
      </el-form>
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api/client.js'

const username = ref('')
const role = ref('')
const pwdForm = ref({ oldPassword: '', newPassword: '' })
const pwdLoading = ref(false)
const pwdFormRef = ref(null)

const apiConfig = reactive({
  api_url_newmacau: '',
  api_url_hk: '',
  api_url_history: ''
})
const apiSaving = ref(false)

onMounted(async () => {
  const user = JSON.parse(sessionStorage.getItem('admin_user') || '{}')
  username.value = user.username || ''
  role.value = user.role || ''
  await loadApiConfig()
})

async function loadApiConfig() {
  try {
    const data = await api.get('/api/system/api-config')
    if (data.api_url_newmacau) apiConfig.api_url_newmacau = data.api_url_newmacau
    if (data.api_url_hk) apiConfig.api_url_hk = data.api_url_hk
    if (data.api_url_history) apiConfig.api_url_history = data.api_url_history
  } catch (_) {
    // 首次加载无配置时忽略
  }
}

async function saveApiConfig() {
  apiSaving.value = true
  try {
    const payload = {}
    if (apiConfig.api_url_newmacau) payload.api_url_newmacau = apiConfig.api_url_newmacau
    if (apiConfig.api_url_hk) payload.api_url_hk = apiConfig.api_url_hk
    if (apiConfig.api_url_history) payload.api_url_history = apiConfig.api_url_history
    await api.post('/api/system/api-config', payload)
    ElMessage.success('数据源配置已保存')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    apiSaving.value = false
  }
}

async function changePassword() {
  const valid = await pwdFormRef.value.validate().catch(() => false)
  if (!valid) return

  pwdLoading.value = true
  try {
    await api.post('/api/auth/change-password', pwdForm.value)
    ElMessage.success('密码已修改')
    pwdForm.value = { oldPassword: '', newPassword: '' }
  } catch (err) {
    ElMessage.error(err.message || '修改失败')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped>
.settings-body {
  max-width: 800px;
  margin: 0 auto;
}
@media (max-width: 768px) {
  .settings-body {
    max-width: none;
  }
}
</style>
