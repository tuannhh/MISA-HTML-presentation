<script setup>
// Trình chiếu mobile: khung bài đúng tỷ lệ, có nút Trước/Sau nhìn thấy được (không chỉ dựa vào vuốt), thao tác tải/nhân bản.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { get, post, download } from '@/lib/api.js'
import { ratioCss } from '@/lib/format.js'
import { useDeckFrame } from '@/composables/useDeckFrame.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.id
const deck = ref(null)
const loading = ref(true)
const error = ref(null)
const frame = ref(null)
const sheetOpen = ref(false)
const busy = ref('')

const src = computed(() => (deck.value?.status === 'ready' ? `/api/presentations/${id}/preview` : ''))
const items = computed(() => [
  { key: 'html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
  { key: 'pdf', label: 'Tải PDF', icon: 'download' },
  ...(deck.value?.isOwner ? [] : [{ key: 'duplicate', label: 'Nhân bản về bài của tôi', icon: 'copy' }]),
])

const { index, count, go } = useDeckFrame(frame)

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
      router.push(`/p/${copy.id}/edit`)
    } else await download(`/api/presentations/${id}/export.${kind}`, `${deck.value.title}.${kind}`)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <MobileShell :title="deck?.title || 'Trình chiếu'" :back="deck?.isOwner ? '/decks' : '/public'" :show-more="deck?.status === 'ready'" @more="sheetOpen = true">
    <div v-if="loading" class="flex justify-center py-16"><MSpinner :size="32" /></div>
    <div v-else-if="error || deck?.status !== 'ready'" class="px-4 py-10">
      <MEmptyState type="no-result" :title="error?.status === 404 ? 'Không tìm thấy bài trình bày' : 'Bài chưa sẵn sàng'" :description="error?.status === 404 ? 'Bài có thể đã bị xóa hoặc chuyển về riêng tư.' : error?.message || 'Vui lòng thử lại sau.'">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>
    <div v-else class="flex min-h-full flex-col justify-center bg-[#05070F]">
      <div class="relative w-full" :style="{ aspectRatio: ratioCss(deck.ratio) }">
        <iframe ref="frame" data-deck-frame :src="src" title="Trình chiếu" sandbox="allow-scripts allow-popups" allow="fullscreen" class="absolute inset-0 h-full w-full border-0" />
      </div>
      <p class="px-4 py-3 text-center text-[13px] text-[#C8D3EC]">{{ deck.isOwner ? 'Bài của bạn' : deck.authorName }} · Vuốt ngang hoặc dùng nút bên dưới để chuyển trang</p>
    </div>
    <template v-if="deck?.status === 'ready'" #footer>
      <div class="flex items-center gap-2">
        <MButton variant="outline" aria-label="Trang trước" :disabled="index <= 0" @click="go(-1)"><template #icon><MIcon name="chevron-left" :size="20" /></template></MButton>
        <span class="min-w-0 flex-1 text-center text-[15px] font-medium tabular-nums">{{ index + 1 }} / {{ count }}</span>
        <MButton variant="outline" aria-label="Trang sau" :disabled="index >= count - 1" @click="go(1)"><template #icon><MIcon name="chevron-right" :size="20" /></template></MButton>
        <MButton v-if="deck.isOwner" variant="primary" @click="router.push(`/p/${id}/edit`)">Chỉnh sửa</MButton>
        <MButton v-else variant="primary" :loading="busy === 'duplicate'" @click="act('duplicate')">Nhân bản</MButton>
      </div>
    </template>
    <ActionSheet v-model="sheetOpen" :title="deck?.title" :items="items" @select="act" />
  </MobileShell>
</template>
