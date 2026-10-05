<script setup>
// Bước duyệt dàn ý (mobile): AI lập dàn ý → người dùng xem/sửa nội dung từng trang, gắn ảnh/video, chọn thiết kế → "Dựng bài".
// Màn native: segmented "Nội dung | Thiết kế" dính dưới top bar (thay cho 2 cột desktop), footer sticky Lưu nháp | Dựng bài.
// Logic (tải, theo dõi tiến trình, lưu, dựng, thao tác trang) nằm ở useOutline — trang chỉ bố trí.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
import OutlineSlideCard from '@/shared/OutlineSlideCard.vue'
import DesignPanel from '@/shared/DesignPanel.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { useOutline } from '@/composables/useOutline.js'
import { SPEC_LIMITS } from '@/lib/slideModel.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.id
const ol = useOutline(id, { onReady: () => router.replace(`/p/${id}/edit`) })
const { deck, draft, slides, media, videoLibrary, loading, saving, building, loadError, saveError, dirty } = ol

// Chỉ hiện trình sửa khi bài đang chờ duyệt (sau "Dựng bài" draft vẫn còn nhưng trạng thái đã là generating).
const editing = computed(() => !loading.value && !loadError.value && !!deck.value?.isOwner && deck.value.status === 'outline' && !!draft.value)
const working = computed(() => ['outlining', 'generating'].includes(deck.value?.status))
const shellTitle = computed(() => (deck.value?.status === 'outlining' ? 'Đang lập dàn ý' : deck.value?.status === 'generating' ? 'Đang dựng bài' : 'Duyệt dàn ý'))

const titleError = computed(() => {
  const t = draft.value?.title ?? ''
  if (!t.trim()) return 'Nhập tên bài'
  return t.length > SPEC_LIMITS.deckTitle ? `Tối đa ${SPEC_LIMITS.deckTitle} ký tự` : ''
})
const saveDetails = computed(() => (Array.isArray(saveError.value?.details) ? saveError.value.details.slice(0, 5) : []))
const pointCount = computed(() => slides.value.reduce((n, s) => n + s.points.filter((p) => p.trim()).length, 0))
const mediaCount = computed(() => slides.value.reduce((n, s) => n + (s.video ? 1 : s.images.length), 0))

/* ---- segmented Nội dung | Thiết kế: nhớ vị trí cuộn riêng từng tab (cùng 1 vùng cuộn của MobileShell) ---- */
const tab = ref('content')
const TABS = computed(() => [
  { key: 'content', label: `Nội dung (${slides.value.length})` },
  { key: 'design', label: 'Thiết kế' },
])
const body = ref(null)
const scrollPos = { content: 0, design: 0 }
const scroller = () => body.value?.closest('main')
watch(tab, async (t, old) => {
  const sc = scroller()
  if (!sc) return
  scrollPos[old] = sc.scrollTop
  await nextTick()
  sc.scrollTop = scrollPos[t]
})

/* ---- thao tác trang ---- */
const listEl = ref(null)
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// Trên điện thoại thẻ trang dài → sau khi thêm/chuyển trang, cuộn tới thẻ đó để người dùng không mất dấu.
async function reveal(i) {
  await nextTick()
  listEl.value?.querySelector(`[data-slide-index="${i}"]`)?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
}
function guard(fn) {
  try {
    fn()
  } catch (err) {
    toast.error(err.message)
  }
}
function onAction(i, key) {
  guard(() => {
    if (key === 'up') {
      ol.moveSlide(i, -1)
      reveal(Math.max(0, i - 1))
    } else if (key === 'down') {
      ol.moveSlide(i, 1)
      reveal(Math.min(slides.value.length - 1, i + 1))
    } else if (key === 'insert') {
      ol.addSlide(i)
      reveal(i + 1)
    } else if (key === 'copy') {
      ol.copySlide(i)
      reveal(i + 1)
    } else if (key === 'remove') ol.removeSlide(i)
  })
}
function onAddSlide() {
  guard(() => {
    ol.addSlide()
    reveal(slides.value.length - 1)
  })
}

/* ---- lưu / dựng bài ---- */
// Tên bài nằm ở đầu tab Nội dung → lỗi tên thì đưa người dùng về đúng ô cần sửa.
function checkTitle() {
  if (!titleError.value) return true
  scrollPos.content = 0
  if (tab.value === 'content') scroller()?.scrollTo({ top: 0 })
  else tab.value = 'content'
  toast.error(titleError.value)
  return false
}
async function onSave() {
  if (checkTitle() && (await ol.save())) toast.success('Đã lưu dàn ý')
}
async function onBuild() {
  if (checkTitle() && (await ol.build())) toast.info('AI đang dựng bài theo dàn ý của bạn…')
}
function reloadLatest() {
  // load() không xoá lỗi lưu cũ → xoá tại đây để thông báo 409 không còn sau khi đã tải bản mới.
  saveError.value = null
  ol.load()
}

