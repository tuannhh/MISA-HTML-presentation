<script setup>
// MHeaderBar — Header Platform MISA: light hoặc brand theo reference sản phẩm.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MIcon from './MIcon.vue'
import MHeaderIconAva from './MHeaderIconAva.vue'
import MHeaderIconChat from './MHeaderIconChat.vue'

const props = defineProps({
  variant: { type: String, default: 'brand', validator: (v) => ['light', 'brand'].includes(v) },
  appName: { type: String, default: '' },
  companyName: { type: String, default: '' },
  searchPlaceholder: { type: String, default: 'Tìm kiếm' },
  notificationCount: { type: Number, default: 0 },
  chatCount: { type: Number, default: 0 },
  assistant: { type: Object, default: null },
  user: { type: Object, default: null },
  dataYear: { type: [String, Number], default: '' },
  showSettings: { type: Boolean, default: true },
  showAssistant: { type: Boolean, default: true },
  showChat: { type: Boolean, default: true },
  showNotifications: { type: Boolean, default: true },
  showHelp: { type: Boolean, default: true },
  showMore: { type: Boolean, default: true },
  // "Tính năng mới" — icon loa mở đầu cụm tiện ích (quy chuẩn header-bar cập nhật 2026-07-28).
  // whatsNewDot = chấm đỏ báo có tính năng mới chưa xem (chấm tròn, KHÔNG có số).
  showWhatsNew: { type: Boolean, default: true },
  whatsNewDot: { type: Boolean, default: false },
})

const emit = defineEmits(['search', 'notifications', 'settings', 'assistant', 'chat', 'help', 'more', 'whats-new', 'user-click', 'logo-click', 'app-switcher'])
const searchInput = ref(null)
const searchText = ref('')

const isBrand = computed(() => props.variant === 'brand')
// 'mds-header--brand' là class hook để theme Gradient tô gradient lên header
// (xem assets/tokens/themes/gradient.css) — không xóa dù trông "thừa" so với Tailwind.
const headerClass = computed(() => isBrand.value
  ? 'mds-header--brand bg-[var(--mds-brand-600)] text-white'
  : 'border-b border-[var(--mds-border)] bg-[var(--mds-bg)] text-[var(--mds-text)]')
const buttonClass = computed(() => isBrand.value
  ? 'text-white hover:bg-white/15 focus-visible:outline-white'
  : 'text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline-[var(--mds-brand-600)]')
// AMIS Chat: icon "message" đúng bản trong thư viện (assets/icons/message.svg qua MIcon),
// giữ màu nhận diện #1570EF trên header sáng (KHÔNG chuyển neutral như icon thường),
// trắng trên header brand giống các icon khác. Xem header-bar.md mục 3c.
const chatButtonClass = computed(() => isBrand.value
  ? 'text-white hover:bg-white/15 focus-visible:outline-white'
  : 'text-[#1570EF] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline-[var(--mds-brand-600)]')
const searchClass = computed(() => isBrand.value
  ? 'bg-white/20 text-white placeholder:text-white/70 focus:bg-white/[.28] focus:placeholder:text-white/80'
  : 'bg-[var(--mds-bg-disabled)] text-[var(--mds-text)] placeholder:text-[var(--mds-text-muted)] focus:bg-white focus:ring-1 focus:ring-[var(--mds-brand-600)]')
const searchIconClass = computed(() => isBrand.value
  ? 'text-white/70 peer-focus:text-white/90'
  : 'text-[var(--mds-icon-neutral)]')
