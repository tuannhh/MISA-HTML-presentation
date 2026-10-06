<script setup>
// Bước duyệt dàn ý (desktop): AI lập dàn ý → người dùng xem/sửa nội dung từng trang, gắn ảnh/video, chọn thiết kế
// (màu, nền, phông, logo) → "Dựng bài": AI dựng giao diện đúng theo dàn ý → chuyển sang trình soạn thảo.
import { computed, onMounted, ref } from 'vue'
import { deckPath } from '@/lib/deckPath.js'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import OutlineSlideCard from '@/shared/OutlineSlideCard.vue'
import DesignPanel from '@/shared/DesignPanel.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MTooltip from '@/components/mds/MTooltip.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { useOutline } from '@/composables/useOutline.js'
import { useDeckUrl } from '@/composables/useDeckUrl.js'
import { SPEC_LIMITS } from '@/lib/slideModel.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.code || route.params.id
const ol = useOutline(id, { onReady: (d) => router.replace(deckPath(d, 'edit')) })
const { deck, draft, slides, media, videoLibrary, loading, saving, building, loadError, saveError, dirty } = ol
useDeckUrl(deck, 'outline')

const titleError = computed(() => {
  const t = draft.value?.title ?? ''
  if (!t.trim()) return 'Nhập tên bài'
  return t.length > SPEC_LIMITS.deckTitle ? `Tối đa ${SPEC_LIMITS.deckTitle} ký tự` : ''
})
const saveDetails = computed(() => (Array.isArray(saveError.value?.details) ? saveError.value.details.slice(0, 5) : []))
const pointCount = computed(() => slides.value.reduce((n, s) => n + s.points.filter((p) => p.trim()).length, 0))
const mediaCount = computed(() => slides.value.reduce((n, s) => n + (s.video ? 1 : s.images.length), 0))

function guard(fn) {
  try {
    fn()
  } catch (err) {
    toast.error(err.message)
  }
}
function onAction(i, key) {
  guard(() => {
    if (key === 'up') ol.moveSlide(i, -1)
    else if (key === 'down') ol.moveSlide(i, 1)
    else if (key === 'insert') ol.addSlide(i)
    else if (key === 'copy') ol.copySlide(i)
    else if (key === 'remove') ol.removeSlide(i)
  })
}

async function onSave() {
  if (await ol.save()) toast.success('Đã lưu dàn ý')
}
async function onBuild() {
  if (await ol.build()) toast.info('AI đang dựng bài theo dàn ý của bạn…')
}

const confirmRemove = ref(false)
async function doRemove() {
  try {
    await ol.remove()
    ol.discard()
    toast.success('Đã xóa bài trình bày')
    router.replace('/decks')
  } catch (err) {
    toast.error(err.message)
  }
}

const leaveTo = ref(null)
onBeforeRouteLeave((to) => {
  if (dirty.value && !saving.value && !building.value && !to.path.endsWith('/edit')) {
    leaveTo.value = to.fullPath
    return false
  }
})
function confirmLeave() {
  const to = leaveTo.value
  leaveTo.value = null
  ol.discard()
  router.push(to)
}

onMounted(ol.load)
</script>

