<script setup>
// Hiển thị mật khẩu tạm MỘT lần (không lưu ở client) kèm nút sao chép.
import { ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import FormAlert from './FormAlert.vue'

const props = defineProps({
  email: { type: String, required: true },
  password: { type: String, required: true },
})
const copied = ref(false)
const box = ref(null)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Trình duyệt chặn clipboard → bôi đen để người dùng tự sao chép.
    const range = document.createRange()
    range.selectNodeContents(box.value)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-[14px] leading-5">Gửi mật khẩu tạm cho <strong>{{ email }}</strong> qua kênh an toàn. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
    <div class="flex items-center gap-2 rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] p-3">
      <code ref="box" class="min-w-0 flex-1 select-all break-all font-mono text-[16px] tracking-wide">{{ password }}</code>
      <MButton variant="outline" @click="copy">
        <template #icon><MIcon :name="copied ? 'check' : 'copy'" :size="16" /></template>
        {{ copied ? 'Đã chép' : 'Sao chép' }}
      </MButton>
    </div>
    <FormAlert tone="warning">Mật khẩu này chỉ hiển thị một lần. Đóng hộp thoại sẽ không xem lại được.</FormAlert>
  </div>
</template>
