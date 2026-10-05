<script setup>
// 1 trang trong dàn ý: bố cục dự kiến, tiêu đề, mô tả, CÁC DÒNG NỘI DUNG SẼ HIỂN THỊ, ghi chú người trình bày, media.
// Sửa trực tiếp vào object trang của bản nháp. Enter ở 1 dòng → thêm dòng mới ngay dưới.
import { computed, nextTick, ref } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import OutlineMedia from './OutlineMedia.vue'
import { OUTLINE_LAYOUTS, OUTLINE_LAYOUT_LABEL, POINT_HINT } from '@/composables/useOutline.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'

const props = defineProps({
  slide: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  media: { type: Object, required: true },
  videoLibrary: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})
// compact (mobile): nút ⋯ 44px phát 'menu' để trang mở bottom sheet thay vì dropdown nhỏ.
const emit = defineEmits(['action', 'menu'])
const s = computed(() => props.slide)
const showNotes = ref(!!props.slide.notes)
const showMedia = ref(!!props.slide.video || props.slide.images.length > 0)
const mediaCount = computed(() => (s.value.video ? 1 : s.value.images.length))
const hint = computed(() => POINT_HINT[s.value.layout] || 'Mỗi dòng là 1 ý sẽ hiển thị trên trang — “Tiêu đề ngắn: diễn giải”')
const tooLong = (v, max) => (String(v ?? '').length > max ? `Tối đa ${max} ký tự` : '')

const menu = computed(() => [
  { key: 'up', label: 'Chuyển lên', icon: 'arrow-up', disabled: props.index === 0 },
  { key: 'down', label: 'Chuyển xuống', icon: 'arrow-down', disabled: props.index === props.total - 1 },
  { key: 'insert', label: 'Thêm trang phía sau', icon: 'plus' },
  { key: 'copy', label: 'Nhân bản trang', icon: 'copy' },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xóa trang', icon: 'trash', danger: true, disabled: props.total <= 1 },
])

async function focusPoint(i) {
  await nextTick()
  document.querySelector(`[data-point="${s.value.id}-${i}"]`)?.focus()
}
function addPoint(after = s.value.points.length - 1) {
  if (s.value.points.length >= L.outlinePoints) return
  s.value.points.splice(after + 1, 0, '')
  focusPoint(after + 1)
}
function removePoint(i) {
  s.value.points.splice(i, 1)
  if (!s.value.points.length) s.value.points.push('')
  focusPoint(Math.max(0, i - 1))
}
function onPointKey(e, i) {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    addPoint(i)
  } else if (e.key === 'Backspace' && !s.value.points[i] && s.value.points.length > 1) {
    e.preventDefault()
    removePoint(i)
  }
}
function movePoint(i, dir) {
  const j = i + dir
  if (j < 0 || j >= s.value.points.length) return
  const [x] = s.value.points.splice(i, 1)
  s.value.points.splice(j, 0, x)
  focusPoint(j)
}
</script>

