<script setup>
// Trình soạn thảo desktop: danh sách trang | xem trước SỬA TRỰC TIẾP | nội dung trang đang chọn.
// Khung xem trước dựng lại ngay từ bản nháp (useLiveDeck): bấm vào chữ để sửa tại chỗ, bấm ảnh/video để đổi hoặc chỉnh sửa,
// trang tự do kéo thả/đổi cỡ phần tử. Lưu (hoặc Ctrl/Cmd+S) → máy chủ chuẩn hoá + lưu; trang khác làm tiếp như vậy.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { deckPath } from '@/lib/deckPath.js'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import SlideFields from '@/shared/SlideFields.vue'
import FreeElementsPanel from '@/shared/FreeElementsPanel.vue'
import InsertSlidePanel from '@/shared/InsertSlidePanel.vue'
import ImageStudio from '@/shared/ImageStudio.vue'
import VideoPicker from '@/shared/VideoPicker.vue'
import DesignPanel from '@/shared/DesignPanel.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MTooltip from '@/components/mds/MTooltip.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { useEditor } from '@/composables/useEditor.js'
import { useDeckUrl } from '@/composables/useDeckUrl.js'
import { useLiveDeck } from '@/composables/useLiveDeck.js'
import { useSlideMedia } from '@/composables/useSlideMedia.js'
import { LAYOUT_LABEL, LAYOUT_ICON, SPEC_LIMITS } from '@/lib/slideModel.js'
import { RATIO_OPTIONS, ratioCss } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// :code = mã ngắn 8 ký tự (API nhận cả mã ngắn lẫn UUID).
const id = route.params.code || route.params.id
const ed = useEditor(id, { onOutline: (d) => router.replace(deckPath(d, 'outline')) })
const { deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, media, videoLibrary } = ed
useDeckUrl(deck, 'edit')

const frame = ref(null)
const sm = useSlideMedia(draft, selected)
const live = useLiveDeck(frame, { draft, deck, selected, assets: ed.assets, onMedia: sm.open, onSave: () => onSave() })
// Phần tử trang tự do đang chọn (chỉ khi thuộc trang đang mở).
const selectedElId = computed(() => (live.selectedEl.value?.index === selected.value ? live.selectedEl.value.id : ''))
const isFree = computed(() => slide.value?.layout === 'free')

const panel = ref('slide')
const PANELS = [
  { key: 'slide', label: 'Nội dung trang' },
  { key: 'deck', label: 'Thiết lập bài' },
]

const insertOpen = ref(false)
function onInsert({ layout, template }) {
  insertOpen.value = false
  guard(() => ed.addSlide(layout, template))
}
const moreMenu = [
  { key: 'duplicate', label: 'Nhân bản bài', icon: 'copy' },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xóa bài', icon: 'trash', danger: true },
]
const exportMenu = [
  { key: 'html', label: 'HTML một tệp (có chuyển động)', icon: 'file-export' },
  { key: 'pdf', label: 'PDF (không chuyển động)', icon: 'download' },
]

const titleError = computed(() => {
  const t = draft.value?.title ?? ''
  if (!t.trim()) return 'Nhập tên bài'
  return t.length > SPEC_LIMITS.deckTitle ? `Tối đa ${SPEC_LIMITS.deckTitle} ký tự` : ''
})
const saveDetails = computed(() => (Array.isArray(saveError.value?.details) ? saveError.value.details.slice(0, 5) : []))

function guard(fn) {
  try {
    fn()
  } catch (err) {
    toast.error(err.message)
  }
}

async function onSave() {
  if (!dirty.value || saving.value) return
  if (titleError.value) return toast.error(titleError.value)
  if (await ed.save()) {
    toast.success('Đã lưu bài trình bày')
    // Đổi tên bài → useDeckUrl tự cập nhật đường dẫn /ten-bai/ma/edit.
  }
}
// Ctrl/Cmd+S ngoài khung xem trước (trong khung: engine gửi 'deck:save').
function onKeydown(e) {
  if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    onSave()
  }
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function onRatio(ratio) {
  try {
    await ed.updateMeta({ ratio })
    toast.success(`Đã đổi tỷ lệ sang ${ratio}`)
  } catch (err) {
    toast.error(err.message)
  }
}

