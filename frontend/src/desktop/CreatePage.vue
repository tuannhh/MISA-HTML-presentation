<script setup>
// Tạo bài trình bày (desktop): nguồn nội dung → tuỳ chọn → AI tạo nền; chuyển sang trình soạn thảo để theo dõi tiến trình.
import { useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import RatioPicker from '@/shared/RatioPicker.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MUpload from '@/components/mds/MUpload.vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import { useCreate, SOURCE_MODES, ACCEPT, MAX_UPLOAD_MB } from '@/composables/useCreate.js'

const router = useRouter()
const { form, errors, submitting, submitError, submit, fileList, onSelectFiles, onOversized, clearFile } = useCreate()

async function onSubmit() {
  const res = await submit()
  if (res) router.push(`/p/${res.id}/edit`)
}
</script>

<template>
  <DesktopShell active="create">
    <form class="flex min-h-full flex-col" novalidate @submit.prevent="onSubmit">
      <div class="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-4 p-6">
        <div>
          <h1 class="text-[20px] font-semibold leading-7 text-[var(--mds-text)]">Tạo bài trình bày</h1>
          <p class="text-[13px] text-[var(--mds-text-secondary)]">AI đọc nội dung nguồn, chọn bố cục phù hợp cho từng trang và dựng hiệu ứng chuyển động. Bạn chỉnh sửa lại được mọi chữ và ảnh.</p>
        </div>

        <FormAlert v-if="submitError">{{ submitError.message }}</FormAlert>

        <section class="flex flex-col gap-4 rounded-lg bg-[var(--mds-bg)] p-6 shadow-[var(--mds-shadow-card)]">
          <h2 class="text-[16px] font-semibold leading-6">1. Nội dung nguồn</h2>
          <MTabs v-model="form.mode" :tabs="SOURCE_MODES" variant="pill" />

          <div v-if="form.mode === 'file'" class="flex flex-col gap-1">
            <MUpload
              :model-value="fileList"
              :accept="ACCEPT"
              :multiple="false"
              :max-size-m-b="MAX_UPLOAD_MB"
              label="Tài liệu nguồn"
              @select-files="onSelectFiles"
              @oversized="onOversized"
              @remove="clearFile"
            />
            <p class="text-[12px] text-[var(--mds-text-secondary)]">PowerPoint (.pptx), Word (.docx), PDF, văn bản (.txt, .md) hoặc ảnh — tối đa {{ MAX_UPLOAD_MB }} MB. Ảnh trong tài liệu được giữ lại để dùng trên slide.</p>
            <p v-if="errors.file" class="text-[12px] text-[var(--mds-danger)]">{{ errors.file }}</p>
          </div>

          <FormField v-else-if="form.mode === 'url'" label="Đường link tài liệu" required hint="Google Slides/Docs/Sheets/Drive (đã chia sẻ “Bất kỳ ai có đường liên kết”) hoặc trang web công khai.">
            <MInput v-model="form.url" type="url" inputmode="url" placeholder="https://docs.google.com/presentation/d/…" :error="errors.url" clearable />
          </FormField>

          <FormField v-else label="Nội dung" required :hint="`${form.text.length.toLocaleString('vi-VN')} ký tự — dán dàn ý, báo cáo, biên bản họp…`">
            <MTextarea v-model="form.text" :rows="12" placeholder="Ví dụ: Kế hoạch triển khai AMIS cho công ty… (mục tiêu, hiện trạng, giải pháp, lộ trình, chi phí)" :error="errors.text" />
          </FormField>
        </section>

        <section class="flex flex-col gap-4 rounded-lg bg-[var(--mds-bg)] p-6 shadow-[var(--mds-shadow-card)]">
          <h2 class="text-[16px] font-semibold leading-6">2. Tuỳ chọn</h2>
          <FormField label="Tỷ lệ khung hình" group>
            <RatioPicker v-model="form.ratio" />
          </FormField>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
            <FormField label="Số trang mong muốn" hint="3–40 trang">
              <MInput v-model.number="form.slideCount" type="number" inputmode="numeric" min="3" max="40" :error="errors.slideCount" />
            </FormField>
            <FormField label="Tên bài (tuỳ chọn)" hint="Để trống: lấy theo tên tệp hoặc do AI đặt">
              <MInput v-model="form.title" :error="errors.title" />
            </FormField>
          </div>
          <FormField label="Yêu cầu thêm cho AI (tuỳ chọn)" hint="Đối tượng người nghe, giọng văn, phần cần nhấn mạnh, tông màu…">
            <MTextarea v-model="form.instructions" :rows="3" :maxlength="2000" placeholder="Ví dụ: Trình bày cho ban giám đốc, ngắn gọn, nhấn mạnh hiệu quả chi phí." :error="errors.instructions" />
          </FormField>
        </section>
      </div>

      <div class="sticky bottom-0 z-10 border-t border-[var(--mds-border)] bg-[var(--mds-bg)]">
        <div class="mx-auto flex w-full max-w-[880px] items-center justify-end gap-2 px-6 py-3">
          <MButton variant="outline" @click="router.back()">Hủy</MButton>
          <MButton variant="primary" type="submit" :loading="submitting">
            <template #icon><MIcon name="send" :size="16" /></template>
            Tạo bằng AI
          </MButton>
        </div>
      </div>
    </form>
  </DesktopShell>
</template>
