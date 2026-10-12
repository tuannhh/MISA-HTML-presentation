<script setup>
// Xuất bản ra web (chỉ chủ bài) — nằm trong SharePanel, dùng chung desktop và mobile (compact).
// Trang công khai là ẢNH CHỤP tại lúc xuất bản: sửa bài xong phải "Cập nhật bản xuất bản". Ai có link đều xem được, kể cả ngoài MISA.
import { computed, onMounted, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import FormAlert from '@/shared/FormAlert.vue'
import { useToast } from '@/components/mds/toast.js'
import { usePublication } from '@/composables/usePublication.js'

const props = defineProps({
  deckId: { type: String, required: true },
  compact: { type: Boolean, default: false },
})

const toast = useToast()
const pub = usePublication(props.deckId)
const { state, loading, error, busy } = pub
const confirmOff = ref(false)
const copied = ref(false)
const linkBox = ref(null)
const small = computed(() => (props.compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'))
const when = computed(() => (state.value?.publishedAt ? new Date(state.value.publishedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : ''))

async function onPublish() {
  const first = !state.value?.published
  try {
    await pub.publish()
    toast.success(first ? 'Đã xuất bản — sao chép link để gửi cho mọi người' : 'Đã cập nhật bản xuất bản theo nội dung mới nhất')
  } catch (err) {
    toast.error(err.message)
  }
}

async function onUnpublish() {
  try {
    await pub.unpublish()
    confirmOff.value = false
    toast.success('Đã gỡ xuất bản — link không còn xem được')
  } catch (err) {
    toast.error(err.message)
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(state.value.url)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Trình duyệt chặn clipboard → bôi đen để người dùng tự sao chép.
    const range = document.createRange()
    range.selectNodeContents(linkBox.value)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

const openLink = () => window.open(state.value.url, '_blank', 'noopener')

onMounted(pub.load)
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg border border-[var(--mds-border)] p-3" aria-labelledby="publish-title">
    <div class="flex items-start gap-3">
      <MIcon name="cloud-upload" :size="compact ? 24 : 20" class="mt-0.5 shrink-0 text-[var(--mds-icon-neutral)]" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p id="publish-title" class="font-semibold">Xuất bản ra web</p>
          <MTag v-if="state?.published" color="success" size="sm">Đang xuất bản</MTag>
          <MTag v-if="state?.outdated" color="warning" size="sm">Có thay đổi chưa cập nhật</MTag>
        </div>
        <p class="text-[var(--mds-text-secondary)]" :class="small">
          Tạo trang web để gửi link cho người khác xem bản trình chiếu — <strong>ai có link đều xem được, kể cả ngoài MISA</strong>.
          Trang giữ nội dung tại lúc xuất bản; sửa bài xong bấm <strong>Cập nhật</strong>.
        </p>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-2"><MSpinner :size="20" /></div>
    <FormAlert v-else-if="error">
      {{ error.message }}
      <button type="button" class="ml-1 font-medium text-[var(--mds-brand-600)] hover:underline" :class="compact ? 'min-h-12' : ''" @click="pub.load()">Thử lại</button>
    </FormAlert>
    <FormAlert v-else-if="state && !state.enabled" tone="info">Chưa cấu hình domain công khai để xuất bản. Liên hệ quản trị hệ thống.</FormAlert>

    <template v-else-if="state">
      <template v-if="state.published">
        <div class="flex items-center gap-2 rounded-lg bg-[var(--mds-bg-page)] p-2" :class="compact ? 'flex-col items-stretch' : ''">
          <a ref="linkBox" :href="state.url" target="_blank" rel="noopener" class="min-w-0 flex-1 truncate px-1 font-medium text-[var(--mds-brand-600)] hover:underline" :title="state.url">{{ state.url }}</a>
          <div class="flex gap-2">
            <MButton variant="outline" :class="compact ? 'flex-1' : ''" @click="copyLink">
              <template #icon><MIcon :name="copied ? 'check' : 'copy'" :size="16" /></template>
              {{ copied ? 'Đã chép' : 'Sao chép link' }}
            </MButton>
            <MButton variant="icon" aria-label="Mở trang xuất bản trong tab mới" title="Mở trang xuất bản trong tab mới" @click="openLink">
              <template #icon><MIcon name="external-link" :size="compact ? 24 : 16" /></template>
            </MButton>
          </div>
        </div>
        <p class="text-[var(--mds-text-secondary)]" :class="small">Xuất bản lúc {{ when }}.</p>
        <FormAlert v-if="confirmOff" tone="warning">
          Gỡ xuất bản? Link sẽ không xem được nữa (bộ nhớ đệm có thể còn hiện thêm vài phút). Xuất bản lại sau vẫn dùng cùng link.
          <div class="mt-2 flex justify-end gap-2">
            <MButton variant="ghost" :disabled="!!busy" @click="confirmOff = false">Huỷ</MButton>
            <MButton variant="danger" :loading="busy === 'unpublish'" @click="onUnpublish">Gỡ xuất bản</MButton>
          </div>
        </FormAlert>
        <div v-else class="flex flex-wrap justify-end gap-2" :class="compact ? 'flex-col-reverse items-stretch' : ''">
          <MButton variant="ghost" :disabled="!!busy" @click="confirmOff = true">Gỡ xuất bản</MButton>
          <MButton variant="outline" :loading="busy === 'publish'" :disabled="busy === 'unpublish'" @click="onPublish">
            <template #icon><MIcon name="refresh" :size="16" /></template>Cập nhật bản xuất bản
          </MButton>
        </div>
      </template>
      <div v-else class="flex justify-end" :class="compact ? 'flex-col items-stretch' : ''">
        <MButton variant="outline" :loading="busy === 'publish'" @click="onPublish">
          <template #icon><MIcon name="cloud-upload" :size="16" /></template>Xuất bản
        </MButton>
      </div>
    </template>
  </section>
</template>