<template>
  <article class="flex min-w-0 flex-col gap-3 rounded-lg bg-[var(--mds-bg)] p-4 shadow-[var(--mds-shadow-card)]" :aria-label="`Trang ${index + 1}`">
    <header class="flex items-center gap-2">
      <span class="grid h-7 min-w-7 place-items-center rounded-full bg-[var(--mds-brand-50)] px-2 text-[13px] font-semibold tabular-nums text-[var(--mds-brand-600)]">{{ index + 1 }}</span>
      <div class="w-[180px] max-w-[50%]">
        <MSelect v-model="s.layout" :options="OUTLINE_LAYOUTS" :aria-label="`Bố cục trang ${index + 1}`" />
      </div>
      <span v-if="mediaCount" class="inline-flex items-center gap-1 text-[12px] text-[var(--mds-text-secondary)]">
        <MIcon :name="s.video ? 'video' : 'photo'" :size="14" />{{ s.video ? 'Video' : `${mediaCount} ảnh` }}
      </span>
      <div class="ml-auto">
        <button
          v-if="compact"
          type="button"
          class="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-[var(--mds-icon-neutral)] active:bg-[var(--mds-bg-hover-soft)]"
          :aria-label="`Thao tác trang ${index + 1}`"
          @click="emit('menu', menu)"
        >
          <MIcon name="dots" :size="20" />
        </button>
        <MDropdownMenu v-else :items="menu" @select="(k) => emit('action', k)" />
      </div>
    </header>

    <MInput v-model="s.title" :placeholder="index === 0 ? 'Tên bài / tiêu đề trang bìa' : 'Tiêu đề trang'" :aria-label="`Tiêu đề trang ${index + 1}`" :error="tooLong(s.title, L.title)" class="text-[15px] font-semibold" />
    <MTextarea v-model="s.subtitle" :rows="compact ? 2 : 1" placeholder="Mô tả ngắn (tuỳ chọn)" :maxlength="L.subtitle" :aria-label="`Mô tả trang ${index + 1}`" />

    <!-- Các dòng nội dung sẽ hiển thị -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[13px] font-medium">Nội dung hiển thị <span class="font-normal text-[var(--mds-text-secondary)]">({{ s.points.filter((p) => p.trim()).length }}/{{ L.outlinePoints }})</span></span>
      </div>
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ hint }}</p>
      <ol class="flex flex-col gap-1.5">
        <li v-for="(p, i) in s.points" :key="i" class="flex items-start gap-1.5">
          <span class="mt-[7px] w-5 shrink-0 text-right text-[12px] tabular-nums text-[var(--mds-text-secondary)]" aria-hidden="true">{{ i + 1 }}.</span>
          <div class="min-w-0 flex-1">
            <MInput
              :model-value="p"
              :data-point="`${s.id}-${i}`"
              :placeholder="i === 0 ? 'Nhập 1 dòng nội dung…' : ''"
              :aria-label="`Dòng ${i + 1} trang ${index + 1}`"
              :error="tooLong(p, L.outlinePoint)"
              @update:model-value="(v) => (s.points[i] = v)"
              @keydown="(e) => onPointKey(e, i)"
            />
          </div>
          <div v-if="!compact" class="flex shrink-0">
            <MButton variant="icon" aria-label="Chuyển dòng lên" :disabled="i === 0" @click="movePoint(i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Chuyển dòng xuống" :disabled="i === s.points.length - 1" @click="movePoint(i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
          </div>
          <MButton variant="icon" aria-label="Xoá dòng" @click="removePoint(i)"><template #icon><MIcon name="x" :size="16" /></template></MButton>
        </li>
      </ol>
      <div class="flex flex-wrap gap-2 pl-6">
        <MButton v-if="s.points.length < L.outlinePoints" variant="ghost" @click="addPoint()"><template #icon><MIcon name="plus" :size="16" /></template>Thêm dòng</MButton>
        <MButton variant="ghost" :aria-expanded="showMedia" @click="showMedia = !showMedia">
          <template #icon><MIcon name="photo" :size="16" /></template>{{ mediaCount ? `Media (${mediaCount})` : 'Thêm ảnh / video' }}
        </MButton>
        <MButton variant="ghost" :aria-expanded="showNotes" @click="showNotes = !showNotes">
          <template #icon><MIcon name="message" :size="16" /></template>{{ s.notes ? 'Ghi chú' : 'Thêm ghi chú' }}
        </MButton>
      </div>
    </div>

    <div v-if="showMedia" class="rounded-lg border border-[var(--mds-border)] p-3">
      <OutlineMedia :slide="s" :media="media" :video-library="videoLibrary" />
    </div>
    <MTextarea v-if="showNotes" v-model="s.notes" :rows="2" placeholder="Ghi chú người trình bày (không hiển thị trên slide)" :maxlength="L.notes" :aria-label="`Ghi chú trang ${index + 1}`" />
    <p class="sr-only">Bố cục: {{ OUTLINE_LAYOUT_LABEL[s.layout] }}</p>
  </article>
</template>
