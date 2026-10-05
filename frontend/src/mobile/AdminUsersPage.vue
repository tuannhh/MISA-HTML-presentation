<script setup>
// Quản trị người dùng (mobile, cùng quyền với desktop): list row, tìm kiếm, thao tác qua bottom sheet, thêm tài khoản ở footer.
import { computed, onMounted, ref } from 'vue'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import TempPasswordBox from '@/shared/TempPasswordBox.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import { useToast } from '@/components/mds/toast.js'
import { useAdminUsers, ROLE_LABEL, ROLE_OPTIONS, STATUS_LABEL, emptyNewUser, validateNewUser } from '@/composables/useAdminUsers.js'
import { session } from '@/lib/session.js'
import { relativeTime } from '@/lib/format.js'

const toast = useToast()
const admin = useAdminUsers()
const { rows, page, hasNext, loading, error, busy } = admin

const sheetFor = ref(null)
const sheetOpen = computed({ get: () => !!sheetFor.value, set: (v) => !v && (sheetFor.value = null) })
const sheetItems = computed(() => {
  const u = sheetFor.value
  if (!u) return []
  const self = u.id === session.user?.id
  return [
    u.role === 'admin' ? { key: 'to-user', label: 'Chuyển thành Người dùng', icon: 'user', disabled: self } : { key: 'to-admin', label: 'Cấp quyền Quản trị', icon: 'users' },
    u.status === 'active' ? { key: 'disable', label: 'Khóa tài khoản', icon: 'lock', danger: true, disabled: self } : { key: 'enable', label: 'Mở khóa tài khoản', icon: 'lock-open' },
    { key: 'reset', label: 'Đặt lại mật khẩu', icon: 'refresh' },
  ]
})

const confirm = ref(null)
const temp = ref(null)

async function onSheet(key) {
  const u = sheetFor.value
  if (!u) return
  if (key === 'disable' || key === 'reset') return (confirm.value = { user: u, key })
  try {
    if (key === 'enable') await admin.update(u, { status: 'active' })
    if (key === 'to-admin') await admin.update(u, { role: 'admin' })
    if (key === 'to-user') await admin.update(u, { role: 'user' })
    toast.success('Đã cập nhật tài khoản')
  } catch (err) {
    toast.error(err.message)
  }
}
async function doConfirm() {
  const { user: u, key } = confirm.value
  confirm.value = null
  try {
    if (key === 'disable') {
      await admin.update(u, { status: 'disabled' })
      toast.success('Đã khóa tài khoản')
    } else {
      const res = await admin.resetPassword(u)
      temp.value = { email: u.email, password: res.temporaryPassword }
    }
  } catch (err) {
    toast.error(err.message)
  }
}

const createOpen = ref(false)
const nu = emptyNewUser()
const nuErrors = ref({})
const nuError = ref('')
const creating = ref(false)
function openCreate() {
  Object.assign(nu, { email: '', displayName: '', role: 'user' })
  nuErrors.value = {}
  nuError.value = ''
  createOpen.value = true
}
async function doCreate() {
  nuErrors.value = validateNewUser(nu)
  nuError.value = ''
  if (Object.keys(nuErrors.value).length) return
  creating.value = true
  try {
    const res = await admin.create({ email: nu.email.trim(), displayName: nu.displayName.trim(), role: nu.role })
    createOpen.value = false
    temp.value = { email: res.user.email, password: res.temporaryPassword }
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') nuErrors.value = { email: err.message }
    else nuError.value = err.message
  } finally {
    creating.value = false
  }
}
const goPage = (p) => {
  admin.page.value = p
  admin.load()
}

onMounted(admin.load)
</script>

