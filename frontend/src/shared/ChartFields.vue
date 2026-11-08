<script setup>
// Bảng dữ liệu biểu đồ (bố cục "Biểu đồ" — slide.chart, shared/deck/chart.js): hạng mục (hàng) × chuỗi số liệu (cột).
// Gõ trực tiếp, hoặc dán bảng từ Excel / Google Sheets vào ô bất kỳ → thay toàn bộ dữ liệu (hoàn tác được bằng Ctrl/⌘+Z).
// Ô số nhận cả "1.234,5" lẫn "1,234.5"; đang gõ thì giữ nguyên chuỗi người dùng nhập tới khi rời ô.
import { computed, reactive, ref } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import FormField from './FormField.vue'
import { CHART_LIMITS as CL, parseNum, parseTable } from '@shared/deck/chart.js'

const props = defineProps({
  slide: { type: Object, required: true },
  // Mobile: ô nhập + nút cao 44px.
  touch: { type: Boolean, default: false },
})
const ch = computed(() => props.slide.chart)
const n = computed(() => ch.value?.categories.length || 0)
const m = computed(() => ch.value?.series.length || 0)
const note = ref('')

const draft = reactive({})
const key = (k, i) => `${k}:${i}`
const show = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
const cellText = (k, i) => draft[key(k, i)] ?? show(ch.value.series[k].values[i])
const bad = (k, i) => {
  const t = draft[key(k, i)]
  return t !== undefined && t.trim() !== '' && parseNum(t) === null
}
function onCell(k, i, e) {
  const t = e.target.value
  draft[key(k, i)] = t
  ch.value.series[k].values[i] = parseNum(t)
}
function onBlur(k, i) {
  delete draft[key(k, i)]
}
const clearDraft = () => Object.keys(draft).forEach((k) => delete draft[k])

function addRow() {
  if (n.value >= CL.categories) return
  ch.value.categories.push('')
  ch.value.series.forEach((s) => s.values.push(null))
}
function removeRow(i) {
  if (n.value <= 1) return
  clearDraft()
  ch.value.categories.splice(i, 1)
  ch.value.series.forEach((s) => s.values.splice(i, 1))
}
function addSeries() {
  if (m.value >= CL.series) return
  ch.value.series.push({ name: `Chuỗi ${m.value + 1}`, values: ch.value.categories.map(() => null) })
}
function removeSeries(k) {
  if (m.value <= 1) return
  clearDraft()
  ch.value.series.splice(k, 1)
}
function onPaste(e) {
  const t = e.clipboardData?.getData('text/plain') || ''
  if (!/[\t\n]/.test(t.trim())) return // một giá trị đơn → dán vào ô như bình thường
  const tb = parseTable(t)
  if (!tb) return
  e.preventDefault()
  clearDraft()
  const keep = {}
  if (ch.value?.unit) keep.unit = ch.value.unit
  if (ch.value?.values === false) keep.values = false
  props.slide.chart = { ...tb, ...keep }
  note.value = `Đã dán ${tb.categories.length} hạng mục × ${tb.series.length} chuỗi số liệu`
}
const unit = computed({
  get: () => ch.value?.unit || '',
  set: (v) => {
    if (v) ch.value.unit = v
    else delete ch.value.unit
  },
})
const showValues = computed({
  get: () => ch.value?.values !== false,
  set: (v) => {
    if (v) delete ch.value.values
    else ch.value.values = false
  },
})
// Màn hình cảm ứng (điện thoại, máy tính bảng) → vùng chạm 44px; cột chuỗi rộng hơn để tên chuỗi không bị nút xoá 44px chiếm chỗ (bảng cuộn ngang trong khung).
const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const wide = computed(() => props.touch || coarse)
const h = computed(() => (wide.value ? 'h-11' : 'h-8'))
const cellCls = 'w-full min-w-0 rounded border bg-[var(--mds-bg)] px-2 text-[13px] text-[var(--mds-text)] focus:border-[var(--mds-brand-600)] focus:outline-none'
</script>

