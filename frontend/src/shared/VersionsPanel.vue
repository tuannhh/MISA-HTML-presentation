<script setup>
// Phiên bản của bài — dùng chung desktop (trong MDrawer) và mobile (trong FullScreenSheet, compact).
//  - Chủ bài + người được mời sửa: HANDOFF bản đang lưu mà họ thấy ổn (tối đa 5 bản; đủ thì xoá bớt), xem lại từng bản, xoá bản của mình.
//  - Chỉ chủ bài khôi phục: chọn 1 bản handoff; không chọn → mặc định về BẢN GỐC (lúc chủ bài chia sẻ lần đầu).
// Xác nhận khôi phục/xoá ngay trong panel (không mở dialog chồng lên drawer/màn con).
import { computed, onMounted, ref, watch } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import FormAlert from '@/shared/FormAlert.vue'
import { useToast } from '@/components/mds/toast.js'
import { useVersions } from '@/composables/useVersions.js'
import { formatDateTime, ratioCss } from '@/lib/format.js'

const props = defineProps({
  deckId: { type: String, required: true },
  specVersion: { type: Number, required: true }, // bản đang lưu mà người dùng nhìn thấy
  dirty: { type: Boolean, default: false }, // có thay đổi chưa lưu trong trình soạn thảo
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['restored'])

const toast = useToast()
const v = useVersions(props.deckId)
const { items, handoffs, max, canRestore, loading, error, busy, baseline, full } = v
const NOTE_MAX = 200
const note = ref('')
const choice = ref('') // id bản sẽ khôi phục — mặc định bản gốc
const previewId = ref('')
const confirming = ref(false)
const confirmDelete = ref('')

const isCurrent = (x) => x.specVersion === props.specVersion
const label = (x) => (x.kind === 'baseline' ? 'Bản gốc' : `Handoff ${formatDateTime(x.createdAt)}`)
const chosen = computed(() => items.value.find((x) => x.id === choice.value) || null)
const previewing = computed(() => items.value.find((x) => x.id === previewId.value) || null)

// Lý do chưa handoff được (hiện ngay dưới nút thay vì để người dùng bấm rồi mới báo lỗi).
const handoffBlock = computed(() => {
  if (props.dirty) return 'Lưu thay đổi trước — handoff chụp đúng bản đã lưu.'
  if (items.value.some((x) => x.kind === 'handoff' && isCurrent(x))) return 'Bản đang lưu đã được handoff.'
  if (full.value) return `Đã đủ ${max.value} bản handoff — xoá bớt một bản để handoff bản mới.`
  return ''
})
const restoreBlock = computed(() => {
  if (!chosen.value) return baseline.value ? '' : 'Bài chưa có bản gốc (chưa từng chia sẻ) — chọn một bản handoff để khôi phục.'
  if (isCurrent(chosen.value) && !props.dirty) return 'Bài đang ở đúng bản này.'
  return ''
})

// Danh sách đổi (tải lần đầu, xoá bản) → giữ lựa chọn hợp lệ; mặc định bản gốc.
watch(items, (list) => {
  if (!list.some((x) => x.id === choice.value)) choice.value = baseline.value?.id || ''
  if (previewId.value && !list.some((x) => x.id === previewId.value)) previewId.value = ''
})

async function onHandoff() {
  if (handoffBlock.value) return
  try {
    await v.handoff(props.specVersion, note.value.trim())
    note.value = ''
    toast.success(`Đã handoff bản đang lưu (${handoffs.value}/${max.value})`)
  } catch (err) {
    toast.error(err.message)
    if (err.status === 409) v.load()
  }
}

async function onDelete(x) {
  confirmDelete.value = ''
  try {
    await v.remove(x.id)
    toast.success('Đã xoá bản handoff')
  } catch (err) {
    toast.error(err.message)
  }
}

async function onRestore() {
  confirming.value = false
  const target = chosen.value
  try {
    // Bản gốc → gửi không kèm versionId: máy chủ tự lấy bản gốc (luật mặc định).
    const deck = await v.restore(target && target.kind === 'handoff' ? target.id : null, props.specVersion)
    toast.success(`Đã khôi phục bài về ${target ? label(target).toLowerCase() : 'bản gốc'}`)
    emit('restored', deck)
  } catch (err) {
    toast.error(err.message)
    if (err.status === 409) v.load()
  }
}

onMounted(v.load)
</script>

<template>
  <div class="flex flex-col gap-4" :class="compact ? 'text-[15px] leading-6' : 'text-[13px] leading-[18px]'">
    <FormAlert tone="info">
      <strong>Handoff</strong> = chốt bản đã lưu mà bạn thấy ổn (tối đa {{ max }} bản). Chủ bài khôi phục bài về một bản handoff; nếu không chọn, bài được khôi phục về <strong>bản gốc</strong> — bản lúc chủ bài chia sẻ lần đầu.
    </FormAlert>

    <!-- Handoff bản đang lưu -->
    <section class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
      <div class="flex items-center justify-between gap-2">
        <h4 class="font-semibold">Handoff bản đang lưu</h4>
        <MTag :color="full ? 'warning' : 'neutral'" size="sm">{{ handoffs }}/{{ max }} bản</MTag>
      </div>
      <MTextarea v-model="note" :rows="2" :maxlength="NOTE_MAX" placeholder="Ghi chú (không bắt buộc) — vd: Bản đã duyệt nội dung" aria-label="Ghi chú cho bản handoff" :disabled="!!handoffBlock" />
      <div class="flex items-center justify-end gap-2" :class="compact ? 'flex-col items-stretch' : ''">
        <p v-if="handoffBlock" class="mr-auto text-[var(--mds-warning)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">{{ handoffBlock }}</p>
        <MButton variant="primary" :loading="busy === 'handoff'" :disabled="!!handoffBlock || loading" @click="onHandoff">
          <template #icon><MIcon name="flag" :size="16" /></template>Handoff
        </MButton>
      </div>
    </section>

    <!-- Xem lại 1 phiên bản -->
    <section v-if="previewing" class="flex flex-col gap-2" aria-live="polite">
      <div class="flex items-center justify-between gap-2">
        <h4 class="min-w-0 truncate font-semibold">Xem lại: {{ label(previewing) }}</h4>
        <MButton variant="icon" aria-label="Đóng xem lại" @click="previewId = ''"><template #icon><MIcon name="x" :size="compact ? 24 : 16" /></template></MButton>
      </div>
      <div class="relative w-full overflow-hidden rounded-lg bg-[#05070F]" :style="{ aspectRatio: ratioCss(previewing.ratio) }">
        <iframe :key="previewing.id" :src="v.previewUrl(previewing.id)" :title="`Xem lại ${label(previewing)}`" sandbox="allow-scripts allow-popups" class="absolute inset-0 h-full w-full border-0" />
      </div>
      <p class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">Bấm vào khung rồi dùng phím mũi tên (hoặc vuốt) để xem các trang.</p>
    </section>

    <!-- Danh sách phiên bản -->
    <section class="flex flex-col gap-2">
      <h4 class="font-semibold">Phiên bản <span v-if="!loading" class="font-normal text-[var(--mds-text-secondary)]">({{ items.length }})</span></h4>
      <FormAlert v-if="error">
        {{ error.message }}
        <button type="button" class="ml-1 font-medium text-[var(--mds-brand-600)] hover:underline" :class="compact ? 'min-h-12' : ''" @click="v.load()">Thử lại</button>
      </FormAlert>
      <div v-if="loading && !items.length" class="flex justify-center py-6"><MSpinner :size="24" /></div>
      <p v-else-if="!items.length && !error" class="text-[var(--mds-text-secondary)]">
        Chưa có phiên bản nào. Bản gốc được tạo tự động khi chủ bài chia sẻ lần đầu (mời người hoặc bật công khai).
      </p>

      <div v-else :role="canRestore ? 'radiogroup' : 'list'" :aria-label="canRestore ? 'Chọn bản để khôi phục' : 'Danh sách phiên bản'" class="flex flex-col gap-2">
        <div
          v-for="x in items"
          :key="x.id"
          :role="canRestore ? undefined : 'listitem'"
          class="rounded-lg border p-3 transition-colors"
          :class="canRestore && choice === x.id ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)]'"
        >
          <div class="flex items-start gap-3">
            <!-- Chủ bài: chọn bản để khôi phục (radio thật ẩn để giữ bàn phím + trình đọc màn hình) -->
            <label v-if="canRestore" class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]">
              <input v-model="choice" type="radio" class="sr-only" name="restore-version" :value="x.id" />
              <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-[var(--mds-bg)]" :class="choice === x.id ? 'border-[var(--mds-brand-600)]' : 'border-[var(--mds-border)]'" aria-hidden="true">
                <span v-if="choice === x.id" class="h-2 w-2 rounded-full bg-[var(--mds-brand-600)]" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1">
                  <span class="font-semibold">{{ x.kind === 'baseline' ? 'Bản gốc' : 'Handoff' }}</span>
                  <MTag v-if="x.kind === 'baseline'" color="brand" size="sm">Mặc định khi khôi phục</MTag>
                  <MTag v-if="isCurrent(x)" color="success" size="sm">Đang dùng</MTag>
                </span>
                <span class="block text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">{{ x.createdBy?.name || 'Người dùng đã xoá' }} · {{ formatDateTime(x.createdAt) }} · {{ x.slideCount }} trang</span>
                <span v-if="x.note" class="mt-1 block break-words">“{{ x.note }}”</span>
              </span>
            </label>
            <div v-else class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-1">
                <span class="font-semibold">{{ x.kind === 'baseline' ? 'Bản gốc' : 'Handoff' }}</span>
                <MTag v-if="isCurrent(x)" color="success" size="sm">Đang dùng</MTag>
              </span>
              <span class="block text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">{{ x.createdBy?.name || 'Người dùng đã xoá' }} · {{ formatDateTime(x.createdAt) }} · {{ x.slideCount }} trang</span>
              <span v-if="x.note" class="mt-1 block break-words">“{{ x.note }}”</span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <MButton variant="icon" :aria-label="`Xem lại ${label(x)}`" :title="`Xem lại ${label(x)}`" :aria-pressed="previewId === x.id" @click="previewId = previewId === x.id ? '' : x.id">
                <template #icon><MIcon name="eye" :size="compact ? 24 : 16" /></template>
              </MButton>
              <MSpinner v-if="busy === x.id" :size="16" class="mx-2" />
              <MButton v-else-if="x.canDelete" variant="icon" :aria-label="`Xoá ${label(x)}`" :title="`Xoá ${label(x)}`" @click="confirmDelete = x.id">
                <template #icon><MIcon name="trash" :size="compact ? 24 : 16" /></template>
              </MButton>
            </div>
          </div>
          <!-- Xác nhận xoá ngay trong thẻ -->
          <div v-if="confirmDelete === x.id" class="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--mds-border-light)] pt-2">
            <span class="mr-auto text-[var(--mds-danger)]">Xoá bản handoff này? Không thể hoàn tác.</span>
            <MButton variant="outline" @click="confirmDelete = ''">Hủy</MButton>
            <MButton variant="danger" @click="onDelete(x)">Xoá</MButton>
          </div>
        </div>
      </div>
      <p v-if="!canRestore && items.length" class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">Chỉ chủ bài được khôi phục phiên bản. Bạn có thể xoá bản handoff do chính mình tạo.</p>
    </section>

    <!-- Khôi phục (chủ bài) -->
    <section v-if="canRestore && items.length" class="flex flex-col gap-2 rounded-lg border p-3" :class="confirming ? 'border-[var(--mds-warning)] bg-[var(--mds-warning-soft)]' : 'border-[var(--mds-border)]'">
      <template v-if="!confirming">
        <p>
          Khôi phục bài về: <strong>{{ chosen ? label(chosen) : 'Bản gốc' }}</strong>
          <span v-if="chosen?.kind === 'baseline'" class="text-[var(--mds-text-secondary)]"> (mặc định)</span>
        </p>
        <div class="flex items-center justify-end gap-2" :class="compact ? 'flex-col items-stretch' : ''">
          <p v-if="restoreBlock" class="mr-auto text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">{{ restoreBlock }}</p>
          <MButton variant="outline" :disabled="!!restoreBlock || loading" @click="confirming = true"><template #icon><MIcon name="restore" :size="16" /></template>Khôi phục…</MButton>
        </div>
      </template>
      <template v-else>
        <p class="font-semibold">Khôi phục bài về {{ chosen ? label(chosen).toLowerCase() : 'bản gốc' }}?</p>
        <p>
          Nội dung hiện tại sẽ được thay bằng bản đã chọn<template v-if="chosen"> ({{ chosen.slideCount }} trang)</template>; mọi người được chia sẻ thấy ngay bản khôi phục.
          <template v-if="dirty"> <strong>Thay đổi chưa lưu của bạn cũng sẽ bị bỏ.</strong></template>
        </p>
        <p class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">Muốn giữ bản hiện tại để quay lại sau? Hãy handoff nó trước khi khôi phục.</p>
        <div class="flex items-center justify-end gap-2" :class="compact ? 'flex-col-reverse items-stretch' : ''">
          <MButton variant="outline" @click="confirming = false">Hủy</MButton>
          <MButton variant="primary" :loading="busy === 'restore'" @click="onRestore">Khôi phục</MButton>
        </div>
      </template>
    </section>
  </div>
</template>
