<script setup>
// Dialog desktop "Đổi / chỉnh sửa ảnh" — bọc ImageStudioPanel (nội dung dùng chung với màn toàn màn hình của mobile).
import MDialog from '@/components/mds/MDialog.vue'
import ImageStudioPanel from './ImageStudioPanel.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Ảnh' },
  image: { type: Object, default: null },
  aspect: { type: Number, default: 16 / 9 },
  media: { type: Object, required: true },
  assets: { type: Array, default: () => [] },
  suggest: { type: String, default: '' },
  allowRemove: { type: Boolean, default: true },
  initialTab: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'apply'])
const close = () => emit('update:modelValue', false)
function apply(img) {
  emit('apply', img)
  close()
}
</script>

<template>
  <MDialog :model-value="modelValue" :title="title" width="1040px" @update:model-value="(v) => emit('update:modelValue', v)">
    <ImageStudioPanel
      v-if="modelValue"
      :image="image"
      :aspect="aspect"
      :media="media"
      :assets="assets"
      :suggest="suggest"
      :allow-remove="allowRemove"
      :initial-tab="initialTab"
      @apply="apply"
      @close="close"
    />
    <template #footer><span /></template>
  </MDialog>
</template>
