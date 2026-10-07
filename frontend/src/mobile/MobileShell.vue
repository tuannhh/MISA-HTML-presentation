<script setup>
// Khung mini-app mobile chuẩn MDS: root .mds-mobile-app, MMobileTopBar 56px, 1 vùng cuộn dọc, footer sticky (tuỳ chọn), MMobileBottomNav.
// Không dùng MHeaderBar/MSidebar; Back ở màn gốc gọi adapter host (exitToHost) thay vì đoán URL.
import { useRouter } from 'vue-router'
import MMobileTopBar from '@/components/mds/MMobileTopBar.vue'
import MMobileBottomNav from '@/components/mds/MMobileBottomNav.vue'
import { exitToHost } from '@/lib/surface.js'

const props = defineProps({
  title: { type: String, required: true },
  // 'host' = màn gốc (Back về MISA AMIS) | đường dẫn = về màn cha | null = ẩn Back (màn đăng nhập ngoài host)
  back: { type: [String, null], default: 'host' },
  showMore: { type: Boolean, default: false },
  nav: { type: String, default: '' }, // khóa bottom nav đang active; rỗng = ẩn bottom nav (màn chi tiết/form)
  // onBack: hàm tuỳ biến (vd. hỏi xác nhận khi form bẩn); trả false để chặn
  onBack: { type: Function, default: null },
})
const emit = defineEmits(['more'])
const router = useRouter()

const NAV = [
  { key: 'mine', label: 'Bài của tôi', icon: 'folder' },
  { key: 'public', label: 'Công khai', icon: 'share' },
  { key: 'create', label: 'Tạo bài', icon: 'plus', kind: 'fab', ariaLabel: 'Tạo bài trình bày mới' },
  { key: 'shared', label: 'Chia sẻ', icon: 'user-share', ariaLabel: 'Bài được chia sẻ với tôi' },
  { key: 'account', label: 'Tài khoản', icon: 'user' },
]
const ROUTE_OF = { mine: '/decks', public: '/public', create: '/create', shared: '/shared', account: '/account' }

async function goBack() {
  if (props.onBack && (await props.onBack()) === false) return
  if (props.back === 'host') return exitToHost()
  if (props.back) router.push(props.back)
}
</script>

<template>
  <div class="mds-mobile-app relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--mds-bg-page)] text-[var(--mds-text)]">
    <MMobileTopBar :title="title" :show-back="back !== null" :show-more="showMore" :back-label="back === 'host' ? 'Quay lại MISA AMIS' : 'Quay lại'" @back="goBack" @more="emit('more')">
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </MMobileTopBar>
    <main class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <slot />
    </main>
    <div v-if="$slots.footer" class="shrink-0 border-t border-[var(--mds-border-light)] bg-[var(--mds-bg)] px-4 py-2" :style="{ paddingBottom: nav ? undefined : 'calc(8px + var(--mds-mobile-safe-bottom))' }">
      <slot name="footer" />
    </div>
    <MMobileBottomNav v-if="nav" :items="NAV" :active="nav" @select="(k) => router.push(ROUTE_OF[k])" />
  </div>
</template>