<template>
  <DesktopShell active="mine" full>
    <div v-if="loading" class="flex flex-1 items-center justify-center"><MSpinner :size="32" /></div>

    <div v-else-if="loadError" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState type="no-result" :title="loadError.status === 404 ? 'Không tìm thấy bài trình bày' : 'Không tải được bài trình bày'" :description="loadError.status === 404 ? 'Bài có thể đã bị xóa hoặc bạn không có quyền truy cập.' : loadError.message">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck && !deck.isOwner" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState title="Bạn chỉ có quyền xem bài này" description="Chỉ người tạo mới duyệt được dàn ý.">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck?.status === 'outlining' || deck?.status === 'generating'" class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" role="status">
      <MSpinner :size="40" />
      <div>
        <h1 class="text-[18px] font-semibold leading-6">{{ deck.status === 'outlining' ? `AI đang lập dàn ý “${deck.title}”` : `AI đang dựng bài “${deck.title}” theo dàn ý` }}</h1>
        <p class="mt-1 max-w-[560px] text-[13px] text-[var(--mds-text-secondary)]">
          {{ deck.status === 'outlining'
            ? 'Đọc tư liệu (kể cả PDF scan, ảnh, ghi âm) và đề xuất nội dung từng trang — thường mất 30 giây đến vài phút. Xong bạn sẽ được xem và sửa dàn ý trước khi dựng giao diện.'
            : 'Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn, tạo ảnh minh hoạ AI (nếu bật) — thường 1–2 phút. Xong sẽ tự chuyển sang trình soạn thảo.' }}
        </p>
      </div>
      <MButton variant="outline" @click="router.push('/decks')">Về danh sách</MButton>
    </div>

    <div v-else-if="deck?.status === 'failed'" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState type="no-result" title="AI chưa lập được dàn ý" :description="deck.errorMessage || 'Đã có lỗi xảy ra.'">
        <template #actions>
          <MButton variant="outline" @click="confirmRemove = true">Xóa bài</MButton>
          <MButton variant="primary" @click="router.push('/create')">Tạo lại</MButton>
        </template>
      </MEmptyState>
    </div>

    <template v-else-if="draft">
      <!-- Thanh công cụ -->
      <div class="flex shrink-0 items-center gap-2 border-b border-[var(--mds-border)] bg-[var(--mds-bg)] px-4 py-2">
        <MTooltip content="Về danh sách">
          <MButton variant="icon" aria-label="Về danh sách" @click="router.push('/decks')"><template #icon><MIcon name="arrow-left" :size="20" /></template></MButton>
        </MTooltip>
        <div class="w-full max-w-[420px]">
          <MInput v-model="draft.title" aria-label="Tên bài trình bày" :error="titleError" />
        </div>
        <span v-if="dirty" class="whitespace-nowrap text-[12px] text-[var(--mds-warning)]">● Chưa lưu</span>
        <ol class="ml-auto hidden items-center gap-2 text-[12px] text-[var(--mds-text-secondary)] xl:flex" aria-label="Các bước">
          <li class="flex items-center gap-1"><MIcon name="circle-check" :size="16" class="text-[var(--mds-success)]" />Lập dàn ý</li>
          <li aria-hidden="true">›</li>
          <li class="flex items-center gap-1 font-semibold text-[var(--mds-brand-600)]"><span class="grid h-4 w-4 place-items-center rounded-full bg-[var(--mds-brand-600)] text-[10px] text-white">2</span>Duyệt nội dung &amp; thiết kế</li>
          <li aria-hidden="true">›</li>
          <li class="flex items-center gap-1"><span class="grid h-4 w-4 place-items-center rounded-full border border-[var(--mds-border)] text-[10px]">3</span>Dựng bài</li>
        </ol>
        <MButton variant="ghost" class="xl:ml-2" @click="confirmRemove = true"><template #icon><MIcon name="trash" :size="16" /></template>Xóa</MButton>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Dàn ý -->
        <section class="relative min-w-0 flex-1 overflow-y-auto bg-[var(--mds-bg-page)]" aria-label="Dàn ý">
          <div class="mx-auto flex w-full max-w-[860px] flex-col gap-3 p-4">
            <FormAlert v-if="deck.errorMessage" tone="danger">{{ deck.errorMessage }}</FormAlert>
            <FormAlert tone="info">
              Đây là nội dung sẽ hiển thị trên từng trang. Sửa chữ, thêm/bớt dòng, đổi thứ tự, gắn ảnh hoặc video (tải lên / link YouTube) rồi bấm <strong>Dựng bài</strong> — AI chỉ trình bày lại đúng nội dung này.
            </FormAlert>
            <p class="text-[13px] text-[var(--mds-text-secondary)]">{{ slides.length }} trang · {{ pointCount }} dòng nội dung · {{ mediaCount }} media</p>
            <OutlineSlideCard
              v-for="(s, i) in slides"
              :key="s.id"
              :slide="s"
              :index="i"
              :total="slides.length"
              :media="media"
              :video-library="videoLibrary"
              @action="(k) => onAction(i, k)"
            />
            <MButton variant="outline" class="self-start" :disabled="slides.length >= SPEC_LIMITS.outlineSlides" @click="guard(() => ol.addSlide())">
              <template #icon><MIcon name="plus" :size="16" /></template>
              Thêm trang
            </MButton>
          </div>
        </section>

        <!-- Thiết kế -->
        <aside class="flex w-[420px] shrink-0 flex-col border-l border-[var(--mds-border)] bg-[var(--mds-bg)]" aria-label="Thiết kế">
          <div class="relative flex-1 overflow-y-auto p-4">
            <h2 class="mb-3 text-[16px] font-semibold leading-6">Thiết kế</h2>
            <DesignPanel v-model:footer="draft.footer" :design="draft.design" :media="media" :title="draft.title" :subtitle="slides[0]?.subtitle || ''" :ratio="deck.ratio" />
          </div>
        </aside>
      </div>

      <!-- Thanh hành động dính đáy -->
      <div class="shrink-0 border-t border-[var(--mds-border)] bg-[var(--mds-bg)] px-4 py-3">
        <FormAlert v-if="saveError" class="mb-3">
          {{ saveError.message }}
          <ul v-if="saveDetails.length" class="mt-1 list-disc pl-4">
            <li v-for="(d, k) in saveDetails" :key="k">{{ d.message || d }}</li>
          </ul>
          <button v-if="saveError.status === 409" type="button" class="mt-1 font-medium text-[var(--mds-brand-600)] hover:underline" @click="ol.load()">Tải lại bản mới nhất (bỏ thay đổi của tôi)</button>
        </FormAlert>
        <div class="flex items-center justify-end gap-2">
          <span class="mr-auto text-[12px] text-[var(--mds-text-secondary)]">{{ dirty ? 'Có thay đổi chưa lưu — "Dựng bài" sẽ tự lưu trước' : 'Dàn ý đã được lưu' }}</span>
          <MButton variant="outline" :disabled="!dirty || saving || building" @click="ol.discard()">Hủy thay đổi</MButton>
          <MButton variant="outline" :loading="saving" :disabled="!dirty || building" @click="onSave"><template #icon><MIcon name="device-floppy" :size="16" /></template>Lưu nháp</MButton>
          <MButton variant="primary" :loading="building" :disabled="saving || !!titleError" @click="onBuild"><template #icon><MIcon name="send" :size="16" /></template>Dựng bài</MButton>
        </div>
      </div>
    </template>

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" @confirm="doRemove">
      <p class="text-[14px] leading-5">Bài cùng toàn bộ ảnh, video sẽ bị xóa vĩnh viễn. Không thể khôi phục.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời trang khi chưa lưu?" confirm-text="Bỏ thay đổi và rời đi" cancel-text="Ở lại" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[14px] leading-5">Các thay đổi dàn ý chưa lưu sẽ bị mất.</p>
    </MDialog>
  </DesktopShell>
</template>
