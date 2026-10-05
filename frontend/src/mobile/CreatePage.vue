<script setup>
// Tạo bài (mobile): form một cột, footer sticky Hủy | Lập dàn ý bằng AI.
// AI lập dàn ý chạy nền → chuyển sang bước duyệt dàn ý để theo dõi tiến trình, sửa nội dung, gắn media, chọn thiết kế.
import { useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import RatioPicker from '@/shared/RatioPicker.vue'
import ThemePicker from '@/shared/ThemePicker.vue'
import MRadioGroup from '@/components/mds/MRadioGroup.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MUpload from '@/components/mds/MUpload.vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MButton from '@/components/mds/MButton.vue'
import CreateMediaPicker from '@/shared/CreateMediaPicker.vue'
import { useCreate, SOURCE_MODES, SLIDE_MODES, ACCEPT, MEDIA_ACCEPT, MAX_CREATE_MEDIA, MAX_UPLOAD_MB, MAX_UPLOAD_FILES, AUTO_MAX_SLIDES, formatMb } from '@/composables/useCreate.js'

const router = useRouter()
const { form, errors, submitting, progress, submitError, totalBytes, submit, fileList, onSelectFiles, onOversized, removeFile, mediaSummary, addingMedia, addMedia, removeMedia } = useCreate()
const SLIDE_MODES_M = SLIDE_MODES.map((m) => ({ ...m, label: m.value === 'auto' ? 'Tự động' : m.label }))
const SHORT = { file: 'Tệp', url: 'Link', text: 'Văn bản' }
const MODES = SOURCE_MODES.map((m) => ({ ...m, label: SHORT[m.key] }))

async function onSubmit() {
  const res = await submit()
  if (res) router.push(`/p/${res.id}/outline`)
}
</script>

<template>
  <MobileShell title="Tạo bài trình bày" back="/decks">
    <form id="create-form" class="flex flex-col gap-4 bg-[var(--mds-bg)] p-4" novalidate @submit.prevent="onSubmit">
      <p class="text-[14px] leading-5 text-[var(--mds-text-secondary)]">AI đọc nội dung nguồn và lập dàn ý từng trang. Bạn duyệt lại nội dung, gắn ảnh/video, chọn màu – nền – phông – logo, rồi AI mới dựng bài có hiệu ứng chuyển động.</p>
      <FormAlert v-if="submitError">{{ submitError.message }}</FormAlert>
      <h2 class="text-[16px] font-semibold leading-6">Nội dung nguồn</h2>
      <MTabs v-model="form.mode" :tabs="MODES" variant="pill" />

      <div v-if="form.mode === 'file'" class="flex flex-col gap-1">
        <MUpload
          block
          :model-value="fileList"
          :accept="ACCEPT"
          multiple
          :disabled="submitting"
          :max-size-m-b="MAX_UPLOAD_MB"
          :size-hint="`Tổng ≤ ${MAX_UPLOAD_MB}MB`"
          hint="Tài liệu, bảng tính, PDF scan, ảnh, ghi âm"
          label="Tư liệu nguồn"
          @select-files="onSelectFiles"
          @oversized="onOversized"
          @remove="removeFile"
        />
        <p v-if="form.files.length" class="text-[13px] text-[var(--mds-text-secondary)]">{{ form.files.length }} tệp · {{ formatMb(totalBytes) }} / {{ MAX_UPLOAD_MB }} MB</p>
        <p class="text-[13px] text-[var(--mds-text-secondary)]">.pptx, .docx, .xlsx, .csv, PDF (cả bản scan), .txt, .md, ảnh (cả HEIC) hoặc ghi âm (mp3, m4a, wav…) — tối đa {{ MAX_UPLOAD_FILES }} tệp. Tư liệu thô cũng được — AI tự phân tích và thiết kế lại.</p>
        <p v-if="errors.file" class="text-[13px] text-[var(--mds-danger)]">{{ errors.file }}</p>
      </div>
      <FormField v-else-if="form.mode === 'url'" label="Đường link tài liệu" required hint="Google Slides/Docs/Drive đã chia sẻ công khai hoặc trang web.">
        <MInput v-model="form.url" type="url" inputmode="url" enterkeyhint="next" placeholder="https://…" :error="errors.url" clearable />
      </FormField>
      <template v-else>
        <FormField label="Nội dung" required :hint="`${form.text.length.toLocaleString('vi-VN')} ký tự · AI dùng làm cơ sở viết bài`">
          <MTextarea v-model="form.text" :rows="8" placeholder="Dán dàn ý, báo cáo, biên bản họp…" :error="errors.text" />
        </FormField>
        <CreateMediaPicker
          :items="form.media"
          :accept="MEDIA_ACCEPT"
          :max="MAX_CREATE_MEDIA"
          :summary="mediaSummary"
          :busy="addingMedia > 0"
          :disabled="submitting"
          :error="errors.media"
          touch
          @add="addMedia"
          @remove="removeMedia"
        />
      </template>

      <hr class="border-[var(--mds-border-light)]" />
      <h2 class="text-[16px] font-semibold leading-6">Tuỳ chọn</h2>
      <FormField label="Tỷ lệ khung hình" group>
        <RatioPicker v-model="form.ratio" compact name="ratio-m" />
      </FormField>
      <FormField label="Tông màu" group hint="Đổi lại được ở bước duyệt dàn ý.">
        <ThemePicker v-model:tone="form.tone" v-model:theme="form.theme" v-model:primary="form.primary" v-model:secondary="form.secondary" name="theme-m" compact allow-auto />
        <p v-if="errors.theme" class="text-[13px] text-[var(--mds-danger)]">{{ errors.theme }}</p>
      </FormField>
      <FormField label="Số trang mong muốn" group :hint="form.slideMode === 'auto' ? `AI tự chọn, tối đa ${AUTO_MAX_SLIDES} trang` : '3–40 trang'">
        <div class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
          <MRadioGroup v-model="form.slideMode" :options="SLIDE_MODES_M" />
          <div v-if="form.slideMode === 'custom'" class="w-[96px]">
            <MInput v-model.number="form.slideCount" type="number" inputmode="numeric" min="3" max="40" aria-label="Số trang" :error="errors.slideCount" />
          </div>
        </div>
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
        <MButton variant="primary" type="submit" form="create-form" class="flex-1" :loading="submitting">Lập dàn ý bằng AI</MButton>
      </div>
      <p v-if="progress !== null" class="mt-2 text-center text-[13px] text-[var(--mds-text-secondary)]" role="status">
        {{ progress < 100 ? `Đang tải ${form.mode === 'text' ? 'ảnh, video' : 'tư liệu'} lên… ${progress}%` : 'Đã tải lên, đang khởi tạo…' }}
      </p>
    </template>
  </MobileShell>
</template>
