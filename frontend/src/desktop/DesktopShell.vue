<script setup>
// Khung desktop chuẩn MDS: MHeaderBar (brand) + MSidebar trắng 200/64px + vùng nội dung nền xám.
// Ẩn các tiện ích header ngoài scope (AVA, Tin nhắn, Thông báo, Tính năng mới, Trợ giúp, Khác, Thiết lập) — không đảo thứ tự phần còn lại.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MHeaderBar from '@/components/mds/MHeaderBar.vue'
import MSidebar from '@/components/mds/MSidebar.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import { session, logout, isAdmin } from '@/lib/session.js'

const props = defineProps({
  active: { type: String, default: '' },
  // full: vùng nội dung không padding/không cuộn (trình soạn thảo tự quản lý bố cục)
  full: { type: Boolean, default: false },
})

const router = useRouter()
const SIDEBAR_KEY = 'mds-sidebar-expanded'
const readCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '0'
  } catch {
    return false
  }
}
const collapsed = ref(readCollapsed())
watch(collapsed, (v) => {
  try {
    localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1')
  } catch {
    /* bỏ qua */
  }
})

const items = computed(() => [
  { key: 'mine', label: 'Bài của tôi', icon: 'folder' },
  { key: 'public', label: 'Thư viện công khai', icon: 'share' },
  { key: 'account', label: 'Tài khoản', icon: 'user' },
  ...(isAdmin() ? [{ key: 'admin', label: 'Quản trị', icon: 'users' }] : []),
])
const ROUTE_OF = { mine: '/decks', public: '/public', account: '/account', admin: '/admin/users' }
const current = computed(() => props.active)
const onNav = (key) => ROUTE_OF[key] && router.push(ROUTE_OF[key])

const user = computed(() => (session.user ? { name: session.user.displayName } : null))
const userMenu = [
  { key: 'account', label: 'Tài khoản', icon: 'user' },
  { key: 'password', label: 'Đổi mật khẩu', icon: 'lock' },
  { key: 'd', divider: true },
  { key: 'logout', label: 'Đăng xuất', icon: 'logout' },
]
function onSearch(text) {
  const q = String(text || '').trim()
  router.push({ path: '/decks', query: q ? { q } : {} })
}
async function onUserMenu(key) {
  if (key === 'account') router.push('/account')
  if (key === 'password') router.push('/change-password')
  if (key === 'logout') {
    await logout()
    router.replace('/login')
  }
}
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col bg-[var(--mds-bg-page)]">
    <MHeaderBar
      variant="brand"
      app-name="MISA Presentation"
      :user="user"
      :show-settings="false"
      :show-assistant="false"
      :show-chat="false"
      :show-notifications="false"
      :show-help="false"
      :show-more="false"
      :show-whats-new="false"
      search-placeholder="Tìm bài trình bày của tôi"
      @search="onSearch"
      @logo-click="router.push('/decks')"
    >
      <template #user>
        <MDropdownMenu v-if="user" :items="userMenu" @select="onUserMenu">
          <template #activator>
            <button
              type="button"
              class="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white text-[12px] font-semibold text-[var(--mds-brand-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              :title="user.name"
              :aria-label="`Tài khoản ${user.name}`"
              aria-haspopup="menu"
            >
              {{ user.name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() }}
            </button>
          </template>
        </MDropdownMenu>
      </template>
    </MHeaderBar>

    <div class="flex min-h-0 flex-1">
      <div class="flex shrink-0 flex-col bg-[var(--mds-bg)]">
        <div class="border-r border-[var(--mds-border)] px-2 pt-2" :class="collapsed ? 'w-[var(--mds-layout-sidebar-sm-w)]' : 'w-[var(--mds-layout-sidebar-w)]'">
          <MButton
            variant="outline"
            class="w-full"
            :aria-label="collapsed ? 'Tạo bài mới' : undefined"
            :title="collapsed ? 'Tạo bài mới' : undefined"
            @click="router.push('/create')"
          >
            <template #icon><MIcon name="plus" :size="16" /></template>
            <span v-if="!collapsed">Tạo bài mới</span>
          </MButton>
        </div>
        <div class="min-h-0 flex-1">
          <MSidebar v-model:collapsed="collapsed" :items="items" :model-value="current" @update:model-value="onNav" />
        </div>
      </div>

      <main class="min-w-0 flex-1" :class="full ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'">
        <slot />
      </main>
    </div>
  </div>
</template>
