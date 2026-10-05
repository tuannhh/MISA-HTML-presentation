<script setup>
// Trình soạn thảo mobile: xem trước (bản đã lưu) → dải chọn trang cuộn ngang → form nội dung trang; footer sticky Hủy thay đổi | Lưu.
// Thiết kế & thiết lập bài (tên, màu – nền – phông – logo, chân trang, tỷ lệ, chia sẻ) là màn con toàn màn hình trong cùng route.
// Bài còn ở bước dàn ý (đang lập / chờ duyệt) → chuyển sang màn duyệt dàn ý.
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
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
import { useEditor, usePreviewSync } from '@/composables/useEditor.js'
import { LAYOUTS, LAYOUT_LABEL, SPEC_LIMITS } from '@/lib/slideModel.js'
import { ratioCss } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.id
const ed = useEditor(id, { onOutline: () => router.replace(`/p/${id}/outline`) })
const { deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, assets, media, videoLibrary } = ed

const view = ref('slides') // 'slides' | 'deck'
const frame = ref(null)
const strip = ref(null)
const { goto } = usePreviewSync(frame, selected)
watch(selected, async (i) => {
  goto(i)
  await nextTick()
  strip.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
})

const sheet = ref('') // '' | 'more' | 'add' | 'slide'
const sheetOpen = computed({ get: () => !!sheet.value, set: (v) => !v && (sheet.value = '') })
const moreItems = computed(() => [
  { key: 'settings', label: 'Thiết kế & thiết lập bài', icon: 'palette' },
  { key: 'html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
  { key: 'pdf', label: 'Tải PDF', icon: 'download' },
  { key: 'duplicate', label: 'Nhân bản bài', icon: 'copy' },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xóa bài', icon: 'trash', danger: true },
])
const addItems = LAYOUTS.map((l) => ({ key: l.value, label: l.label, icon: l.icon }))
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
  if (await ed.save()) toast.success('Đã lưu và render lại')
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
      router.push(`/p/${copy.id}/edit`)
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
      <MButton variant="icon" aria-label="Trình chiếu" @click="router.push(`/p/${id}/view`)"><template #icon><MIcon name="eye" :size="24" /></template></MButton>
    </template>

    <div v-if="loading" class="flex justify-center py-16"><MSpinner :size="32" /></div>

    <div v-else-if="loadError" class="px-4 py-10">
      <MEmptyState type="no-result" :title="loadError.status === 404 ? 'Không tìm thấy bài trình bày' : 'Không tải được bài'" :description="loadError.status === 404 ? 'Bài có thể đã bị xóa hoặc bạn không có quyền.' : loadError.message">
        <template #actions><MButton variant="primary" @click="router.push('/decks')">Về danh sách</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck && !deck.isOwner" class="px-4 py-10">
      <MEmptyState title="Bạn chỉ có quyền xem bài này" description="Nhân bản về bài của bạn để chỉnh sửa.">
        <template #actions><MButton variant="primary" @click="router.push(`/p/${id}/view`)">Trình chiếu</MButton></template>
      </MEmptyState>
    </div>

    <div v-else-if="deck?.status === 'generating'" class="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <MSpinner :size="40" />
      <p class="mds-mobile-readable text-[16px] font-semibold leading-6">AI đang dựng “{{ deck.title }}” theo dàn ý</p>
      <p class="text-[14px] leading-5 text-[var(--mds-text-secondary)]">Chọn bố cục, biểu tượng, sắp xếp số liệu và đặt ảnh/video bạn đã gắn — thường dưới 1 phút. Bạn có thể rời màn hình, bài vẫn tiếp tục được dựng.</p>
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
          <iframe v-if="previewUrl" ref="frame" data-deck-frame :key="previewUrl" :src="previewUrl" title="Xem trước bài trình bày" sandbox="allow-scripts allow-popups" class="absolute inset-0 h-full w-full border-0" @load="goto(selected)" />
          <div v-if="saving" class="absolute inset-0 grid place-items-center bg-black/40"><MSpinner :size="32" /></div>
        </div>
      </div>
      <p v-if="dirty" class="flex items-center gap-1 bg-[var(--mds-warning-soft)] px-4 py-2 text-[13px] leading-[18px]">
        <MIcon name="info-circle" :size="16" class="shrink-0 text-[var(--mds-warning)]" />Xem trước là bản đã lưu. Bấm Lưu để render lại.
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
        <MButton variant="icon" aria-label="Thêm trang" @click="sheet = 'add'"><template #icon><MIcon name="plus" :size="24" /></template></MButton>
        <MButton variant="icon" aria-label="Thao tác trang" @click="sheet = 'slide'"><template #icon><MIcon name="dots-vertical" :size="24" /></template></MButton>
      </div>

      <div class="bg-[var(--mds-bg)] p-4">
        <p v-if="slide" class="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--mds-text-secondary)]">Trang {{ selected + 1 }} · {{ LAYOUT_LABEL[slide.layout] }}</p>
        <SlideFields v-if="slide" :key="slide.id || selected" :slide="slide" :assets="assets" :upload="ed.uploadImage" :media="media" :video-library="videoLibrary" @change-layout="ed.changeLayout" />
      </div>
    </template>

    <template v-if="draft && deck?.status === 'ready' && deck.isOwner" #footer>
      <FormAlert v-if="saveError" class="mb-2 max-h-[30dvh] overflow-y-auto">
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
      :title="sheet === 'add' ? 'Thêm trang với bố cục' : sheet === 'slide' ? `Trang ${selected + 1}` : draft?.title"
      :items="sheet === 'add' ? addItems : sheet === 'slide' ? slideItems : moreItems"
      @select="(k) => (sheet === 'add' ? guard(() => ed.addSlide(k)) : sheet === 'slide' ? onSlideAction(k) : onMore(k))"
    />

    <MDialog v-model="confirmRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" width="calc(100vw - 32px)" @confirm="doRemove">
      <p class="text-[15px] leading-6">Bài cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn.</p>
    </MDialog>
    <MDialog :model-value="!!leaveTo" type="confirm" title="Rời đi khi chưa lưu?" confirm-text="Bỏ thay đổi" cancel-text="Ở lại" width="calc(100vw - 32px)" @update:model-value="(v) => !v && (leaveTo = null)" @confirm="confirmLeave" @cancel="leaveTo = null">
      <p class="text-[15px] leading-6">Các thay đổi chưa lưu sẽ bị mất.</p>
    </MDialog>
  </MobileShell>
</template>
