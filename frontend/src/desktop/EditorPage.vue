<script setup>
// Trình soạn thảo desktop: danh sách trang | xem trước (bản đã lưu, có chuyển động) | nội dung trang đang chọn.
// Sửa chữ/ảnh trên bản nháp → Lưu → server chuẩn hoá + render lại → khung xem trước tải lại.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import SlideFields from '@/shared/SlideFields.vue'
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
import { useEditor, usePreviewSync } from '@/composables/useEditor.js'
import { LAYOUTS, LAYOUT_LABEL, LAYOUT_ICON, SPEC_LIMITS } from '@/lib/slideModel.js'
import { RATIO_OPTIONS, ratioCss } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.id
const ed = useEditor(id, { onOutline: () => router.replace(`/p/${id}/outline`) })
const { deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, media, videoLibrary } = ed

const frame = ref(null)
const { goto } = usePreviewSync(frame, selected)
watch(selected, (i) => goto(i))
const onFrameLoad = () => goto(selected.value)

const panel = ref('slide')
const PANELS = [
  { key: 'slide', label: 'Nội dung trang' },
  { key: 'deck', label: 'Thiết lập bài' },
]

const addMenu = LAYOUTS.map((l) => ({ key: l.value, label: l.label, icon: l.icon }))
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
  if (titleError.value) return toast.error(titleError.value)
  if (await ed.save()) toast.success('Đã lưu và render lại bài trình bày')
}

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
      router.push(`/p/${copy.id}/edit`)
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
          <MButton variant="outline" @click="router.push(`/p/${id}/view`)">Trình chiếu</MButton>
          <MButton variant="primary" @click="onMore('duplicate')">Nhân bản</MButton>
        </template>
      </MEmptyState>
    </div>

    <div v-else-if="deck?.status === 'generating'" class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <MSpinner :size="40" />
      <div>
        <h1 class="text-[18px] font-semibold leading-6">AI đang dựng “{{ deck.title }}” theo dàn ý</h1>
        <p class="mt-1 max-w-[520px] text-[13px] text-[var(--mds-text-secondary)]">Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn — thường dưới 1 phút. Bạn có thể rời trang, bài vẫn tiếp tục được dựng.</p>
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
          <MButton variant="outline" @click="router.push(`/p/${id}/view`)"><template #icon><MIcon name="eye" :size="16" /></template>Trình chiếu</MButton>
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
            <MDropdownMenu :items="addMenu" placement="bottom-start" @select="(k) => guard(() => ed.addSlide(k))">
              <template #activator>
                <MButton variant="outline" aria-haspopup="menu"><template #icon><MIcon name="plus" :size="16" /></template>Thêm trang</MButton>
              </template>
            </MDropdownMenu>
          </div>
          <ol class="flex-1 overflow-y-auto px-2 pb-2">
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
        <section class="flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-4" aria-label="Xem trước">
          <div class="mx-auto w-full max-w-[1280px]">
            <div class="relative w-full overflow-hidden rounded-lg bg-[#0A1530] shadow-[var(--mds-shadow-card)]" :style="{ aspectRatio: ratioCss(deck.ratio) }">
              <iframe
                v-if="previewUrl"
                ref="frame"
                data-deck-frame
                :key="previewUrl"
                :src="previewUrl"
                title="Xem trước bài trình bày"
                sandbox="allow-scripts allow-popups"
                allow="fullscreen"
                class="absolute inset-0 h-full w-full border-0"
                @load="onFrameLoad"
              />
              <div v-if="saving" class="absolute inset-0 grid place-items-center bg-black/40"><MSpinner :size="32" /></div>
            </div>
            <p class="mt-2 flex items-center gap-1 text-[12px] text-[var(--mds-text-secondary)]">
              <MIcon name="info-circle" :size="16" />
              <span v-if="dirty">Khung xem trước đang hiển thị bản đã lưu. Bấm <strong>Lưu</strong> để render lại với thay đổi mới.</span>
              <span v-else>Bấm vào khung rồi dùng ← → để chuyển trang, F để toàn màn hình.</span>
            </p>
          </div>
        </section>

        <!-- Nội dung -->
        <aside class="flex w-[400px] shrink-0 flex-col border-l border-[var(--mds-border)] bg-[var(--mds-bg)]" aria-label="Nội dung">
          <div class="px-4"><MTabs v-model="panel" :tabs="PANELS" /></div>
          <div class="flex-1 overflow-y-auto p-4">
            <template v-if="panel === 'slide'">
              <p v-if="slide" class="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--mds-text-secondary)]">Trang {{ selected + 1 }} · {{ LAYOUT_LABEL[slide.layout] }}</p>
              <SlideFields v-if="slide" :key="slide.id || selected" :slide="slide" :assets="ed.assets.value" :upload="ed.uploadImage" :media="media" :video-library="videoLibrary" @change-layout="ed.changeLayout" />
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
          <span class="mr-auto text-[12px] text-[var(--mds-text-secondary)]">{{ dirty ? 'Có thay đổi chưa lưu' : 'Mọi thay đổi đã được lưu' }}</span>
          <MButton variant="outline" :disabled="!dirty || saving" @click="ed.discard()">Hủy thay đổi</MButton>
          <MButton variant="primary" :loading="saving" :disabled="!dirty" @click="onSave"><template #icon><MIcon name="device-floppy" :size="16" /></template>Lưu</MButton>
        </div>
      </div>
    </template>

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" @confirm="doRemove">
      <p class="text-[14px] leading-5">Bài cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn. Không thể khôi phục.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời trang khi chưa lưu?" confirm-text="Bỏ thay đổi và rời đi" cancel-text="Ở lại" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[14px] leading-5">Các thay đổi chưa lưu sẽ bị mất.</p>
    </MDialog>
  </DesktopShell>
</template>
