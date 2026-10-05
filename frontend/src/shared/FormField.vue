<script setup>
// Nhãn + control + gợi ý cho 1 trường form. Mặc định <label> bọc control (gắn nhãn ngầm định cho input/textarea/select);
// group = true cho cụm nhiều control (ảnh, danh sách) → role="group" + aria-label.
defineProps({
  label: { type: String, required: true },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  group: { type: Boolean, default: false },
})
</script>

<template>
  <component :is="group ? 'div' : 'label'" class="flex min-w-0 flex-col gap-1" :role="group ? 'group' : undefined" :aria-label="group ? label : undefined">
    <span class="text-[13px] font-medium leading-[18px] text-[var(--mds-text)]">
      {{ label }}<span v-if="required" class="ml-0.5 text-[var(--mds-danger)]" aria-hidden="true">*</span>
    </span>
    <slot />
    <span v-if="hint" class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ hint }}</span>
  </component>
</template>