/* ---- thao tác 1 trang (bottom sheet thay dropdown nhỏ) ---- */
const slideSheet = ref({ open: false, index: -1, items: [] })
function openSlideSheet(i, items) {
  slideSheet.value = { open: true, index: i, items }
}

/* ---- thao tác khác (bottom sheet) ---- */
const sheetOpen = ref(false)
const moreItems = computed(() => [
  { key: 'discard', label: 'Hủy thay đổi chưa lưu', icon: 'refresh', disabled: !dirty.value || saving.value || building.value },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xóa bài', icon: 'trash', danger: true },
])
function onMore(key) {
  if (key === 'remove') confirmRemove.value = true
  else if (key === 'discard') {
    ol.discard()
    saveError.value = null
    toast.info('Đã hủy các thay đổi chưa lưu')
  }
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
  if (dirty.value && !saving.value && !building.value && to.path !== `/p/${id}/edit`) {
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
  <MobileShell :title="shellTitle" back="/decks" :show-more="editing" @more="sheetOpen = true">
    <div v-if="loading" class="flex justify-center py-16"><MSpinner :size="32" /></div>

    <div v-else-if="loadError" class="px-4 py-10">
      <MEmptyState type="no-result" :title="loadError.status === 404 ? 'Không tìm thấy bài trình bày' : 'Không tải được bài'" :description="loadError.status === 404 ? 'Bài có thể đã bị xóa hoặc bạn không có quyền.' : loadError.message">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck && !deck.isOwner" class="px-4 py-10">
      <MEmptyState title="Bạn chỉ có quyền xem bài này" description="Chỉ người tạo mới duyệt được dàn ý.">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <!-- AI đang lập dàn ý / đang dựng bài: useOutline tự hỏi lại trạng thái, xong tự chuyển màn -->
    <div v-else-if="working" class="flex flex-col items-center gap-4 px-6 py-16 text-center" role="status">
      <MSpinner :size="40" />
      <p class="mds-mobile-readable text-[16px] font-semibold leading-6">{{ deck.status === 'outlining' ? `AI đang lập dàn ý “${deck.title}”` : `AI đang dựng “${deck.title}” theo dàn ý` }}</p>
      <p class="text-[14px] leading-5 text-[var(--mds-text-secondary)]">
        {{ deck.status === 'outlining'
          ? 'Đọc tư liệu (kể cả PDF scan, ảnh, ghi âm) và đề xuất nội dung từng trang — thường mất 30 giây đến vài phút. Xong bạn sẽ được xem và sửa dàn ý trước khi dựng giao diện.'
          : 'Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn — thường dưới 1 phút. Xong sẽ tự mở trình soạn thảo.' }}
      </p>
      <p class="text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">Màn hình tự cập nhật. Bạn có thể rời đi, AI vẫn tiếp tục.</p>
      <MButton variant="outline" @click="router.push('/decks')">Về danh sách</MButton>
    </div>

    <div v-else-if="deck?.status === 'failed'" class="px-4 py-10">
      <MEmptyState type="no-result" title="AI chưa lập được dàn ý" :description="deck.errorMessage || 'Đã có lỗi xảy ra.'">
        <template #actions>
          <MButton variant="outline" @click="confirmRemove = true">Xóa bài</MButton>
          <MButton variant="primary" @click="router.push('/create')">Tạo lại</MButton>
        </template>
      </MEmptyState>
    </div>

    <div v-else-if="editing" ref="body">
      <!-- Segmented dính dưới top bar -->
      <div class="sticky top-0 z-10 border-b border-[var(--mds-border-light)] bg-[var(--mds-bg)] px-4 py-2">
        <MTabs v-model="tab" :tabs="TABS" variant="pill" class="[&_[role=tab]]:flex-1" />
      </div>

      <div class="flex flex-col gap-3 p-4" :class="tab === 'design' ? 'bg-[var(--mds-bg)]' : ''">
        <FormAlert v-if="deck.errorMessage" tone="danger">
          <span class="mds-mobile-readable">{{ deck.errorMessage }}</span>
        </FormAlert>

        <!-- Tab Nội dung: giữ trong DOM (v-show) để không mất trạng thái mở media/ghi chú của từng thẻ -->
        <section v-show="tab === 'content'" ref="listEl" class="flex min-w-0 flex-col gap-3" aria-label="Nội dung dàn ý">
          <div class="flex flex-col gap-2 rounded-lg bg-[var(--mds-bg)] p-4 shadow-[var(--mds-shadow-card)]">
            <FormField label="Tên bài trình bày" required>
              <MInput v-model="draft.title" enterkeyhint="done" :error="titleError" />
            </FormField>
            <p class="text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">{{ slides.length }} trang · {{ pointCount }} dòng nội dung · {{ mediaCount }} media</p>
          </div>
          <FormAlert tone="info">
            Sửa chữ, thêm/bớt dòng, đổi thứ tự, gắn ảnh hoặc video rồi bấm <strong>Dựng bài</strong> — AI chỉ trình bày lại đúng nội dung này.
          </FormAlert>
          <div v-for="(s, i) in slides" :key="s.id" :data-slide-index="i" class="min-w-0 scroll-mt-[76px]">
            <OutlineSlideCard
              :slide="s"
              :index="i"
              :total="slides.length"
              :media="media"
              :video-library="videoLibrary"
              compact
              @action="(k) => onAction(i, k)"
              @menu="(items) => openSlideSheet(i, items)"
            />
          </div>
          <MButton variant="outline" class="w-full" :disabled="slides.length >= SPEC_LIMITS.outlineSlides" @click="onAddSlide">
            <template #icon><MIcon name="plus" :size="20" /></template>
            Thêm trang
          </MButton>
        </section>

        <!-- Tab Thiết kế: v-if để dừng các canvas nền động khi không xem -->
        <section v-if="tab === 'design'" class="flex min-w-0 flex-col gap-3" aria-label="Thiết kế">
          <DesignPanel
            v-model:footer="draft.footer"
            compact
            :design="draft.design"
            :media="media"
            :title="draft.title"
            :subtitle="slides[0]?.subtitle || ''"
            :ratio="deck.ratio"
          />
          <FormAlert tone="info">Màu sắc, nền, phông chữ và logo được áp dụng khi AI dựng bài; sau đó vẫn đổi được trong trình soạn thảo.</FormAlert>
        </section>
      </div>
    </div>

    <template v-if="editing" #footer>
      <FormAlert v-if="saveError" class="mb-2 max-h-[30dvh] overflow-y-auto">
        <span class="mds-mobile-readable">{{ saveError.message }}</span>
        <ul v-if="saveDetails.length" class="mt-1 list-disc pl-4">
          <li v-for="(d, k) in saveDetails" :key="k" class="mds-mobile-readable">{{ d.message || d }}</li>
        </ul>
        <button v-if="saveError.status === 409" type="button" class="block min-h-12 text-left font-medium text-[var(--mds-brand-600)]" @click="reloadLatest">Tải lại bản mới nhất (bỏ thay đổi của tôi)</button>
      </FormAlert>
      <p class="mb-2 flex items-center justify-center gap-1 text-[12px] leading-4 text-[var(--mds-text-secondary)]">
        <span v-if="dirty" class="h-2 w-2 shrink-0 rounded-full bg-[var(--mds-warning)]" aria-hidden="true" />
        <span class="mds-mobile-single-line">{{ dirty ? 'Chưa lưu — Dựng bài sẽ tự lưu trước' : 'Dàn ý đã được lưu' }}</span>
      </p>
      <div class="flex gap-2">
        <MButton variant="outline" class="flex-1" :loading="saving" :disabled="!dirty || building" @click="onSave">
          <template #icon><MIcon name="device-floppy" :size="20" /></template>
          Lưu nháp
        </MButton>
        <MButton variant="primary" class="flex-1" :loading="building" :disabled="saving" @click="onBuild">
          <template #icon><MIcon name="send" :size="20" /></template>
          Dựng bài
        </MButton>
      </div>
    </template>

    <ActionSheet v-model="sheetOpen" :title="draft?.title || 'Dàn ý'" :items="moreItems" @select="onMore" />
    <ActionSheet v-model="slideSheet.open" :title="`Trang ${slideSheet.index + 1}`" :items="slideSheet.items" @select="(k) => onAction(slideSheet.index, k)" />

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" width="calc(100vw - 32px)" @confirm="doRemove">
      <p class="text-[15px] leading-6">Bài cùng toàn bộ ảnh, video sẽ bị xóa vĩnh viễn. Không thể khôi phục.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời đi khi chưa lưu?" confirm-text="Bỏ thay đổi" cancel-text="Ở lại" width="calc(100vw - 32px)" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[15px] leading-6">Các thay đổi dàn ý chưa lưu sẽ bị mất.</p>
    </MDialog>
  </MobileShell>
</template>
