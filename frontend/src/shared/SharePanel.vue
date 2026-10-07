<script setup>
// Chia sẻ bài (chỉ chủ bài) — dùng chung desktop (trong MDialog) và mobile (trong FullScreenSheet, compact).
//  - Công khai: mọi người dùng XEM được bản trình chiếu (tải và nhân bản về bài của họ) — không ai sửa được bài gốc.
//  - Mời từng người theo email: Chỉ xem / Chỉnh sửa. Người sửa lưu thẳng vào bài và handoff phiên bản; không xoá, không chia sẻ tiếp, không khôi phục.
// Chế độ công khai do trang cha thực hiện (setVisibility) vì trang đang giữ dữ liệu bài.
import { computed, onMounted, ref } from 'vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import FormAlert from '@/shared/FormAlert.vue'
import { useToast } from '@/components/mds/toast.js'
import { useSharing, SHARE_ROLE_OPTIONS } from '@/composables/useSharing.js'
import { session } from '@/lib/session.js'

const props = defineProps({
  deckId: { type: String, required: true },
  visibility: { type: String, default: 'private' },
  // async (isPublic: boolean) => void — trang cha gọi API và cập nhật bài của mình
  setVisibility: { type: Function, required: true },
  compact: { type: Boolean, default: false },
})

const toast = useToast()
const sh = useSharing(props.deckId)
const { shares, loading, error, busy } = sh
const email = ref('')
const role = ref('viewer')
const emailError = ref('')
const visBusy = ref(false)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const me = computed(() => session.user || {})
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()
const roleLabel = (r) => SHARE_ROLE_OPTIONS.find((o) => o.value === r)?.label || r

async function onVisibility(isPublic) {
  visBusy.value = true
  try {
    await props.setVisibility(isPublic)
    toast.success(isPublic ? 'Đã công khai — mọi người dùng xem được bản trình chiếu' : 'Đã tắt công khai — chỉ người được mời còn truy cập được')
  } catch (err) {
    toast.error(err.message)
  } finally {
    visBusy.value = false
  }
}

async function onInvite() {
  const e = email.value.trim()
  emailError.value = !e ? 'Nhập email người cần mời' : !EMAIL_RE.test(e) ? 'Email không hợp lệ' : ''
  if (emailError.value) return
  try {
    const res = await sh.invite(e, role.value)
    toast.success(res.created ? `Đã mời ${res.share.displayName} (${roleLabel(res.share.role)})` : `Đã đổi quyền của ${res.share.displayName} thành ${roleLabel(res.share.role)}`)
    email.value = ''
  } catch (err) {
    // Lỗi gắn với email → hiện ngay dưới ô nhập; lỗi khác → toast.
    if (['USER_NOT_FOUND', 'SELF_SHARE', 'INVALID_EMAIL'].includes(err.code)) emailError.value = err.message
    else toast.error(err.message)
  }
}

async function onRole(s, r) {
  if (r === s.role) return
  try {
    await sh.setRole(s.userId, r)
    toast.success(`${s.displayName}: ${roleLabel(r)}`)
  } catch (err) {
    toast.error(err.message)
  }
}

async function onRemove(s) {
  try {
    await sh.remove(s.userId)
    toast.success(`Đã gỡ quyền truy cập của ${s.displayName}`)
  } catch (err) {
    toast.error(err.message)
  }
}

onMounted(sh.load)
</script>

