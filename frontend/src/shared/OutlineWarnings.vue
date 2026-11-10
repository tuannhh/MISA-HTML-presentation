<script setup>
// Cảnh báo của dàn ý "giữ nguyên nội dung" (CT-002). Số trang và dòng quá dài tính TRỰC TIẾP từ bản nháp (sửa xong là hết cảnh báo, không cần lưu);
// "dồn dòng" chỉ server biết (lúc chuẩn hoá lời AI) → lấy từ outline.warnings, ánh xạ theo id trang để đúng số trang sau khi đổi thứ tự.
import { computed } from 'vue'
import FormAlert from '@/shared/FormAlert.vue'
import { SPEC_LIMITS } from '@/lib/slideModel.js'
import { stripLinks } from '@shared/deck/mdLinks.js'

const props = defineProps({ outline: { type: Object, required: true } })

const keep = computed(() => props.outline.options?.keepOriginal === true)
const slides = computed(() => props.outline.slides || [])
const pageNo = (pred) => slides.value.flatMap((s, i) => (pred(s) ? [i + 1] : []))
const expected = computed(() => (Number.isInteger(props.outline.options?.slideCount) ? props.outline.options.slideCount : null))
const countOff = computed(() => keep.value && expected.value && slides.value.length !== expected.value)
const tooLong = computed(() => (keep.value ? pageNo((s) => (s.points || []).some((p) => stripLinks(String(p || '')).length > SPEC_LIMITS.outlinePoint)) : []))
const merged = computed(() => {
  const ids = new Set((props.outline.warnings || []).filter((w) => w.code === 'PAGE_LINES_MERGED').map((w) => w.slide))
  return keep.value && ids.size ? pageNo((s) => ids.has(s.id)) : []
})
const show = computed(() => countOff.value || tooLong.value.length || merged.value.length)
const list = (a) => `trang ${a.join(', ')}`
</script>

<template>
  <FormAlert v-if="show" tone="warning">
    <p class="font-medium">Cần xem lại trước khi dựng bài</p>
    <ul class="mds-mobile-readable mt-1 list-disc space-y-1 pl-4">
      <li v-if="countOff">Tệp nguồn có {{ expected }} trang nhưng dàn ý đang có {{ slides.length }} trang — hãy thêm, bớt hoặc gộp trang cho khớp nguồn.</li>
      <li v-if="merged.length">{{ list(merged) }} có hơn {{ SPEC_LIMITS.outlinePoints }} dòng ở tệp nguồn: các dòng thừa đã được nối vào dòng cuối (ngăn cách bằng dấu “;”) để không mất chữ. Nên tách thành trang riêng.</li>
      <li v-if="tooLong.length">Có dòng dài hơn {{ SPEC_LIMITS.outlinePoint }} ký tự ở {{ list(tooLong) }} (ô báo đỏ) — cần tách thành nhiều dòng mới lưu được.</li>
    </ul>
  </FormAlert>
</template>