const visibilityBusy = ref(false)
async function onVisibility(isPublic) {
  visibilityBusy.value = true
  try {
    await ed.updateMeta({ visibility: isPublic ? 'public' : 'private' })
    toast.success(isPublic ? 'Đã công khai — mọi người dùng đều xem được' : 'Đã chuyển về riêng tư')
  } catch (err) {
    toast.error(err.message)
  } finally {
    visibilityBusy.value = false
  }
}

const exporting = ref('')
async function onExport(kind) {
  if (dirty.value) toast.info('Tệp xuất theo bản đã lưu — các thay đổi chưa lưu sẽ không có trong tệp.')
  exporting.value = kind
  try {
    await (kind === 'pdf' ? ed.exportPdf() : ed.exportHtml())
  } catch (err) {
    toast.error(err.message)
  } finally {
    exporting.value = ''
  }
}

const confirmRemove = ref(false)
async function onMore(key) {
  if (key === 'remove') return (confirmRemove.value = true)
  if (key === 'duplicate') {
    try {
      const copy = await ed.duplicate()
      toast.success('Đã tạo bản sao riêng tư')
      router.push(deckPath(copy, 'edit'))
    } catch (err) {
      toast.error(err.message)
    }
  }
}
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

/* Rời trang khi còn thay đổi chưa lưu → hỏi bằng dialog MDS. */
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

onMounted(ed.load)
</script>

