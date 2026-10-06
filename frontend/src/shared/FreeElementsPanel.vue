<script setup>
// Bảng điều khiển trang tự do: thêm phần tử (chữ, ảnh, video, bảng, hình khối), danh sách lớp, thuộc tính phần tử đang chọn.
// Vị trí/kích thước thường chỉnh bằng kéo thả trên khung xem trước; ở đây có ô số (%) để căn chính xác.
// Mọi thay đổi ghi thẳng vào bản nháp → khung xem trước dựng lại ngay (useLiveDeck); Lưu mới gửi lên máy chủ.
import { computed } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MTooltip from '@/components/mds/MTooltip.vue'
import FormField from './FormField.vue'
import RangeField from './RangeField.vue'
import VideoPicker from './VideoPicker.vue'
import { useToast } from '@/components/mds/toast.js'
import { newElement, TEXT_STYLES, TEXT_COLORS, FILLS, SHAPES, SHAPE_FILLS, TABLE_STYLES, RADII, SIZE_RANGE } from '@shared/deck/free.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'

const props = defineProps({
  slide: { type: Object, required: true },
  selectedId: { type: String, default: '' },
  live: { type: Object, required: true }, // useLiveDeck()
  media: { type: Object, required: true },
  videoLibrary: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['media'])
const toast = useToast()

const els = computed(() => props.slide.elements || [])
const el = computed(() => els.value.find((e) => e.id === props.selectedId) || null)
const opts = (o) => Object.entries(o).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }))
const STYLE_OPTS = opts(TEXT_STYLES)
const COLOR_OPTS = opts(TEXT_COLORS)
const FILL_OPTS = opts(FILLS)
const SHAPE_OPTS = opts(SHAPES)
const SHAPE_FILL_OPTS = opts(SHAPE_FILLS)
const TABLE_OPTS = opts(TABLE_STYLES)
const RADIUS_OPTS = opts(RADII)

const TYPE_LABEL = { text: 'Chữ', image: 'Ảnh', video: 'Video', table: 'Bảng', shape: 'Hình khối' }
const TYPE_ICON = { text: 'typography', image: 'photo', video: 'video', table: 'table', shape: 'square-rounded' }
const label = (e) => (e.type === 'text' ? (e.text || '').trim().slice(0, 40) || 'Chữ (trống)' : TYPE_LABEL[e.type])

// Phần tử mới đặt so le để không chồng khít lên phần tử trước.
const ADD = [
  { key: 'title', label: 'Tiêu đề', icon: 'typography', make: (o) => newElement('text', { style: 'heading', text: 'Tiêu đề', x: 8 + o, y: 8 + o, w: 60, h: 14 }) },
  { key: 'text', label: 'Đoạn văn', icon: 'align-left', make: (o) => newElement('text', { text: 'Nhập nội dung', x: 10 + o, y: 28 + o, w: 45, h: 28 }) },
  { key: 'image', label: 'Ảnh', icon: 'photo', make: (o) => newElement('image', { x: 50 + o, y: 22 + o, w: 38, h: 50 }) },
  { key: 'video', label: 'Video', icon: 'video', make: (o) => newElement('video', { x: 25 + o, y: 22 + o, w: 50, h: 50 }) },
  { key: 'table', label: 'Bảng', icon: 'table', make: (o) => newElement('table', { x: 8 + o, y: 26 + o, w: 70, h: 40 }) },
  { key: 'shape', label: 'Hình khối', icon: 'square-rounded', make: (o) => newElement('shape', { x: 30 + o, y: 30 + o, w: 30, h: 30 }) },
]
function add(a) {
  try {
    const o = (els.value.length % 5) * 2
    const e = props.live.addElement(a.make(o))
    // Ảnh/video mới → mở ngay hộp chọn nguồn.
    if (e && (e.type === 'image' || e.type === 'video')) setTimeout(() => emit('media', { path: `elements.${e.id}`, kind: e.type, aspect: (e.w * 16) / (e.h * 9) }), 50)
  } catch (err) {
    toast.error(err.message)
  }
}

const idx = computed(() => props.live.selectedEl.value?.index ?? 0)
const setNum = (k, v, min, max) => {
  const n = Number(String(v).replace(',', '.'))
  if (el.value && Number.isFinite(n)) el.value[k] = Math.min(max, Math.max(min, Math.round(n * 100) / 100))
}
const imgUrl = computed(() => (el.value?.image?.asset ? props.media.assetUrl(el.value.image.asset) : ''))

