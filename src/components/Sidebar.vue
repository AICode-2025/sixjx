<template>
  <div class="sidebar-content">
    <div class="logo" :style="{ padding: isCollapse ? '16px 10px' : '16px 20px' }">
      <span v-if="!isCollapse" style="color:#fff;font-size:18px;font-weight:bold">管理系统</span>
      <span v-else style="color:#fff;font-size:16px">管</span>
    </div>
    <el-menu
      :default-active="activeMenu"
      :collapse="isCollapse"
      background-color="#304156"
      text-color="#bfcbd9"
      active-text-color="#409eff"
      router
    >
      <el-menu-item index="/dashboard">
        <el-icon><DataAnalysis /></el-icon>
        <span>首页概览</span>
      </el-menu-item>
      <el-menu-item index="/activation">
        <el-icon><Key /></el-icon>
        <span>激活码管理</span>
      </el-menu-item>
      <el-menu-item index="/sync-reports">
        <el-icon><Document /></el-icon>
        <span>同步报表</span>
      </el-menu-item>
      <el-menu-item index="/hk-periods">
        <el-icon><Calendar /></el-icon>
        <span>期号管理</span>
      </el-menu-item>
      <el-menu-item index="/settings">
        <el-icon><Setting /></el-icon>
        <span>系统设置</span>
      </el-menu-item>
    </el-menu>
    <div class="collapse-btn" @click="$emit('toggle')">
      <el-icon style="color:#bfcbd9;cursor:pointer;font-size:18px">
        <Fold v-if="!isCollapse" />
        <Expand v-else />
      </el-icon>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { List } from '@element-plus/icons-vue'

const props = defineProps({
  isCollapse: Boolean
})
defineEmits(['toggle'])

const route = useRoute()
const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/dashboard')) return '/dashboard'
  if (path.startsWith('/activation')) return '/activation'
  if (path.startsWith('/sync-reports')) return '/sync-reports'
  if (path.startsWith('/hk-periods')) return '/hk-periods'
  if (path.startsWith('/results')) return '/results'
  if (path.startsWith('/settings')) return '/settings'
  return '/dashboard'
})
</script>

<style scoped>
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.logo {
  border-bottom: 1px solid rgba(255,255,255,0.1);
  text-align: center;
}
.el-menu {
  border-right: none;
  flex: 1;
}
.collapse-btn {
  padding: 12px 0;
  text-align: center;
  border-top: 1px solid rgba(255,255,255,0.1);
}
</style>