<template>
  <DesktopShell active="mine" full>
    <div v-if="loading" class="flex flex-1 items-center justify-center"><MSpinner :size="32" /></div>

    <div v-else-if="loadError" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState type="no-result" :title="loadError.status === 404 ? 'Không tìm thấy bài trình bày' : 'Không tải được bài trình bày'" :description="loadError.status === 404 ? 'Bài có thể đã bị xóa hoặc bạn không có quyền truy cập.' : loadError.message">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <!-- Không phải chủ sở hữu: chỉ được xem -->
    <div v-else-if="deck && !deck.isOwner" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState title="Bạn chỉ có quyền xem bài này" description="Nhân bản về bài của bạn để chỉnh sửa.">
        <template #actions>
          <MButton variant="outline" @click="router.push(deckPath(deck, 'view'))">Trình chiếu</MButton>
          <MButton variant="primary" @click="onMore('duplicate')">Nhân bản</MButton>
        </template>
      </MEmptyState>
    </div>

    <div v-else-if="deck?.status === 'generating'" class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <MSpinner :size="40" />
      <div>
        <h1 class="text-[18px] font-semibold leading-6">AI đang dựng “{{ deck.title }}” theo dàn ý</h1>
        <p class="mt-1 max-w-[520px] text-[13px] text-[var(--mds-text-secondary)]">Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn, tạo ảnh minh hoạ AI (nếu bật) — thường 1–2 phút. Bạn có thể rời trang, bài vẫn tiếp tục được dựng.</p>
      </div>
      <MButton variant="outline" @click="router.push('/decks')">Về danh sách</MButton>
    </div>

    <div v-else-if="deck?.status === 'failed'" class="flex flex-1 items-center justify-center p-6">
      <MEmptyState type="no-result" title="AI chưa tạo được bài trình bày" :description="deck.errorMessage || 'Đã có lỗi xảy ra.'">
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
        <div class="ml-auto flex items-center gap-2">
          <div class="w-[200px]"><MSelect :model-value="deck.ratio" :options="RATIO_OPTIONS" aria-label="Tỷ lệ khung hình" @update:model-value="onRatio" /></div>
          <MSwitch :model-value="deck.visibility === 'public'" :disabled="visibilityBusy" label="Công khai" @update:model-value="onVisibility" />
          <MButton variant="outline" @click="router.push(deckPath(deck, 'view'))"><template #icon><MIcon name="eye" :size="16" /></template>Trình chiếu</MButton>
          <MDropdownMenu :items="exportMenu" @select="onExport">
            <template #activator>
              <MButton variant="outline" :loading="!!exporting" aria-haspopup="menu"><template #icon><MIcon name="download" :size="16" /></template>Tải xuống<MIcon name="chevron-down" :size="16" /></MButton>
            </template>
          </MDropdownMenu>
          <MDropdownMenu :items="moreMenu" @select="onMore" />
        </div>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Danh sách trang -->
        <aside class="flex w-[248px] shrink-0 flex-col border-r border-[var(--mds-border)] bg-[var(--mds-bg)]" aria-label="Danh sách trang">
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-[13px] font-semibold">{{ draft.spec.slides.length }} trang</span>
            <MButton variant="outline" aria-haspopup="dialog" @click="insertOpen = true"><template #icon><MIcon name="plus" :size="16" /></template>Thêm trang</MButton>
          </div>
          <ol class="relative flex-1 overflow-y-auto px-2 pb-2">
            <li v-for="(s, i) in draft.spec.slides" :key="s.id || i">
              <div
                class="group mb-1 flex items-center gap-2 rounded-lg px-2 py-2"
                :class="i === selected ? 'bg-[var(--mds-brand-50)]' : 'hover:bg-[var(--mds-bg-hover-soft)]'"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mds-brand-600)]"
                  :aria-current="i === selected ? 'true' : undefined"
                  @click="selected = i"
                >
                  <span class="w-5 shrink-0 text-right text-[12px] tabular-nums text-[var(--mds-text-secondary)]">{{ i + 1 }}</span>
                  <MIcon :name="LAYOUT_ICON[s.layout]" :size="16" :class="i === selected ? 'text-[var(--mds-brand-600)]' : 'text-[var(--mds-icon-neutral)]'" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] leading-[18px]" :class="i === selected ? 'font-semibold text-[var(--mds-brand-600)]' : 'text-[var(--mds-text)]'">{{ s.title || '(Chưa có tiêu đề)' }}</span>
                    <span class="block truncate text-[11px] leading-4 text-[var(--mds-text-secondary)]">{{ LAYOUT_LABEL[s.layout] }}</span>
                  </span>
                </button>
                <MDropdownMenu
                  :items="[
                    { key: 'up', label: 'Chuyển lên', icon: 'arrow-up', disabled: i === 0 },
                    { key: 'down', label: 'Chuyển xuống', icon: 'arrow-down', disabled: i === draft.spec.slides.length - 1 },
                    { key: 'copy', label: 'Nhân bản trang', icon: 'copy' },
                    { key: 'd', divider: true },
                    { key: 'remove', label: 'Xóa trang', icon: 'trash', danger: true, disabled: draft.spec.slides.length <= 1 },
                  ]"
                  @select="(k) => guard(() => (k === 'up' ? ed.moveSlide(i, -1) : k === 'down' ? ed.moveSlide(i, 1) : k === 'copy' ? ed.copySlide(i) : ed.removeSlide(i)))"
                />
              </div>
            </li>
          </ol>
        </aside>

        <!-- Xem trước -->
        <section class="relative flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-4" aria-label="Xem trước">
          <div class="mx-auto w-full max-w-[1280px]">
            <div class="relative w-full overflow-hidden rounded-lg bg-[#0A1530] shadow-[var(--mds-shadow-card)]" :style="{ aspectRatio: ratioCss(deck.ratio) }">
              <iframe
                v-if="previewUrl"
                ref="frame"
                data-deck-frame
                :key="previewUrl"
                :src="previewUrl"
                title="Xem trước và sửa trực tiếp bài trình bày"
                sandbox="allow-scripts allow-popups"
                allow="fullscreen"
                class="absolute inset-0 h-full w-full border-0"
              />
              <div v-if="!live.ready.value" class="absolute inset-0 grid place-items-center"><MSpinner :size="32" /></div>
            </div>
            <p class="mt-2 flex items-center gap-1 text-[12px] text-[var(--mds-text-secondary)]">
              <MIcon name="info-circle" :size="16" />
              <span v-if="isFree">Kéo phần tử để di chuyển, kéo góc để đổi cỡ (Shift giữ tỷ lệ, Alt tắt hít lề) · bấm đúp để sửa chữ/đổi ảnh · Delete xóa · Ctrl+D nhân bản.</span>
              <span v-else>Bấm vào chữ trên khung để sửa trực tiếp · bấm vào ảnh/video để đổi hoặc chỉnh sửa · <strong>Ctrl+S</strong> để lưu.</span>
            </p>
          </div>
        </section>

        <!-- Nội dung -->
        <aside class="flex w-[400px] shrink-0 flex-col border-l border-[var(--mds-border)] bg-[var(--mds-bg)]" aria-label="Nội dung">
          <div class="px-4"><MTabs v-model="panel" :tabs="PANELS" /></div>
          <div class="relative flex-1 overflow-y-auto p-4">
            <template v-if="panel === 'slide'">
              <p v-if="slide" class="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--mds-text-secondary)]">Trang {{ selected + 1 }} · {{ LAYOUT_LABEL[slide.layout] }}</p>
              <FreeElementsPanel
                v-if="slide && isFree"
                class="mb-4"
                :slide="slide"
                :selected-id="selectedElId"
                :live="live"
                :media="media"
                :video-library="videoLibrary"
                @media="(m) => sm.open({ ...m, index: selected })"
              />
              <SlideFields v-if="slide" :key="slide.id || selected" :slide="slide" :assets="ed.assets.value" :upload="ed.uploadImage" :media="media" :video-library="videoLibrary" studio @change-layout="ed.changeLayout" @media="(m) => sm.open({ ...m, index: selected })" />
            </template>
            <div v-else class="flex flex-col gap-4">
              <DesignPanel v-model:footer="draft.spec.footer" :design="draft.spec" :media="media" :title="draft.title" :subtitle="draft.spec.slides[0]?.subtitle || ''" :ratio="deck.ratio" />
              <FormAlert tone="info">Màu sắc, nền, phông chữ và logo áp dụng cho toàn bộ bài sau khi bấm <strong>Lưu</strong>.</FormAlert>
              <FormAlert tone="info">
                Tỷ lệ khung và chế độ chia sẻ được áp dụng ngay khi đổi trên thanh công cụ. Công khai: mọi người dùng của hệ thống đều xem và nhân bản được bài này.
              </FormAlert>
            </div>
          </div>
        </aside>
      </div>

      <!-- Thanh lưu dính đáy: Primary ngoài cùng bên phải -->
      <div class="shrink-0 border-t border-[var(--mds-border)] bg-[var(--mds-bg)] px-4 py-3">
        <FormAlert v-if="saveError" class="mb-3">
          {{ saveError.message }}
          <ul v-if="saveDetails.length" class="mt-1 list-disc pl-4">
            <li v-for="(d, k) in saveDetails" :key="k">{{ d.message || d }}</li>
          </ul>
          <button v-if="saveError.status === 409" type="button" class="mt-1 font-medium text-[var(--mds-brand-600)] hover:underline" @click="ed.load()">Tải lại bản mới nhất (bỏ thay đổi của tôi)</button>
        </FormAlert>
        <div class="flex items-center justify-end gap-2">
          <span class="mr-auto text-[12px] text-[var(--mds-text-secondary)]">{{ dirty ? 'Có thay đổi chưa lưu — khung xem trước đang hiển thị bản nháp' : 'Mọi thay đổi đã được lưu' }}</span>
          <MButton variant="outline" :disabled="!dirty || saving" @click="ed.discard()">Hủy thay đổi</MButton>
          <MTooltip content="Lưu" shortcut="Ctrl+S">
            <MButton variant="primary" :loading="saving" :disabled="!dirty" @click="onSave"><template #icon><MIcon name="device-floppy" :size="16" /></template>Lưu</MButton>
          </MTooltip>
        </div>
      </div>
    </template>

    <MDialog v-model="insertOpen" title="Thêm trang" width="880px">
      <InsertSlidePanel @pick="onInsert" />
      <template #footer><span /></template>
    </MDialog>
    <ImageStudio
      v-if="draft"
      v-model="sm.imageOpen.value"
      :title="sm.title.value"
      :image="sm.image.value"
      :aspect="sm.aspect.value"
      :media="media"
      :assets="ed.assets.value"
      :suggest="sm.suggest.value"
      @apply="sm.applyImage"
    />
    <MDialog v-model="sm.videoOpen.value" :title="sm.title.value" width="560px">
      <VideoPicker v-if="sm.videoOpen.value" :model-value="sm.video.value" :media="media" :library="videoLibrary" @update:model-value="sm.applyVideo" />
      <template #footer>
        <MButton v-if="sm.canSwitch.value" variant="ghost" class="mr-auto" @click="sm.switchTo('image')"><template #icon><MIcon name="photo" :size="16" /></template>Dùng ảnh thay video</MButton>
        <MButton variant="primary" @click="sm.close()">Xong</MButton>
      </template>
    </MDialog>

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" @confirm="doRemove">
      <p class="text-[14px] leading-5">Bài cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn. Không thể khôi phục.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời trang khi chưa lưu?" confirm-text="Bỏ thay đổi và rời đi" cancel-text="Ở lại" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[14px] leading-5">Các thay đổi chưa lưu sẽ bị mất.</p>
    </MDialog>
  </DesktopShell>
</template>