<template>
  <section v-if="ch" class="flex min-w-0 flex-col gap-3" aria-label="Dữ liệu biểu đồ">
    <div class="flex items-baseline justify-between gap-2">
      <h3 class="text-[14px] font-semibold text-[var(--mds-text)]">Dữ liệu biểu đồ</h3>
      <span class="text-[12px] text-[var(--mds-text-secondary)]">{{ n }}/{{ CL.categories }} hạng mục · {{ m }}/{{ CL.series }} chuỗi</span>
    </div>
    <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">
      Dán bảng từ Excel / Google Sheets vào ô bất kỳ để thay toàn bộ dữ liệu — cột đầu là hạng mục, hàng đầu là tên chuỗi.
    </p>
    <div class="overflow-x-auto rounded-lg border border-[var(--mds-border)]" @paste="onPaste">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="bg-[var(--mds-bg-page)]">
            <th scope="col" class="min-w-[120px] px-2 py-1.5 text-left font-semibold text-[var(--mds-text-secondary)]">Hạng mục</th>
            <th v-for="(se, k) in ch.series" :key="`s${k}`" :class="[wide ? 'min-w-[156px]' : 'min-w-[104px]', 'px-1 py-1']" scope="col">
              <div class="flex items-center gap-1">
                <input v-model="se.name" :class="[cellCls, h, 'border-[var(--mds-border)] font-semibold']" :maxlength="CL.label" :aria-label="`Tên chuỗi ${k + 1}`" placeholder="Tên chuỗi" />
                <MButton v-if="m > 1" variant="icon" :aria-label="`Xoá chuỗi ${se.name || k + 1}`" @click="removeSeries(k)"><template #icon><MIcon name="x" :size="14" /></template></MButton>
              </div>
            </th>
            <th v-if="m < CL.series" scope="col" class="w-px px-1 py-1">
              <MButton variant="ghost" aria-label="Thêm chuỗi số liệu" title="Thêm chuỗi số liệu" @click="addSeries"><template #icon><MIcon name="plus" :size="14" /></template>Chuỗi</MButton>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in ch.categories" :key="`c${i}`" class="border-t border-[var(--mds-border-light)]">
            <td class="px-1 py-1">
              <input v-model="ch.categories[i]" :class="[cellCls, h, 'border-[var(--mds-border)]']" :maxlength="CL.label" :aria-label="`Hạng mục ${i + 1}`" :placeholder="`Hạng mục ${i + 1}`" />
            </td>
            <td v-for="(se, k) in ch.series" :key="`v${k}`" class="px-1 py-1">
              <input
                :value="cellText(k, i)"
                :class="[cellCls, h, 'text-right tabular-nums', bad(k, i) ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]']"
                inputmode="decimal"
                :aria-label="`${se.name || `Chuỗi ${k + 1}`} — ${c || `hạng mục ${i + 1}`}`"
                :aria-invalid="bad(k, i) || undefined"
                @input="onCell(k, i, $event)"
                @blur="onBlur(k, i)"
              />
            </td>
            <td class="w-px px-1 py-1">
              <MButton variant="icon" :aria-label="`Xoá hạng mục ${c || i + 1}`" :disabled="n <= 1" @click="removeRow(i)"><template #icon><MIcon name="trash" :size="14" /></template></MButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="note" class="text-[12px] text-[var(--mds-success)]" role="status">{{ note }}</p>
    <MButton v-if="n < CL.categories" variant="outline" class="self-start" @click="addRow"><template #icon><MIcon name="plus" :size="16" /></template>Thêm hạng mục</MButton>
    <FormField label="Đơn vị" hint="Ví dụ: tỷ đồng, %, khách hàng — ghi một lần ở góc biểu đồ; riêng % gắn vào từng số">
      <MInput v-model="unit" :error="unit.length > CL.unit ? `Tối đa ${CL.unit} ký tự` : ''" placeholder="Không có" />
    </FormField>
    <MSwitch v-model="showValues" label="Hiện số liệu trên biểu đồ" />
  </section>
</template>
