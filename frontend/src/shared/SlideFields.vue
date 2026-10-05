<script setup>
// Form nội dung 1 slide (trường hiển thị theo layout). Sửa trực tiếp vào object slide của bản nháp;
// bấm Lưu ở trang cha mới gửi lên server và render lại.
import { computed, ref } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MCombobox from '@/components/mds/MCombobox.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import FormField from './FormField.vue'
import ImagePicker from './ImagePicker.vue'
import VideoPicker from './VideoPicker.vue'
import MTabs from '@/components/mds/MTabs.vue'
import { LAYOUTS, LAYOUT_FIELDS, ICON_OPTIONS, TONE_OPTIONS, SPEC_LIMITS as L, emptyItem, emptyStat, emptyColumn } from '@/lib/slideModel.js'

const props = defineProps({
  slide: { type: Object, required: true },
  assets: { type: Array, default: () => [] },
  upload: { type: Function, required: true },
  // useMedia() — có thì ô media nhận cả video (tải lên / YouTube).
  media: { type: Object, default: null },
  videoLibrary: { type: Array, default: () => [] },
})
const emit = defineEmits(['change-layout'])

const s = computed(() => props.slide)
// Ô ảnh chỉ nhận ảnh (asset cũ không có kind = ảnh).
const imageAssets = computed(() => props.assets.filter((a) => !a.kind || a.kind === 'image'))
const mediaTab = ref(props.slide.video ? 'video' : 'image')
const MEDIA_TABS = [
  { key: 'image', label: 'Ảnh' },
  { key: 'video', label: 'Video' },
]
function setImage(v) {
  s.value.image = v
  if (v?.asset) s.value.video = null
}
function setVideo(v) {
  s.value.video = v
  if (v) s.value.image = null
}
const has = (f) => LAYOUT_FIELDS[s.value.layout]?.includes(f)
const tooLong = (v, max) => (String(v ?? '').length > max ? `Tối đa ${max} ký tự (hiện ${String(v).length})` : '')
const layoutOptions = LAYOUTS.map((l) => ({ label: l.label, value: l.value }))

const itemLabel = computed(() => ({ agenda: 'Mục', bullets: 'Ý', cards: 'Thẻ', stats: 'Ý bổ sung', image: 'Ý bên cạnh ảnh' }[s.value.layout] || 'Mục'))
const stepLabel = computed(() => (s.value.layout === 'timeline' ? 'Mốc' : 'Bước'))

const tagsText = computed({
  get: () => (s.value.tags || []).join(', '),
  set: (v) => {
    s.value.tags = v.split(',').map((t) => t.trim()).filter(Boolean).slice(0, L.tags)
  },
})

function move(list, i, dir) {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const [x] = list.splice(i, 1)
  list.splice(j, 0, x)
}

function pointsText(col) {
  return (col.points || []).join('\n')
}
function setPoints(col, v) {
  col.points = v.split('\n').slice(0, L.points)
}

