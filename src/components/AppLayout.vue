<template>
  <div class="layout">
    <!-- 移动端遮罩层 -->
    <div v-if="mobileOpen" class="mobile-overlay" @click="mobileOpen = false"></div>

    <!-- 侧边栏 -->
    <aside :class="['sidebar', { collapsed: isCollapse, 'mobile-show': mobileOpen }]">
      <Sidebar :is-collapse="isCollapse" @toggle="toggleSidebar" />
    </aside>

    <div class="main-area">
      <!-- 顶部栏 -->
      <header class="header">
        <div class="header-left">
          <!-- 移动端：菜单按钮 -->
          <el-icon class="menu-btn" style="cursor:pointer;font-size:20px" @click="mobileOpen = true">
            <Operation />
          </el-icon>
          <!-- PC端：折叠按钮 -->
          <el-icon class="collapse-btn-pc" style="cursor:pointer;font-size:20px" @click="toggleSidebar">
            <Fold v-if="!isCollapse" />
            <Expand v-else />
          </el-icon>
          <span class="header-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:14px">
              <el-icon><User /></el-icon>
              {{ username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 内容区 -->
      <main class="main" :class="{ 'has-bottom-tabs': isMobile }">
        <div class="main-content">
          <router-view />
        </div>
      </main>

      <!-- 移动端底部导航 -->
      <nav v-if="isMobile" class="bottom-tabs">
        <div
          v-for="tab in bottomTabs"
          :key="tab.path"
          :class="['tab-item', { active: currentRoute === tab.path }]"
          @click="navigateTo(tab.path)"
        >
          <el-icon :size="20"><component :is="tab.icon" /></el-icon>
          <span class="tab-label">{{ tab.label }}</span>
        </div>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import { List } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const isCollapse = ref(false)
const mobileOpen = ref(false)
const username = ref('')
const isMobile = ref(false)
const isSmallPc = ref(false)
const currentRoute = ref('/dashboard')

const bottomTabs = [
  { path: '/dashboard', label: '概览', icon: 'DataAnalysis' },
  { path: '/sync-reports', label: '报表', icon: 'TrendCharts' },
  { path: '/hk-periods', label: '期号', icon: 'Calendar' },
  { path: '/results', label: '历史', icon: 'List' },
  { path: '/settings', label: '设置', icon: 'Setting' }
]

const pageTitle = computed(() => {
  const map = { '/dashboard': '首页概览', '/sync-reports': '同步报表', '/hk-periods': '期号管理', '/results': '开奖历史', '/settings': '系统设置' }
  return map[currentRoute.value] || '数据分析系统'
})

function checkScreen() {
  const w = window.innerWidth
  isMobile.value = w <= 768
  isSmallPc.value = w > 768 && w < 1200
}

function handleCommand(cmd) {
  if (cmd === 'logout') {
    sessionStorage.removeItem('admin_token')
    sessionStorage.removeItem('admin_user')
    router.push('/login')
  }
}

onMounted(() => {
  checkScreen()
  window.addEventListener('resize', checkScreen)
  const user = JSON.parse(sessionStorage.getItem('admin_user') || '{}')
  username.value = user.username || '管理员'
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreen)
})

function toggleSidebar() {
  if (isMobile.value) {
    mobileOpen.value = !mobileOpen.value
  } else {
    isCollapse.value = !isCollapse.value
  }
}

function navigateTo(path) {
  currentRoute.value = path
  router.push(path)
}

// 监听路由变化
watch(() => route.path, (path) => {
  currentRoute.value = path
}, { immediate: true })
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 移动端遮罩 */
.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 999;
}
@media (max-width: 768px) {
  .mobile-overlay { display: block; }
}

/* 侧边栏 */
.sidebar {
  width: 220px;
  background: #304156;
  transition: width 0.3s, transform 0.3s;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar.collapsed {
  width: 64px;
}
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
    transform: translateX(-100%);
    width: 240px !important;
  }
  .sidebar.mobile-show {
    transform: translateX(0);
  }
}

/* 主区域 */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 顶部栏 */
.header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 56px;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-title {
  font-size: 16px;
  white-space: nowrap;
}
@media (max-width: 768px) {
  .header-title { font-size: 14px; }
}
.menu-btn {
  display: none;
}
.collapse-btn-pc {
  display: inline-flex;
}
@media (max-width: 768px) {
  .menu-btn { display: inline-flex; }
  .collapse-btn-pc { display: none; }
}

/* 内容区 */
.main {
  background: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.main-content {
  max-width: 1440px;
  margin: 0 auto;
}
@media (min-width: 1921px) {
  .main { padding: 20px 40px; }
}
@media (max-width: 1200px) and (min-width: 769px) {
  .main { padding: 16px; }
}
@media (max-width: 768px) {
  .main { padding: 12px; }
  .main-content {
    max-width: none;
  }
  .main.has-bottom-tabs { padding-bottom: 72px; }
}

/* 移动端底部导航 */
.bottom-tabs {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #e6e6e6;
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 56px;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}
.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 6px 12px;
  color: #909399;
  transition: color 0.2s;
  user-select: none;
  flex: 1;
}
.tab-item.active {
  color: #409eff;
}
.tab-item .tab-label {
  font-size: 11px;
  line-height: 1;
}
</style>
