<script setup>
// Trình chiếu desktop: khung bài đầy vùng nội dung, thông tin tác giả + thao tác nhân bản/tải xuống.
import { computed, onMounted, ref } from 'vue'
import { deckPath } from '@/lib/deckPath.js'
import { useRoute, useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import MTag from '@/components/mds/MTag.vue'
import { useToast } from '@/components/mds/toast.js'
import { get, post, download } from '@/lib/api.js'
import { formatDateTime, ratioCss } from '@/lib/format.js'
import { useDeckFrame } from '@/composables/useDeckFrame.js'
import { useDeckUrl } from '@/composables/useDeckUrl.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.code || route.params.id
const deck = ref(null)
useDeckUrl(deck, 'view')
const loading = ref(true)
const error = ref(null)
const busy = ref('')
const frame = ref(null)
const { index, count, go } = useDeckFrame(frame)

const src = computed(() => (deck.value?.status === 'ready' ? `/api/presentations/${id}/preview` : ''))
const exportMenu = [
  { key: 'html', label: 'HTML một tệp (có chuyển động)', icon: 'file-export' },
  { key: 'pdf', label: 'PDF (không chuyển động)', icon: 'download' },
]

onMounted(async () => {
  try {
    deck.value = (await get(`/api/presentations/${id}`)).data
    count.value = deck.value.slideCount || 0
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
})

async function act(kind) {
  busy.value = kind
  try {
    if (kind === 'duplicate') {
      const copy = (await post(`/api/presentations/${id}/duplicate`)).data
      toast.success('Đã nhân bản về bài của bạn')
      router.push(deckPath(copy, 'edit'))
    } else await download(`/api/presentations/${id}/export.${kind}`, `${deck.value.title}.${kind}`)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}

function fullscreen() {
  frame.value?.requestFullscreen?.().catch(() => toast.info('Trình duyệt không cho phép toàn màn hình'))
}
</script>

<template>
  <DesktopShell :active="deck?.isOwner ? 'mine' : 'public'" full>
    <div v-if="loading" class="flex flex-1 items-center justify-center"><MSpinner :size="32" /></div>
    <div v-else-if="error || deck?.status !== 'ready'" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState
        type="no-result"
        :title="error?.status === 404 ? 'Không tìm thấy bài trình bày' : 'Bài chưa sẵn sàng để trình chiếu'"
        :description="error?.status === 404 ? 'Bài có thể đã bị xóa, chuyển về riêng tư hoặc bạn không có quyền xem.' : error?.message || 'Vui lòng thử lại sau.'"
      >
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>
    <template v-else>
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--mds-border)] bg-[var(--mds-bg)] px-4 py-2">
        <MButton variant="icon" aria-label="Quay lại" @click="router.back()"><template #icon><MIcon name="arrow-left" :size="20" /></template></MButton>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-[16px] font-semibold leading-6" :title="deck.title">{{ deck.title }}</h1>
          <p class="truncate text-[12px] text-[var(--mds-text-secondary)]">
            {{ deck.isOwner ? 'Bài của bạn' : deck.authorName || 'Người dùng khác' }} · {{ deck.slideCount }} trang · {{ deck.ratio }} · cập nhật {{ formatDateTime(deck.updatedAt) }}
          </p>
        </div>
        <MTag :color="deck.visibility === 'public' ? 'brand' : 'neutral'" size="sm">{{ deck.visibility === 'public' ? 'Công khai' : 'Riêng tư' }}</MTag>
        <div class="flex items-center gap-1">
          <MButton variant="icon" aria-label="Trang trước" :disabled="index <= 0" @click="go(-1)"><template #icon><MIcon name="chevron-left" :size="20" /></template></MButton>
          <span class="min-w-[56px] text-center text-[13px] font-medium tabular-nums">{{ index + 1 }} / {{ count }}</span>
          <MButton variant="icon" aria-label="Trang sau" :disabled="index >= count - 1" @click="go(1)"><template #icon><MIcon name="chevron-right" :size="20" /></template></MButton>
        </div>
        <MButton variant="outline" @click="fullscreen"><template #icon><MIcon name="external-link" :size="16" /></template>Toàn màn hình</MButton>
        <MDropdownMenu :items="exportMenu" @select="act">
          <template #activator>
            <MButton variant="outline" :loading="busy === 'html' || busy === 'pdf'" aria-haspopup="menu"><template #icon><MIcon name="download" :size="16" /></template>Tải xuống<MIcon name="chevron-down" :size="16" /></MButton>
          </template>
        </MDropdownMenu>
        <MButton v-if="deck.isOwner" variant="primary" @click="router.push(deckPath(deck, 'edit'))"><template #icon><MIcon name="pencil" :size="16" /></template>Chỉnh sửa</MButton>
        <MButton v-else variant="primary" :loading="busy === 'duplicate'" @click="act('duplicate')"><template #icon><MIcon name="copy" :size="16" /></template>Nhân bản để sửa</MButton>
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center bg-[#05070F] p-4">
        <div class="relative max-h-full w-full" :style="{ aspectRatio: ratioCss(deck.ratio), maxWidth: `calc((100vh - 140px) * ${deck.ratio.split(':')[0] / deck.ratio.split(':')[1]})` }">
          <iframe
            data-deck-frame
            ref="frame" :src="src" title="Trình chiếu" sandbox="allow-scripts allow-popups" allow="fullscreen" class="absolute inset-0 h-full w-full border-0" />
        </div>
      </div>
    </template>
  </DesktopShell>
</template>