<template>
  <MobileShell title="Quản trị người dùng" back="/account">
    <div class="sticky top-0 z-10 bg-[var(--mds-bg)] px-4 py-2">
      <MInput :model-value="admin.q.value" type="search" enterkeyhint="search" placeholder="Tìm theo tên hoặc email" clearable aria-label="Tìm người dùng" @update:model-value="admin.search">
        <template #prefix><MIcon name="search" :size="16" /></template>
      </MInput>
    </div>
    <div v-if="error" class="p-4"><FormAlert>{{ error.message }}</FormAlert></div>
    <div v-if="loading && !rows.length" class="flex justify-center py-16"><MSpinner :size="32" /></div>
    <div v-else-if="!rows.length" class="px-4 py-10"><MEmptyState type="no-result" title="Không có người dùng phù hợp" /></div>
    <ul v-else class="bg-[var(--mds-bg)]" aria-label="Danh sách người dùng">
      <li v-for="u in rows" :key="u.id">
        <button type="button" class="flex min-h-[72px] w-full items-center gap-3 border-b border-[var(--mds-border-light)] px-4 py-2 text-left active:bg-[var(--mds-bg-hover-soft)]" :aria-label="`Thao tác với ${u.displayName}`" @click="sheetFor = u">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-semibold leading-5">{{ u.displayName }}<template v-if="u.id === session.user?.id"> (bạn)</template></span>
            <span class="block truncate text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">{{ u.email }}</span>
            <span class="mt-1 flex flex-wrap gap-1">
              <MTag :color="u.role === 'admin' ? 'brand' : 'neutral'" size="sm">{{ ROLE_LABEL[u.role] }}</MTag>
              <MTag :color="u.status === 'active' ? 'success' : 'danger'" size="sm">{{ STATUS_LABEL[u.status] }}</MTag>
              <MTag v-if="u.mustChangePassword" color="warning" size="sm">Mật khẩu tạm</MTag>
            </span>
          </span>
          <span class="shrink-0 text-right text-[12px] text-[var(--mds-text-secondary)]">{{ u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Chưa đăng nhập' }}</span>
          <MSpinner v-if="busy[u.id]" :size="16" />
        </button>
      </li>
    </ul>
    <div v-if="page > 1 || hasNext" class="flex items-center justify-between p-4">
      <MButton variant="outline" :disabled="page <= 1" @click="goPage(page - 1)">Trước</MButton>
      <span class="text-[14px] tabular-nums">Trang {{ page }}</span>
      <MButton variant="outline" :disabled="!hasNext" @click="goPage(page + 1)">Sau</MButton>
    </div>

    <template #footer>
      <MButton variant="primary" class="w-full" @click="openCreate"><template #icon><MIcon name="plus" :size="16" /></template>Thêm tài khoản</MButton>
    </template>

    <ActionSheet v-model="sheetOpen" :title="sheetFor?.email" :items="sheetItems" @select="onSheet" />

    <MDialog v-model="createOpen" title="Thêm tài khoản" width="calc(100vw - 32px)">
      <form id="nu-form" class="flex flex-col gap-4" novalidate @submit.prevent="doCreate">
        <FormAlert v-if="nuError">{{ nuError }}</FormAlert>
        <FormField label="Họ và tên" required><MInput v-model="nu.displayName" autocomplete="off" :error="nuErrors.displayName" /></FormField>
        <FormField label="Email" required><MInput v-model="nu.email" type="email" inputmode="email" autocomplete="off" :error="nuErrors.email" /></FormField>
        <FormField label="Vai trò"><MSelect v-model="nu.role" :options="ROLE_OPTIONS" /></FormField>
      </form>
      <template #footer>
        <MButton variant="outline" @click="createOpen = false">Hủy</MButton>
        <MButton variant="primary" :loading="creating" @click="doCreate">Tạo</MButton>
      </template>
    </MDialog>

    <MDialog
      :model-value="!!confirm"
      :type="confirm?.key === 'disable' ? 'danger' : 'confirm'"
      :title="confirm?.key === 'disable' ? 'Khóa tài khoản?' : 'Đặt lại mật khẩu?'"
      :confirm-text="confirm?.key === 'disable' ? 'Khóa' : 'Đặt lại'"
      width="calc(100vw - 32px)"
      @update:model-value="(v) => !v && (confirm = null)"
      @confirm="doConfirm"
      @cancel="confirm = null"
    >
      <p class="text-[15px] leading-6">{{ confirm?.key === 'disable' ? 'Người dùng sẽ bị đăng xuất khỏi mọi thiết bị.' : 'Mật khẩu hiện tại sẽ hết hiệu lực.' }} ({{ confirm?.user.email }})</p>
    </MDialog>

    <MDialog :model-value="!!temp" title="Mật khẩu tạm" width="calc(100vw - 32px)" @update:model-value="(v) => !v && (temp = null)">
      <TempPasswordBox v-if="temp" :email="temp.email" :password="temp.password" />
      <template #footer><MButton variant="primary" @click="temp = null">Đã lưu</MButton></template>
    </MDialog>
  </MobileShell>
</template>
