<script setup>
// Trình soạn thảo mobile: xem trước SỬA TRỰC TIẾP (chạm chữ để sửa, chạm ảnh để đổi/chỉnh sửa, trang tự do kéo/đổi cỡ phần tử)
// → dải chọn trang cuộn ngang → form nội dung trang; footer sticky Hủy thay đổi | Lưu.
// Đổi/chỉnh sửa ảnh, chọn video, chèn trang là màn con toàn màn hình (FullScreenSheet) trong cùng route.
// Thiết kế & thiết lập bài (tên, màu – nền – phông – logo, chân trang, tỷ lệ, chia sẻ) là màn con toàn màn hình trong cùng route.
// Bài còn ở bước dàn ý (đang lập / chờ duyệt) → chuyển sang màn duyệt dàn ý.
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { deckPath } from '@/lib/deckPath.js'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
import FullScreenSheet from './FullScreenSheet.vue'
import ImageStudioPanel from '@/shared/ImageStudioPanel.vue'
import InsertSlidePanel from '@/shared/InsertSlidePanel.vue'
import FreeElementsPanel from '@/shared/FreeElementsPanel.vue'
import VideoPicker from '@/shared/VideoPicker.vue'
import SlideFields from '@/shared/SlideFields.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import DesignPanel from '@/shared/DesignPanel.vue'
import RatioPicker from '@/shared/RatioPicker.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { useEditor } from '@/composables/useEditor.js'
import { useDeckUrl } from '@/composables/useDeckUrl.js'
import { useLiveDeck } from '@/composables/useLiveDeck.js'
import { useSlideMedia } from '@/composables/useSlideMedia.js'
import { LAYOUT_LABEL, SPEC_LIMITS } from '@/lib/slideModel.js'
import { ratioCss } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// :code = mã ngắn 8 ký tự (API nhận cả mã ngắn lẫn UUID).
const id = route.params.code || route.params.id
const ed = useEditor(id, { onOutline: (d) => router.replace(deckPath(d, 'outline')) })
const { deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, assets, media, videoLibrary } = ed
useDeckUrl(deck, 'edit')

const view = ref('slides') // 'slides' | 'deck'
const frame = ref(null)
const strip = ref(null)
const sm = useSlideMedia(draft, selected)
const live = useLiveDeck(frame, { draft, deck, selected, assets, onMedia: sm.open, onSave: () => onSave() })
const selectedElId = computed(() => (live.selectedEl.value?.index === selected.value ? live.selectedEl.value.id : ''))
const isFree = computed(() => slide.value?.layout === 'free')
watch(selected, async (i) => {
  await nextTick()
  strip.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
})

