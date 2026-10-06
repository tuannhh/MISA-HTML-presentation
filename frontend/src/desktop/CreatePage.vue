<script setup>
import { deckPath } from '@/lib/deckPath.js'
// Tạo bài trình bày (desktop): nguồn nội dung → tuỳ chọn (tỷ lệ, tông màu, số trang) → AI lập dàn ý (chạy nền);
// chuyển sang bước duyệt dàn ý để theo dõi tiến trình, sửa nội dung, gắn media, chọn thiết kế.
import { useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import RatioPicker from '@/shared/RatioPicker.vue'
import MCheckbox from '@/components/mds/MCheckbox.vue'
import ThemePicker from '@/shared/ThemePicker.vue'
import MRadioGroup from '@/components/mds/MRadioGroup.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MUpload from '@/components/mds/MUpload.vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import CreateMediaPicker from '@/shared/CreateMediaPicker.vue'
import { useCreate, SOURCE_MODES, SLIDE_MODES, ACCEPT, MEDIA_ACCEPT, MAX_CREATE_MEDIA, MAX_UPLOAD_MB, MAX_UPLOAD_FILES, AUTO_MAX_SLIDES, formatMb } from '@/composables/useCreate.js'

const router = useRouter()
const { form, errors, submitting, progress, submitError, totalBytes, submit, fileList, onSelectFiles, onOversized, removeFile, mediaSummary, addingMedia, addMedia, removeMedia } = useCreate()

async function onSubmit() {
  const res = await submit()
  if (res) router.push(deckPath(res, 'outline'))
}
</script>

<template>
  <DesktopShell active="create">
    <form class="flex min-h-full flex-col" novalidate @submit.prevent="onSubmit">
      <div class="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-4 p-6">
        <div>
          <h1 class="text-[20px] font-semibold leading-7 text-[var(--mds-text)]">Tạo bài trình bày</h1>
          <p class="text-[13px] text-[var(--mds-text-secondary)]">AI đọc nội dung nguồn và lập dàn ý từng trang. Bạn duyệt lại nội dung, gắn ảnh/video, chọn màu – nền – phông – logo, rồi AI mới dựng bài có hiệu ứng chuyển động.</p>
        </div>

        <FormAlert v-if="submitError">{{ submitError.message }}</FormAlert>

        <section class="flex flex-col gap-4 rounded-lg bg-[var(--mds-bg)] p-6 shadow-[var(--mds-shadow-card)]">
          <h2 class="text-[16px] font-semibold leading-6">1. Nội dung nguồn</h2>
          <MTabs v-model="form.mode" :tabs="SOURCE_MODES" variant="pill" />

          <div v-if="form.mode === 'file'" class="flex flex-col gap-1">
            <MUpload
              block
              :model-value="fileList"
              :accept="ACCEPT"
              multiple
              :disabled="submitting"
              :max-size-m-b="MAX_UPLOAD_MB"
              :size-hint="`Tổng tối đa ${MAX_UPLOAD_MB}MB · tối đa ${MAX_UPLOAD_FILES} tệp`"
              hint="Chọn được nhiều tệp cùng lúc: tài liệu, bảng tính, PDF scan, ảnh, ghi âm"
              label="Tư liệu nguồn"
              @select-files="onSelectFiles"
              @oversized="onOversized"
              @remove="removeFile"
            />
            <p v-if="form.files.length" class="text-[12px] text-[var(--mds-text-secondary)]">
              {{ form.files.length }} tệp · {{ formatMb(totalBytes) }} / {{ MAX_UPLOAD_MB }} MB
            </p>
            <p class="text-[12px] text-[var(--mds-text-secondary)]">
              PowerPoint (.pptx), Word (.docx), Excel (.xlsx) / CSV, PDF (kể cả bản scan — AI tự nhận dạng chữ), văn bản (.txt, .md), ảnh (AI đọc cả chữ trong ảnh; ảnh HEIC tự đổi sang JPEG) hoặc ghi âm MP3/M4A/WAV/OGG/FLAC/AAC/WebM. Tư liệu thô (ghi chú, bảng số liệu, biên bản) được AI phân tích và thiết kế lại; ảnh chụp thật trong tài liệu được giữ để đặt lên slide.
            </p>
            <p v-if="errors.file" class="text-[12px] text-[var(--mds-danger)]">{{ errors.file }}</p>
          </div>

          <FormField v-else-if="form.mode === 'url'" label="Đường link tài liệu" required hint="Google Slides/Docs/Sheets/Drive (đã chia sẻ “Bất kỳ ai có đường liên kết”) hoặc trang web công khai.">
            <MInput v-model="form.url" type="url" inputmode="url" placeholder="https://docs.google.com/presentation/d/…" :error="errors.url" clearable />
          </FormField>

          <template v-else>
            <FormField label="Nội dung" required :hint="`${form.text.length.toLocaleString('vi-VN')} ký tự — dán dàn ý, báo cáo, biên bản họp… AI dùng làm cơ sở để viết từng trang.`">
              <MTextarea v-model="form.text" :rows="12" placeholder="Ví dụ: Kế hoạch triển khai AMIS cho công ty… (mục tiêu, hiện trạng, giải pháp, lộ trình, chi phí)" :error="errors.text" />
            </FormField>
            <CreateMediaPicker
              :items="form.media"
              :accept="MEDIA_ACCEPT"
              :max="MAX_CREATE_MEDIA"
              :summary="mediaSummary"
              :busy="addingMedia > 0"
              :disabled="submitting"
              :error="errors.media"
              @add="addMedia"
              @remove="removeMedia"
            />
          </template>
        </section>

        <section class="flex flex-col gap-4 rounded-lg bg-[var(--mds-bg)] p-6 shadow-[var(--mds-shadow-card)]">
          <h2 class="text-[16px] font-semibold leading-6">2. Tuỳ chọn</h2>
          <FormField label="Tỷ lệ khung hình" group>
            <RatioPicker v-model="form.ratio" />
          </FormField>
          <FormField label="Tông màu" group hint="Gợi ý bảng màu theo nền tối/sáng; Tuỳ chỉnh tự đảm bảo chữ đủ tương phản. Đổi lại được ở bước duyệt dàn ý.">
            <ThemePicker v-model:tone="form.tone" v-model:theme="form.theme" v-model:primary="form.primary" v-model:secondary="form.secondary" allow-auto />
            <p v-if="errors.theme" class="text-[12px] text-[var(--mds-danger)]">{{ errors.theme }}</p>
          </FormField>
          <FormField label="Ảnh minh hoạ AI" group hint="Chỉ thêm ảnh cho trang cần minh hoạ mà chưa có ảnh/ảnh chụp giao diện của bạn (tối đa 6 ảnh, ~10–30 giây mỗi ảnh). Đổi/chỉnh sửa được ở trình soạn thảo.">
            <MCheckbox v-model="form.aiImages" label="AI tạo ảnh minh hoạ phù hợp nội dung (Nano Banana 2 Lite)" input-aria-label="AI tạo ảnh minh hoạ phù hợp nội dung" />
          </FormField>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              label="Số trang mong muốn"
              group
              :hint="form.slideMode === 'auto' ? `AI chọn theo lượng nội dung, tối đa ${AUTO_MAX_SLIDES} trang` : 'Từ 3 đến 40 trang, kể cả trang bìa và trang kết'"
            >
              <div class="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
                <MRadioGroup v-model="form.slideMode" :options="SLIDE_MODES" />
                <div v-if="form.slideMode === 'custom'" class="w-[96px]">
                  <MInput v-model.number="form.slideCount" type="number" inputmode="numeric" min="3" max="40" aria-label="Số trang" :error="errors.slideCount" />
                </div>
              </div>
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
          <span v-if="progress !== null" class="mr-auto text-[13px] text-[var(--mds-text-secondary)]" role="status">
            {{ progress < 100 ? `Đang tải ${form.mode === 'text' ? 'ảnh, video' : 'tư liệu'} lên… ${progress}%` : 'Đã tải lên, đang khởi tạo…' }}
          </span>
          <MButton variant="outline" @click="router.back()">Hủy</MButton>
          <MButton variant="primary" type="submit" :loading="submitting">
            <template #icon><MIcon name="send" :size="16" /></template>
            Lập dàn ý bằng AI
          </MButton>
        </div>
      </div>
    </form>
  </DesktopShell>
</template>
