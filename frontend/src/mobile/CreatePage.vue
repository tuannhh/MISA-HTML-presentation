<script setup>
// Tạo bài (mobile): form một cột, footer sticky Hủy | Tạo bằng AI.
import { useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import RatioPicker from '@/shared/RatioPicker.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MUpload from '@/components/mds/MUpload.vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MButton from '@/components/mds/MButton.vue'
import { useCreate, SOURCE_MODES, ACCEPT, MAX_UPLOAD_MB } from '@/composables/useCreate.js'

const router = useRouter()
const { form, errors, submitting, submitError, submit, fileList, onSelectFiles, onOversized, clearFile } = useCreate()
const SHORT = { file: 'Tệp', url: 'Link', text: 'Văn bản' }
const MODES = SOURCE_MODES.map((m) => ({ ...m, label: SHORT[m.key] }))

async function onSubmit() {
  const res = await submit()
  if (res) router.push(`/p/${res.id}/edit`)
}
</script>

<template>
  <MobileShell title="Tạo bài trình bày" back="/decks">
    <form id="create-form" class="flex flex-col gap-4 bg-[var(--mds-bg)] p-4" novalidate @submit.prevent="onSubmit">
      <FormAlert v-if="submitError">{{ submitError.message }}</FormAlert>
      <h2 class="text-[16px] font-semibold leading-6">Nội dung nguồn</h2>
      <MTabs v-model="form.mode" :tabs="MODES" variant="pill" />

      <div v-if="form.mode === 'file'" class="flex flex-col gap-1">
        <MUpload :model-value="fileList" :accept="ACCEPT" :multiple="false" :max-size-m-b="MAX_UPLOAD_MB" label="Tài liệu nguồn" @select-files="onSelectFiles" @oversized="onOversized" @remove="clearFile" />
        <p class="text-[13px] text-[var(--mds-text-secondary)]">.pptx, .docx, PDF, .txt, .md hoặc ảnh — tối đa {{ MAX_UPLOAD_MB }} MB.</p>
        <p v-if="errors.file" class="text-[13px] text-[var(--mds-danger)]">{{ errors.file }}</p>
      </div>
      <FormField v-else-if="form.mode === 'url'" label="Đường link tài liệu" required hint="Google Slides/Docs/Drive đã chia sẻ công khai hoặc trang web.">
        <MInput v-model="form.url" type="url" inputmode="url" enterkeyhint="next" placeholder="https://…" :error="errors.url" clearable />
      </FormField>
      <FormField v-else label="Nội dung" required :hint="`${form.text.length.toLocaleString('vi-VN')} ký tự`">
        <MTextarea v-model="form.text" :rows="8" placeholder="Dán dàn ý, báo cáo, biên bản họp…" :error="errors.text" />
      </FormField>

      <hr class="border-[var(--mds-border-light)]" />
      <h2 class="text-[16px] font-semibold leading-6">Tuỳ chọn</h2>
      <FormField label="Tỷ lệ khung hình" group>
        <RatioPicker v-model="form.ratio" compact name="ratio-m" />
      </FormField>
      <FormField label="Số trang mong muốn" hint="3–40 trang">
        <MInput v-model.number="form.slideCount" type="number" inputmode="numeric" min="3" max="40" :error="errors.slideCount" />
      </FormField>
      <FormField label="Tên bài (tuỳ chọn)">
        <MInput v-model="form.title" :error="errors.title" />
      </FormField>
      <FormField label="Yêu cầu thêm cho AI (tuỳ chọn)">
        <MTextarea v-model="form.instructions" :rows="3" :maxlength="2000" placeholder="Đối tượng người nghe, giọng văn…" :error="errors.instructions" />
      </FormField>
    </form>
    <template #footer>
      <div class="flex gap-2">
        <MButton variant="outline" class="flex-1" @click="router.push('/decks')">Hủy</MButton>
        <MButton variant="primary" type="submit" form="create-form" class="flex-1" :loading="submitting">Tạo bằng AI</MButton>
      </div>
    </template>
  </MobileShell>
</template>