const sheet = ref('') // '' | 'more' | 'slide'
const insertOpen = ref(false)
function onInsert({ layout, template }) {
  insertOpen.value = false
  guard(() => ed.addSlide(layout, template))
}
const sheetOpen = computed({ get: () => !!sheet.value, set: (v) => !v && (sheet.value = '') })
const moreItems = computed(() => [
  { key: 'settings', label: 'Thiết kế & thiết lập bài', icon: 'palette' },
  { key: 'html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
  { key: 'pdf', label: 'Tải PDF', icon: 'download' },
  { key: 'duplicate', label: 'Nhân bản bài', icon: 'copy' },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xóa bài', icon: 'trash', danger: true },
])
const slideItems = computed(() => {
  const n = draft.value?.spec.slides.length || 0
  const i = selected.value
  return [
    { key: 'up', label: 'Chuyển lên trước', icon: 'arrow-up', disabled: i === 0 },
    { key: 'down', label: 'Chuyển xuống sau', icon: 'arrow-down', disabled: i >= n - 1 },
    { key: 'copy', label: 'Nhân bản trang', icon: 'copy' },
    { key: 'd', divider: true },
    { key: 'remove', label: 'Xóa trang', icon: 'trash', danger: true, disabled: n <= 1 },
  ]
})

function guard(fn) {
  try {
    fn()
  } catch (err) {
    toast.error(err.message)
  }
}
function onSlideAction(k) {
  const i = selected.value
  guard(() => (k === 'up' ? ed.moveSlide(i, -1) : k === 'down' ? ed.moveSlide(i, 1) : k === 'copy' ? ed.copySlide(i) : ed.removeSlide(i)))
}

const titleError = computed(() => {
  const t = draft.value?.title ?? ''
  if (!t.trim()) return 'Nhập tên bài'
  return t.length > SPEC_LIMITS.deckTitle ? `Tối đa ${SPEC_LIMITS.deckTitle} ký tự` : ''
})
const saveDetails = computed(() => (Array.isArray(saveError.value?.details) ? saveError.value.details.slice(0, 5) : []))
function reloadLatest() {
  // load() không xoá lỗi lưu cũ → xoá tại đây để thông báo 409 không còn sau khi đã tải bản mới.
  saveError.value = null
  ed.load()
}

async function onSave() {
  if (titleError.value) {
    view.value = 'deck'
    return toast.error(titleError.value)
  }
  if (!dirty.value || saving.value) return
  if (await ed.save()) {
    toast.success('Đã lưu')
    // Đổi tên bài → useDeckUrl tự cập nhật đường dẫn /ten-bai/ma/edit.
  }
}

const busy = ref('')
async function onMore(key) {
  if (key === 'settings') return (view.value = 'deck')
  if (key === 'remove') return (confirmRemove.value = true)
  busy.value = key
  try {
    if (key === 'duplicate') {
      const copy = await ed.duplicate()
      toast.success('Đã tạo bản sao riêng tư')
      router.push(deckPath(copy, 'edit'))
    } else {
      if (dirty.value) toast.info('Tệp xuất theo bản đã lưu.')
      await (key === 'pdf' ? ed.exportPdf() : ed.exportHtml())
    }
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}

async function onMeta(fields, msg) {
  try {
    await ed.updateMeta(fields)
    toast.success(msg)
  } catch (err) {
    toast.error(err.message)
  }
}

const confirmRemove = ref(false)
async function doRemove() {
  try {
    await ed.remove()
    ed.discard()
    toast.success('Đã xóa bài trình bày')
    router.replace('/decks')
  } catch (err) {
    toast.error(err.message)
  }
}

const leaveTo = ref(null)
onBeforeRouteLeave((to) => {
  if (dirty.value && !saving.value) {
    leaveTo.value = to.fullPath
    return false
  }
})
function confirmLeave() {
  const to = leaveTo.value
  leaveTo.value = null
  ed.discard()
  router.push(to)
}
// Back: màn con → về danh sách trang; màn chính → về danh sách bài.
function onBack() {
  if (view.value === 'deck') {
    view.value = 'slides'
    return false
  }
}

onMounted(ed.load)
</script>

<template>
  <MobileShell :title="view === 'deck' ? 'Thiết kế & thiết lập' : draft?.title || 'Chỉnh sửa'" back="/decks" :on-back="onBack" :show-more="!!draft && view === 'slides'" @more="sheet = 'more'">
    <template v-if="draft && view === 'slides'" #actions>
      <MButton variant="icon" aria-label="Trình chiếu" @click="router.push(deckPath(deck, 'view'))"><template #icon><MIcon name="eye" :size="24" /></template></MButton>
    </template>

    <div v-if="loading" class="flex justify-center py-16"><MSpinner :size="32" /></div>

    <div v-else-if="loadError" class="px-4 py-10">
      <MEmptyState type="no-result" :title="loadError.status === 404 ? 'Không tìm thấy bài trình bày' : 'Không tải được bài'" :description="loadError.status === 404 ? 'Bài có thể đã bị xóa hoặc bạn không có quyền.' : loadError.message">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck && !deck.isOwner" class="px-4 py-10">
      <MEmptyState title="Bạn chỉ có quyền xem bài này" description="Nhân bản về bài của bạn để chỉnh sửa.">
        <template #actions><MButton variant="primary" @click="router.push(deckPath(deck, 'view'))">Trình chiếu</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck?.status === 'generating'" class="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <MSpinner :size="40" />
      <p class="mds-mobile-readable text-[16px] font-semibold leading-6">AI đang dựng “{{ deck.title }}” theo dàn ý</p>
      <p class="text-[14px] leading-5 text-[var(--mds-text-secondary)]">Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn, tạo ảnh minh hoạ AI (nếu bật) — thường 1–2 phút. Bạn có thể rời màn hình, bài vẫn tiếp tục được dựng.</p>
    </div>

    <div v-else-if="deck?.status === 'failed'" class="px-4 py-10">
      <MEmptyState type="no-result" title="AI chưa tạo được bài" :description="deck.errorMessage || 'Đã có lỗi xảy ra.'">
        <template #actions>
          <MButton variant="outline" @click="confirmRemove = true">Xóa bài</MButton>
          <MButton variant="primary" @click="router.push('/create')">Tạo lại</MButton>
        </template>
      </MEmptyState>
    </div>

    <!-- Màn con: thiết kế & thiết lập bài -->
    <div v-else-if="draft && view === 'deck'" class="flex flex-col gap-4 bg-[var(--mds-bg)] p-4">
      <FormField label="Tên bài" required>
        <MInput v-model="draft.title" :error="titleError" />
      </FormField>
      <!-- Thiết kế sửa thẳng vào spec (theme/palette/background/font/logo) — áp dụng khi Lưu, cùng chân trang -->
      <DesignPanel
        v-model:footer="draft.spec.footer"
        compact
        :design="draft.spec"
        :media="media"
        :title="draft.title"
        :subtitle="draft.spec.slides[0]?.subtitle || ''"
        :ratio="deck.ratio"
      />
      <FormAlert tone="info">Màu sắc, nền, phông chữ, logo và chân trang áp dụng cho toàn bộ bài sau khi bấm <strong>Lưu</strong>.</FormAlert>
      <hr class="border-[var(--mds-border-light)]" />
      <FormField label="Tỷ lệ khung hình" hint="Áp dụng ngay" group>
        <RatioPicker :model-value="deck.ratio" compact name="ratio-ed" @update:model-value="(r) => onMeta({ ratio: r }, `Đã đổi tỷ lệ sang ${r}`)" />
      </FormField>
      <div class="flex min-h-12 items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[15px] font-medium leading-5">Công khai</p>
          <p class="text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">Mọi người dùng đều xem và nhân bản được</p>
        </div>
        <MSwitch
          :model-value="deck.visibility === 'public'"
          aria-label="Công khai"
          @update:model-value="(v) => onMeta({ visibility: v ? 'public' : 'private' }, v ? 'Đã công khai' : 'Đã chuyển về riêng tư')"
        />
      </div>
    </div>

    <!-- Màn chính -->
    <template v-else-if="draft">
      <div class="bg-[#05070F] p-2">
        <div class="relative w-full overflow-hidden rounded" :style="{ aspectRatio: ratioCss(deck.ratio) }">
          <iframe v-if="previewUrl" ref="frame" data-deck-frame :key="previewUrl" :src="previewUrl" title="Xem trước và sửa trực tiếp bài trình bày" sandbox="allow-scripts allow-popups" class="absolute inset-0 h-full w-full border-0" />
          <div v-if="!live.ready.value" class="absolute inset-0 grid place-items-center"><MSpinner :size="32" /></div>
        </div>
      </div>
      <p class="flex items-start gap-1 bg-[var(--mds-bg)] px-4 py-2 text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">
        <MIcon name="info-circle" :size="16" class="mt-px shrink-0" />
        <span v-if="isFree">Chạm phần tử để chọn, kéo để di chuyển, kéo góc để đổi cỡ; chạm đúp để sửa chữ.</span>
        <span v-else>Chạm vào chữ trên khung để sửa trực tiếp, chạm ảnh để đổi hoặc chỉnh sửa.<template v-if="dirty"> Nhớ bấm <strong>Lưu</strong>.</template></span>
      </p>

      <div class="sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--mds-border-light)] bg-[var(--mds-bg)] py-1 pl-2 pr-1">
        <div ref="strip" class="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1" role="tablist" aria-label="Chọn trang">
          <button
            v-for="(s, i) in draft.spec.slides"
            :key="s.id || i"
            :data-i="i"
            type="button"
            role="tab"
            :aria-selected="i === selected"
            :aria-label="`Trang ${i + 1}: ${s.title || LAYOUT_LABEL[s.layout]}`"
            class="grid h-12 min-w-12 shrink-0 place-items-center rounded-lg border px-3 text-[15px] font-semibold tabular-nums"
            :class="i === selected ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)] text-[var(--mds-text)]'"
            @click="selected = i"
          >
            {{ i + 1 }}
          </button>
        </div>
        <MButton variant="icon" aria-label="Thêm trang" @click="insertOpen = true"><template #icon><MIcon name="plus" :size="24" /></template></MButton>
        <MButton variant="icon" aria-label="Thao tác trang" @click="sheet = 'slide'"><template #icon><MIcon name="dots-vertical" :size="24" /></template></MButton>
      </div>

      <div class="bg-[var(--mds-bg)] p-4">
        <p v-if="slide" class="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--mds-text-secondary)]">Trang {{ selected + 1 }} · {{ LAYOUT_LABEL[slide.layout] }}</p>
        <FreeElementsPanel
          v-if="slide && isFree"
          class="mb-4"
          compact
          :slide="slide"
          :selected-id="selectedElId"
          :live="live"
          :media="media"
          :video-library="videoLibrary"
          @media="(m) => sm.open({ ...m, index: selected })"
        />
        <SlideFields v-if="slide" :key="slide.id || selected" :slide="slide" :assets="assets" :upload="ed.uploadImage" :media="media" :video-library="videoLibrary" studio @change-layout="ed.changeLayout" @media="(m) => sm.open({ ...m, index: selected })" />
      </div>
    </template>

    <template v-if="draft && deck?.status === 'ready' && deck.isOwner" #footer>
      <FormAlert v-if="saveError" class="relative mb-2 max-h-[30dvh] overflow-y-auto">
        <span class="mds-mobile-readable">{{ saveError.message }}</span>
        <ul v-if="saveDetails.length" class="mt-1 list-disc pl-4">
          <li v-for="(d, k) in saveDetails" :key="k" class="mds-mobile-readable">{{ d.message || d }}</li>
        </ul>
        <button v-if="saveError.status === 409" type="button" class="block min-h-12 text-left font-medium text-[var(--mds-brand-600)]" @click="reloadLatest">Tải lại bản mới nhất</button>
      </FormAlert>
      <div class="flex gap-2">
        <MButton variant="outline" class="flex-1" :disabled="!dirty || saving" @click="ed.discard()">Hủy thay đổi</MButton>
        <MButton variant="primary" class="flex-1" :loading="saving" :disabled="!dirty" @click="onSave">Lưu</MButton>
      </div>
    </template>

    <ActionSheet
      v-model="sheetOpen"
      :title="sheet === 'slide' ? `Trang ${selected + 1}` : draft?.title"
      :items="sheet === 'slide' ? slideItems : moreItems"
      @select="(k) => (sheet === 'slide' ? onSlideAction(k) : onMore(k))"
    />

    <FullScreenSheet v-model="insertOpen" title="Thêm trang">
      <InsertSlidePanel compact @pick="onInsert" />
    </FullScreenSheet>
    <FullScreenSheet v-model="sm.imageOpen.value" :title="sm.title.value">
      <ImageStudioPanel
        v-if="sm.imageOpen.value"
        compact
        :image="sm.image.value"
        :aspect="sm.aspect.value"
        :media="media"
        :assets="assets"
        :suggest="sm.suggest.value"
        @apply="(img) => (sm.applyImage(img), sm.close())"
        @close="sm.close()"
      />
    </FullScreenSheet>
    <FullScreenSheet v-model="sm.videoOpen.value" :title="sm.title.value">
      <VideoPicker v-if="sm.videoOpen.value" :model-value="sm.video.value" :media="media" :library="videoLibrary" @update:model-value="sm.applyVideo" />
      <template #footer>
        <div class="flex gap-2">
          <MButton v-if="sm.canSwitch.value" variant="outline" class="flex-1" @click="sm.switchTo('image')">Dùng ảnh thay video</MButton>
          <MButton variant="primary" class="flex-1" @click="sm.close()">Xong</MButton>
        </div>
      </template>
    </FullScreenSheet>

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" width="calc(100vw - 32px)" @confirm="doRemove">
      <p class="text-[15px] leading-6">Bài cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời đi khi chưa lưu?" confirm-text="Bỏ thay đổi" cancel-text="Ở lại" width="calc(100vw - 32px)" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[15px] leading-6">Các thay đổi chưa lưu sẽ bị mất.</p>
    </MDialog>
  </MobileShell>
</template>