const badgeText = computed(() => props.notificationCount > 99 ? '99+' : String(props.notificationCount))
const chatBadgeText = computed(() => props.chatCount > 99 ? '99+' : String(props.chatCount))
const appInitial = computed(() => (props.appName || '').trim().charAt(0).toUpperCase())
const userInitials = computed(() => initials(props.user?.name))

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  return (words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}
function onGlobalKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}
function onSearchFocus(event) { event.target.select() }
function onSearchEnter() { emit('search', searchText.value) }

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <!-- h-12 = 48px, px-4 = padding ngang 16px — đúng redline quy chuẩn header-bar -->
  <header class="flex h-12 w-full items-center gap-2 px-4 text-[13px] leading-[18px]" :class="headerClass">
    <div class="flex shrink-0 items-center gap-3">
      <button type="button" :class="buttonClass" class="grid h-8 w-8 shrink-0 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" title="Chuyển ứng dụng" aria-label="Chuyển ứng dụng" @click="emit('app-switcher')">
        <!-- Biểu tượng Platform 9 chấm là glyph thương hiệu riêng, không thuộc thư viện icon Tabler/MIcon. -->
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle v-for="[cx, cy] in [[5,5],[10,5],[15,5],[5,10],[10,10],[15,10],[5,15],[10,15],[15,15]]" :key="`${cx}-${cy}`" :cx="cx" :cy="cy" r="1.4" />
        </svg>
      </button>

      <!-- Logo–tên app cách nhau 12px (gap-3); tên app 20px semibold theo redline header-bar 2026-07-28 -->
      <button type="button" :class="buttonClass" class="flex shrink-0 items-center gap-3 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" :title="appName" @click="emit('logo-click')">
        <slot name="logo">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--mds-brand-600)] text-[16px] font-semibold text-white">{{ appInitial }}</span>
        </slot>
        <span class="hidden text-[20px] font-semibold leading-7 sm:block">{{ appName }}</span>
      </button>
    </div>

    <button v-if="companyName" type="button" :class="isBrand ? 'text-white/90 hover:bg-white/15' : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'" class="hidden max-w-[240px] items-center gap-1 truncate rounded-lg px-2 py-1.5 text-[14px] font-medium lg:flex" :title="companyName">
      <span class="truncate">{{ companyName }}</span>
      <MIcon name="chevron-down" :size="16" />
    </button>

    <!-- Badge năm dữ liệu: cao 28px (h-7), chấm tròn viền trắng + nhãn "Dữ liệu năm YYYY" -->
    <div v-if="dataYear || $slots['data-year']" class="hidden h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium lg:flex" :class="isBrand ? 'bg-white/20 text-white' : 'border border-[var(--mds-border)] text-[var(--mds-text)]'">
      <slot name="data-year">
        <span class="h-2 w-2 shrink-0 rounded-full ring-2" :class="isBrand ? 'bg-white ring-white/50' : 'bg-[var(--mds-brand-600)] ring-[var(--mds-brand-100)]'"></span>
        <span>Dữ liệu năm {{ dataYear }}</span>
      </slot>
    </div>

    <div class="flex min-w-0 flex-1 justify-center px-2">
      <div class="relative w-full max-w-[500px]">
        <input ref="searchInput" v-model="searchText" type="search" :placeholder="searchPlaceholder" class="peer h-8 w-full rounded-lg pl-9 pr-3 outline-none transition-colors" :class="searchClass" @focus="onSearchFocus" @keydown.enter="onSearchEnter" />
        <MIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" :class="searchIconClass" />
      </div>
    </div>

    <!-- gap-2 = 8px: đúng redline quy chuẩn (khoảng cách giữa các icon button trên header) -->
    <div class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
      <!-- THỨ TỰ CỤM TIỆN ÍCH LÀ CỐ ĐỊNH (quy chuẩn header-bar 2026-07-28), tính từ đây sang phải:
           Tính năng mới → AVA → Tin nhắn → Thông báo → Trợ giúp → Khác → Thiết lập → Avatar.
           Được phép ẨN mục không thuộc scope app, TUYỆT ĐỐI không đảo thứ tự các mục còn lại. -->
      <button v-if="showWhatsNew" type="button" :class="buttonClass" class="relative grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" title="Tính năng mới" aria-label="Tính năng mới" @click="emit('whats-new')">
        <MIcon name="speakerphone" :size="20" />
        <!-- Chấm đỏ báo có tính năng mới: chấm tròn 8px, KHÔNG hiện số (khác badge đếm của Tin nhắn/Thông báo) -->
        <span v-if="whatsNewDot" aria-hidden="true" class="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--mds-danger)] ring-2" :class="isBrand ? 'ring-[var(--mds-brand-600)]' : 'ring-[var(--mds-bg)]'"></span>
      </button>
      <button v-if="showAssistant" type="button" class="grid h-8 w-8 place-items-center overflow-hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]" :title="assistant?.name || 'Trợ lý số MISA AVA'" :aria-label="assistant?.name || 'Trợ lý số MISA AVA'" @click="emit('assistant')">
        <!-- Mặc định: icon AVA full-color cố định (giữ nguyên màu ở mọi mode) — app có
        thể truyền avatarUrl/slot riêng nếu có mascot chuyên biệt của phân hệ -->
        <slot name="assistant">
          <img v-if="assistant?.avatarUrl" :src="assistant.avatarUrl" :alt="assistant.name || 'MISA AVA'" class="h-full w-full object-cover" />
          <MHeaderIconAva v-else :size="24" />
        </slot>
      </button>
      <!-- AMIS Chat: icon bong bóng chat bo tròn, fill đặc, 3 chấm khoét lỗ (evenodd) —
           đúng asset gốc từ bộ demo chuẩn (MHeaderIconChat.vue), KHÔNG phải icon "message"
           outline của MIcon. Giữ màu #1570EF trên header sáng, trắng trên brand. -->
      <button v-if="showChat" type="button" :class="chatButtonClass" class="relative grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" title="Tin nhắn" aria-label="Tin nhắn" @click="emit('chat')">
        <MHeaderIconChat :size="20" />
        <span v-if="chatCount > 0" aria-hidden="true" class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[10px] font-medium leading-none text-white">{{ chatBadgeText }}</span>
      </button>
      <!-- Slot "notifications"/"help"/"more" cho phép app thay hẳn nút mặc định bằng
           trigger gắn MDropdownMenu/MDrawer thật (panel chuẩn có keyboard/focus/Esc/outside
           click) — xem ví dụ dùng thật trong ui/templates/DashboardPage.vue. -->
      <slot name="notifications" :button-class="buttonClass">
        <button v-if="showNotifications" type="button" :class="buttonClass" class="relative grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" title="Thông báo" aria-label="Thông báo" @click="emit('notifications')"><MIcon name="bell" :size="20" /><span v-if="notificationCount > 0" aria-hidden="true" class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[10px] font-medium leading-none text-white">{{ badgeText }}</span></button>
      </slot>
      <slot name="help" :button-class="buttonClass">
        <button v-if="showHelp" type="button" :class="buttonClass" class="hidden h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:grid" title="Trợ giúp" aria-label="Trợ giúp" @click="emit('help')"><MIcon name="help" :size="20" /></button>
      </slot>
      <slot name="more">
        <button v-if="showMore" type="button" :class="isBrand ? 'border-white/40 text-white hover:bg-white/15 focus-visible:outline-white' : 'border-[var(--mds-border)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline-[var(--mds-brand-600)]'" class="hidden h-8 w-8 place-items-center rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:grid" title="Khác" aria-label="Khác" @click="emit('more')"><MIcon name="dots" :size="16" /></button>
      </slot>
      <!-- Thiết lập đứng NGAY TRƯỚC avatar (đổi 2026-07-28 theo quy chuẩn mới — trước đây
           đứng đầu cụm). Đừng đưa ngược lên đầu khi đồng bộ code từ bản cũ. -->
      <button v-if="showSettings" type="button" :class="buttonClass" class="grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" title="Thiết lập" aria-label="Thiết lập" @click="emit('settings')"><MIcon name="settings" :size="20" /></button>
      <!-- Slot "user" cho phép app thay hẳn nút avatar mặc định bằng identity phức tạp hơn
           (vd dropdown menu kèm tên/vai trò) mà vẫn giữ đúng vị trí NGOÀI CÙNG BÊN PHẢI theo
           quy chuẩn header-bar.md — không được đẩy identity/notification tự chế vào slot
           "actions" (slot đó nằm TRƯỚC cả cụm, sẽ làm sai thứ tự cụm tiện ích). -->
      <slot name="user">
        <button v-if="user" type="button" class="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--mds-brand-100)] text-[12px] font-semibold text-[var(--mds-brand-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]" :title="user.name" :aria-label="user.name" @click="emit('user-click')"><img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="user.name" class="h-full w-full object-cover" /><span v-else aria-hidden="true" class="flex h-full w-full items-center justify-center">{{ userInitials }}</span></button>
      </slot>
    </div>
  </header>
</template>