/* ---- bảng ---- */
const cols = computed(() => el.value?.rows?.[0]?.length || 0)
function addRow() {
  if (el.value.rows.length >= L.tableRows) return toast.error(`Tối đa ${L.tableRows} hàng`)
  el.value.rows.push(Array(cols.value).fill(''))
}
function delRow() {
  if (el.value.rows.length > 1) el.value.rows.pop()
}
function addCol() {
  if (cols.value >= L.tableCols) return toast.error(`Tối đa ${L.tableCols} cột`)
  el.value.rows.forEach((r) => r.push(''))
}
function delCol() {
  if (cols.value > 1) el.value.rows.forEach((r) => r.pop())
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <section>
      <h3 class="mb-2 text-[13px] font-semibold">Thêm phần tử</h3>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="a in ADD"
          :key="a.key"
          type="button"
          class="flex flex-col items-center justify-center gap-1 rounded-lg border border-[var(--mds-border)] text-[12px] hover:border-[var(--mds-brand-600)] hover:text-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="compact ? 'min-h-16 text-[14px]' : 'h-14'"
          @click="add(a)"
        >
          <MIcon :name="a.icon" :size="20" />{{ a.label }}
        </button>
      </div>
    </section>

    <section v-if="els.length">
      <h3 class="mb-2 text-[13px] font-semibold">Lớp ({{ els.length }}/{{ L.elements }})</h3>
      <ol class="flex flex-col gap-1">
        <li v-for="e in [...els].reverse()" :key="e.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 text-left text-[13px]"
            :class="[compact ? 'min-h-11' : 'h-8', e.id === selectedId ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]' : 'hover:bg-[var(--mds-bg-hover-soft)]']"
            :aria-pressed="e.id === selectedId"
            @click="live.selectElement(e.id)"
          >
            <MIcon :name="TYPE_ICON[e.type]" :size="16" class="shrink-0" /><span class="min-w-0 flex-1 truncate">{{ label(e) }}</span>
          </button>
        </li>
      </ol>
    </section>

    <section v-if="el" class="flex flex-col gap-3 rounded-lg border border-[var(--mds-border)] p-3">
      <div class="flex items-center gap-1">
        <h3 class="mr-auto text-[13px] font-semibold">{{ TYPE_LABEL[el.type] }}</h3>
        <MTooltip content="Đưa lên trên cùng"><MButton variant="icon" aria-label="Đưa lên trên cùng" @click="live.reorderElement(idx, el.id, 'front')"><template #icon><MIcon name="arrow-up" :size="16" /></template></MButton></MTooltip>
        <MTooltip content="Đưa xuống dưới cùng"><MButton variant="icon" aria-label="Đưa xuống dưới cùng" @click="live.reorderElement(idx, el.id, 'back')"><template #icon><MIcon name="arrow-down" :size="16" /></template></MButton></MTooltip>
        <MTooltip content="Nhân bản (Ctrl+D)"><MButton variant="icon" aria-label="Nhân bản phần tử" @click="live.duplicateElement(idx, el.id)"><template #icon><MIcon name="copy" :size="16" /></template></MButton></MTooltip>
        <MTooltip content="Xóa (Delete)"><MButton variant="icon" aria-label="Xóa phần tử" @click="live.removeElement(idx, el.id)"><template #icon><MIcon name="trash" :size="16" /></template></MButton></MTooltip>
      </div>

      <div class="grid grid-cols-4 gap-2">
        <label v-for="k in ['x', 'y', 'w', 'h']" :key="k" class="flex flex-col gap-0.5 text-[11px] text-[var(--mds-text-secondary)]">
          {{ { x: 'Trái %', y: 'Trên %', w: 'Rộng %', h: 'Cao %' }[k] }}
          <!-- Áp khi rời ô / Enter (không áp từng phím — tránh bị kẹp giá trị khi đang gõ dở) -->
          <MInput :model-value="String(el[k])" inputmode="decimal" :aria-label="{ x: 'Vị trí trái (%)', y: 'Vị trí trên (%)', w: 'Chiều rộng (%)', h: 'Chiều cao (%)' }[k]" @change="(e) => setNum(k, e.target.value, k === 'x' || k === 'y' ? -50 : 2, k === 'x' || k === 'y' ? 100 : 150)" />
        </label>
      </div>

      <!-- Chữ -->
      <template v-if="el.type === 'text'">
        <FormField label="Nội dung" hint="Hoặc bấm đúp vào chữ trên khung xem trước để sửa trực tiếp">
          <MTextarea v-model="el.text" :rows="3" :maxlength="L.elText" />
        </FormField>
        <div class="grid grid-cols-2 gap-2">
          <FormField label="Kiểu chữ"><MSelect v-model="el.style" :options="STYLE_OPTS" /></FormField>
          <FormField label="Màu chữ"><MSelect v-model="el.color" :options="COLOR_OPTS" /></FormField>
        </div>
        <RangeField v-model="el.size" label="Cỡ chữ" :min="SIZE_RANGE.min" :max="SIZE_RANGE.max" :step="0.05" :reset="1" :format="(v) => `${Math.round(v * 100)}%`" />
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex gap-1" role="group" aria-label="Căn ngang">
            <MButton v-for="a in ['left', 'center', 'right']" :key="a" variant="icon" :class="el.align === a ? 'bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : ''" :aria-pressed="el.align === a" :aria-label="{ left: 'Căn trái', center: 'Căn giữa', right: 'Căn phải' }[a]" @click="el.align = a">
              <template #icon><MIcon :name="`align-${a}`" :size="16" /></template>
            </MButton>
          </div>
          <div class="flex gap-1" role="group" aria-label="Căn dọc">
            <button
              v-for="v in [{ k: 'top', l: 'Trên' }, { k: 'middle', l: 'Giữa' }, { k: 'bottom', l: 'Dưới' }]"
              :key="v.k"
              type="button"
              class="h-8 rounded-lg border px-2 text-[12px]"
              :class="el.valign === v.k ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)]'"
              :aria-pressed="el.valign === v.k"
              @click="el.valign = v.k"
            >
              {{ v.l }}
            </button>
          </div>
        </div>
        <FormField label="Nền khối chữ"><MSelect v-model="el.fill" :options="FILL_OPTS" /></FormField>
      </template>

      <!-- Ảnh -->
      <template v-else-if="el.type === 'image'">
        <button type="button" class="relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] hover:border-[var(--mds-brand-600)]" @click="emit('media', { path: `elements.${el.id}`, kind: 'image', aspect: (el.w * 16) / (el.h * 9) })">
          <img v-if="imgUrl" :src="imgUrl" alt="" class="h-full w-full object-cover" />
          <span v-else class="flex flex-col items-center gap-1 text-[12px] text-[var(--mds-text-secondary)]"><MIcon name="photo" :size="28" />Chọn ảnh</span>
        </button>
        <MButton variant="outline" @click="emit('media', { path: `elements.${el.id}`, kind: 'image', aspect: (el.w * 16) / (el.h * 9) })"><template #icon><MIcon name="adjustments" :size="16" /></template>{{ imgUrl ? 'Đổi / chỉnh sửa ảnh' : 'Chọn ảnh' }}</MButton>
        <FormField label="Bo góc"><MSelect v-model="el.radius" :options="RADIUS_OPTS" /></FormField>
        <MInput v-if="el.image" v-model="el.image.alt" placeholder="Mô tả ảnh (cho trình đọc màn hình)" />
      </template>

      <!-- Video -->
      <template v-else-if="el.type === 'video'">
        <VideoPicker v-model="el.video" :media="media" :library="videoLibrary" compact />
      </template>

      <!-- Bảng -->
      <template v-else-if="el.type === 'table'">
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          <span class="text-[var(--mds-text-secondary)]">{{ el.rows.length }} hàng × {{ cols }} cột</span>
          <MButton variant="outline" @click="addRow"><template #icon><MIcon name="row-insert-bottom" :size="16" /></template>Hàng</MButton>
          <MButton variant="outline" @click="addCol"><template #icon><MIcon name="column-insert-right" :size="16" /></template>Cột</MButton>
          <MButton variant="ghost" :disabled="el.rows.length <= 1" @click="delRow">− Hàng</MButton>
          <MButton variant="ghost" :disabled="cols <= 1" @click="delCol">− Cột</MButton>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FormField label="Kiểu bảng"><MSelect v-model="el.style" :options="TABLE_OPTS" /></FormField>
          <div class="flex items-end pb-1"><MSwitch v-model="el.header" label="Hàng tiêu đề" /></div>
        </div>
        <RangeField v-model="el.size" label="Cỡ chữ" :min="SIZE_RANGE.min" :max="SIZE_RANGE.max" :step="0.05" :reset="1" :format="(v) => `${Math.round(v * 100)}%`" />
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-[12px]">
            <tr v-for="(row, r) in el.rows" :key="r">
              <td v-for="(_, c) in row" :key="c" class="border border-[var(--mds-border)] p-0">
                <input
                  v-model="row[c]"
                  :maxlength="L.cell"
                  class="h-8 w-full min-w-[72px] bg-transparent px-1.5 outline-none focus:bg-[var(--mds-brand-50)]"
                  :class="r === 0 && el.header ? 'font-semibold' : ''"
                  :aria-label="`Ô hàng ${r + 1} cột ${c + 1}`"
                />
              </td>
            </tr>
          </table>
        </div>
      </template>

      <!-- Hình khối -->
      <template v-else>
        <div class="grid grid-cols-2 gap-2">
          <FormField label="Hình"><MSelect v-model="el.shape" :options="SHAPE_OPTS" /></FormField>
          <FormField label="Màu"><MSelect v-model="el.fill" :options="SHAPE_FILL_OPTS" /></FormField>
        </div>
        <RangeField v-model="el.opacity" label="Độ đậm" :min="0.05" :max="1" :step="0.05" :reset="1" :format="(v) => `${Math.round(v * 100)}%`" />
      </template>
    </section>
    <p v-else-if="els.length" class="text-[12px] text-[var(--mds-text-secondary)]">Bấm vào một phần tử trên khung xem trước hoặc trong danh sách lớp để chỉnh thuộc tính.</p>
  </div>
</template>