function setGalleryImage(i, v) {
  if (v) s.value.images.splice(i, 1, v)
  else s.value.images.splice(i, 1)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <FormField label="Bố cục trang">
      <MSelect :model-value="s.layout" :options="layoutOptions" @update:model-value="(v) => emit('change-layout', v)" />
    </FormField>

    <FormField v-if="has('kicker')" label="Nhãn chủ đề" hint="Dòng nhỏ phía trên tiêu đề, 1–3 từ">
      <MInput v-model="s.kicker" :error="tooLong(s.kicker, L.kicker)" placeholder="Ví dụ: Thực trạng" />
    </FormField>
    <FormField v-if="has('title')" label="Tiêu đề" required>
      <MTextarea v-model="s.title" :rows="2" :maxlength="L.title" />
    </FormField>
    <FormField v-if="has('highlight')" label="Cụm từ nhấn mạnh" hint="Phải nằm nguyên văn trong tiêu đề — sẽ được tô màu">
      <MInput
        v-model="s.highlight"
        :error="s.highlight && !s.title.includes(s.highlight) ? 'Cụm từ không có trong tiêu đề' : tooLong(s.highlight, L.highlight)"
      />
    </FormField>
    <FormField v-if="has('subtitle')" label="Mô tả ngắn">
      <MTextarea v-model="s.subtitle" :rows="2" :maxlength="L.subtitle" />
    </FormField>
    <FormField v-if="has('caption')" :label="s.layout === 'image' ? 'Chú thích ảnh' : 'Dòng thông tin'" :hint="s.layout === 'cover' ? 'Ví dụ: người trình bày · ngày' : ''">
      <MInput v-model="s.caption" :error="tooLong(s.caption, L.caption)" />
    </FormField>
    <FormField v-if="has('tags')" label="Nhãn (phân tách bằng dấu phẩy)" :hint="`Tối đa ${L.tags} nhãn`">
      <MInput v-model="tagsText" placeholder="AI First, ERP, Dữ liệu" />
    </FormField>
    <FormField v-if="has('icon') && !s.image?.asset && !s.video" label="Biểu tượng trung tâm">
      <MCombobox v-model="s.icon" :options="ICON_OPTIONS" />
    </FormField>

    <!-- Trích dẫn -->
    <template v-if="has('quote')">
      <FormField label="Nội dung trích dẫn" required>
        <MTextarea v-model="s.quote.text" :rows="4" :maxlength="L.quoteText" />
      </FormField>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Người nói"><MInput v-model="s.quote.author" :error="tooLong(s.quote.author, L.quoteAuthor)" /></FormField>
        <FormField label="Chức danh"><MInput v-model="s.quote.role" :error="tooLong(s.quote.role, L.quoteAuthor)" /></FormField>
      </div>
    </template>

    <!-- Số liệu -->
    <section v-if="has('stats')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">Con số ({{ s.stats.length }}/{{ L.stats }})</h3>
      <div v-for="(st, i) in s.stats" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">Số liệu {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.stats, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.stats.length - 1" @click="move(s.stats, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá số liệu" @click="s.stats.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <MInput v-model="st.prefix" placeholder="Tiền tố (+)" :error="tooLong(st.prefix, L.statPrefix)" />
          <MInput v-model="st.value" placeholder="Giá trị" :error="tooLong(st.value, L.statText)" />
          <MInput v-model="st.suffix" placeholder="Hậu tố (%)" :error="tooLong(st.suffix, L.statSuffix)" />
        </div>
        <MInput v-model="st.label" placeholder="Diễn giải" :error="tooLong(st.label, L.statLabel)" />
      </div>
      <MButton v-if="s.stats.length < L.stats" variant="outline" @click="s.stats.push(emptyStat())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm số liệu</MButton>
    </section>

    <!-- Mục / ý / thẻ -->
    <section v-if="has('items')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">{{ itemLabel }} ({{ s.items.length }}/{{ L.items }})</h3>
      <div v-for="(it, i) in s.items" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">{{ itemLabel }} {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.items, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.items.length - 1" @click="move(s.items, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá mục" @click="s.items.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <MInput v-model="it.title" placeholder="Tiêu đề" :error="tooLong(it.title, L.itemTitle)" />
        <MTextarea v-model="it.text" :rows="2" placeholder="Nội dung" :maxlength="L.itemText" />
        <div v-if="s.layout !== 'agenda'" class="grid grid-cols-2 gap-2">
          <MCombobox v-model="it.icon" :options="ICON_OPTIONS" placeholder="Biểu tượng" />
          <MInput v-model="it.value" placeholder="Nhãn ngắn" :error="tooLong(it.value, L.itemValue)" />
        </div>
      </div>
      <MButton v-if="s.items.length < L.items" variant="outline" @click="s.items.push(emptyItem())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm {{ itemLabel.toLowerCase() }}</MButton>
    </section>

    <!-- Bước / mốc -->
    <section v-if="has('steps')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">{{ stepLabel }} ({{ s.steps.length }}/{{ L.steps }})</h3>
      <div v-for="(st, i) in s.steps" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">{{ stepLabel }} {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.steps, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.steps.length - 1" @click="move(s.steps, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá bước" @click="s.steps.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <MInput v-model="st.value" :placeholder="s.layout === 'timeline' ? 'Mốc thời gian (Tuần 1–2, Q3/2026…)' : 'Nhãn (tuỳ chọn)'" :error="tooLong(st.value, L.itemValue)" />
        <MInput v-model="st.title" placeholder="Tiêu đề" :error="tooLong(st.title, L.itemTitle)" />
        <MTextarea v-model="st.text" :rows="2" placeholder="Mô tả" :maxlength="L.itemText" />
      </div>
      <MButton v-if="s.steps.length < L.steps" variant="outline" @click="s.steps.push(emptyItem())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm {{ stepLabel.toLowerCase() }}</MButton>
    </section>

    <!-- Cột so sánh -->
    <section v-if="has('columns')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">Cột so sánh ({{ s.columns.length }}/{{ L.columns }})</h3>
      <div v-for="(col, i) in s.columns" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">Cột {{ i + 1 }}</span>
          <MButton variant="icon" aria-label="Xoá cột" :disabled="s.columns.length <= 2" @click="s.columns.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <MInput v-model="col.title" placeholder="Tiêu đề cột" :error="tooLong(col.title, L.colTitle)" />
        <div class="grid grid-cols-2 gap-2">
          <MInput v-model="col.subtitle" placeholder="Nhãn nhỏ" :error="tooLong(col.subtitle, L.colSubtitle)" />
          <MSelect v-model="col.tone" :options="TONE_OPTIONS" />
        </div>
        <MTextarea :model-value="pointsText(col)" :rows="4" placeholder="Mỗi dòng một ý" @update:model-value="(v) => setPoints(col, v)" />
      </div>
      <MButton v-if="s.columns.length < L.columns" variant="outline" @click="s.columns.push(emptyColumn())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm cột</MButton>
    </section>

    <!-- Ảnh hoặc video (1 ô media) -->
    <FormField v-if="has('image')" :label="media ? 'Ảnh / video' : 'Ảnh'" group :hint="media ? 'Video hiển thị ảnh bìa 16:9; khi trình chiếu bấm vào sẽ tự phát toàn màn hình' : ''">
      <div class="flex min-w-0 flex-col gap-2">
        <MTabs v-if="media" v-model="mediaTab" :tabs="MEDIA_TABS" variant="pill" />
        <VideoPicker v-if="media && mediaTab === 'video'" :model-value="s.video" :media="media" :library="videoLibrary" :with-caption="s.layout === 'image'" @update:model-value="setVideo" />
        <ImagePicker v-else :model-value="s.image" :assets="imageAssets" :upload="upload" :with-caption="s.layout === 'image'" @update:model-value="setImage" />
      </div>
    </FormField>
    <section v-if="has('images')" class="flex flex-col gap-3">
      <h3 class="text-[14px] font-semibold">Ảnh ({{ s.images.length }}/{{ L.images }})</h3>
      <div v-for="(im, i) in s.images" :key="i" class="rounded-lg border border-[var(--mds-border)] p-3">
        <ImagePicker :model-value="im" :assets="imageAssets" :upload="upload" with-caption @update:model-value="(v) => setGalleryImage(i, v)" />
      </div>
      <MButton v-if="s.images.length < L.images" variant="outline" @click="s.images.push({ asset: null, alt: '', caption: '', fit: 'cover' })"><template #icon><MIcon name="plus" :size="16" /></template>Thêm ô ảnh</MButton>
    </section>

    <FormField label="Ghi chú người trình bày" hint="Không hiển thị trên slide">
      <MTextarea v-model="s.notes" :rows="3" :maxlength="L.notes" />
    </FormField>
  </div>
</template>