<template>
  <div class="flex flex-col gap-4" :class="compact ? 'text-[15px] leading-6' : 'text-[13px] leading-[18px]'">
    <!-- Công khai -->
    <section class="flex items-center justify-between gap-3 rounded-lg border border-[var(--mds-border)] p-3">
      <div class="flex min-w-0 items-start gap-3">
        <MIcon name="world-search" :size="compact ? 24 : 20" class="mt-0.5 shrink-0 text-[var(--mds-icon-neutral)]" />
        <div class="min-w-0">
          <p class="font-semibold">Công khai</p>
          <p class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">
            Mọi người dùng trong hệ thống <strong>chỉ xem</strong> được bản trình chiếu (có thể tải và nhân bản về bài của họ).
          </p>
        </div>
      </div>
      <MSwitch :model-value="visibility === 'public'" :disabled="visBusy" aria-label="Công khai cho mọi người dùng xem" @update:model-value="onVisibility" />
    </section>

    <!-- Mời người -->
    <section class="flex flex-col gap-2">
      <h4 class="font-semibold">Mời người</h4>
      <form class="flex gap-2" :class="compact ? 'flex-col' : 'items-start'" novalidate @submit.prevent="onInvite">
        <div class="min-w-0 flex-1">
          <MInput v-model="email" type="email" inputmode="email" autocomplete="off" enterkeyhint="send" placeholder="Email người cần mời" aria-label="Email người cần mời" :error="emailError" @update:model-value="emailError = ''">
            <template #prefix><MIcon name="mail" :size="16" /></template>
          </MInput>
        </div>
        <div class="flex gap-2">
          <div :class="compact ? 'min-w-0 flex-1' : 'w-[140px]'"><MSelect v-model="role" :options="SHARE_ROLE_OPTIONS" aria-label="Quyền của người được mời" /></div>
          <MButton type="submit" variant="primary" :loading="!!busy.invite"><template #icon><MIcon name="user-plus" :size="16" /></template>Mời</MButton>
        </div>
      </form>
      <p class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[13px] leading-[18px]' : 'text-[12px] leading-4'">Người được mời cần có tài khoản MISA Presentation đang hoạt động. Mời lại người đã có trong danh sách để đổi quyền.</p>
    </section>

    <!-- Người có quyền truy cập -->
    <section class="flex flex-col gap-1">
      <h4 class="font-semibold">Người có quyền truy cập <span v-if="!loading" class="font-normal text-[var(--mds-text-secondary)]">({{ shares.length + 1 }})</span></h4>
      <FormAlert v-if="error">
        {{ error.message }}
        <button type="button" class="ml-1 font-medium text-[var(--mds-brand-600)] hover:underline" :class="compact ? 'min-h-12' : ''" @click="sh.load()">Thử lại</button>
      </FormAlert>
      <ul class="flex flex-col" aria-label="Người có quyền truy cập">
        <li class="flex items-center gap-3 py-2">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--mds-brand-50)] text-[12px] font-semibold text-[var(--mds-brand-700)]" aria-hidden="true">{{ initials(me.displayName) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ me.displayName }} (bạn)</span>
            <span class="block truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ me.email }}</span>
          </span>
          <MTag color="brand" size="sm">Chủ bài</MTag>
        </li>
        <li v-if="loading" class="flex justify-center py-4"><MSpinner :size="24" /></li>
        <li v-for="s in shares" :key="s.userId" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--mds-border-light)] py-2">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--mds-bg-hover-soft)] text-[12px] font-semibold text-[var(--mds-text-secondary)]" aria-hidden="true">{{ initials(s.displayName) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ s.displayName }}</span>
            <span class="block truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ s.email }}</span>
          </span>
          <MTag v-if="!s.active" color="warning" size="sm">Tài khoản đã khoá</MTag>
          <div class="flex items-center gap-1" :class="compact ? 'w-full pl-12' : ''">
            <div :class="compact ? 'min-w-0 flex-1' : 'w-[132px]'">
              <MSelect :model-value="s.role" :options="SHARE_ROLE_OPTIONS" :disabled="!!busy[s.userId]" :aria-label="`Quyền của ${s.displayName}`" @update:model-value="(r) => onRole(s, r)" />
            </div>
            <MSpinner v-if="busy[s.userId]" :size="16" class="mx-2" />
            <MButton v-else variant="icon" :aria-label="`Gỡ quyền truy cập của ${s.displayName}`" :title="`Gỡ quyền truy cập của ${s.displayName}`" @click="onRemove(s)">
              <template #icon><MIcon name="x" :size="compact ? 24 : 16" /></template>
            </MButton>
          </div>
        </li>
      </ul>
      <p v-if="!loading && !shares.length && !error" class="text-[var(--mds-text-secondary)]">Chưa mời ai. {{ visibility === 'public' ? 'Bài đang công khai — mọi người chỉ xem được.' : 'Bài đang riêng tư — chỉ bạn truy cập được.' }}</p>
    </section>

    <FormAlert tone="info">
      <strong>Chỉnh sửa</strong>: sửa nội dung, thêm ảnh/video và <strong>handoff</strong> bản thấy ổn (tối đa 5 bản). Chỉ chủ bài được xoá bài, chia sẻ và khôi phục phiên bản.
      Lần đầu chia sẻ, hệ thống giữ <strong>bản gốc</strong> để khôi phục khi cần.
    </FormAlert>
  </div>
</template>
