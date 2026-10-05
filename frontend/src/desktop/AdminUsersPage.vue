<script setup>
// Quản trị người dùng (desktop): bảng MDS, thêm tài khoản (mật khẩu tạm hiển thị 1 lần), đổi vai trò, khoá/mở, đặt lại mật khẩu.
import { onMounted, ref } from 'vue'
import DesktopShell from './DesktopShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import TempPasswordBox from '@/shared/TempPasswordBox.vue'
import MDataTable from '@/components/mds/MDataTable.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import { useToast } from '@/components/mds/toast.js'
import { useAdminUsers, ROLE_LABEL, ROLE_OPTIONS, STATUS_LABEL, emptyNewUser, validateNewUser } from '@/composables/useAdminUsers.js'
import { session } from '@/lib/session.js'
import { formatDateTime } from '@/lib/format.js'

const toast = useToast()
const admin = useAdminUsers()
const { rows, total, page, hasNext, loading, error, busy } = admin

const columns = [
  { key: 'displayName', label: 'Họ và tên', width: 220 },
  { key: 'email', label: 'Email', width: 260 },
  { key: 'role', label: 'Vai trò', width: 140 },
  { key: 'status', label: 'Trạng thái', width: 140 },
  { key: 'lastLoginAt', label: 'Đăng nhập gần nhất', width: 200 },
  { key: 'createdAt', label: 'Ngày tạo', width: 200 },
]

function rowMenu(u) {
  const self = u.id === session.user?.id
  return [
    u.role === 'admin'
      ? { key: 'to-user', label: 'Chuyển thành Người dùng', icon: 'user', disabled: self }
      : { key: 'to-admin', label: 'Cấp quyền Quản trị', icon: 'users' },
    u.status === 'active'
      ? { key: 'disable', label: 'Khóa tài khoản', icon: 'lock', disabled: self, danger: true }
      : { key: 'enable', label: 'Mở khóa tài khoản', icon: 'lock-open' },
    { key: 'd', divider: true },
    { key: 'reset', label: 'Đặt lại mật khẩu', icon: 'refresh' },
  ]
}

const confirm = ref(null) // { user, key }
const temp = ref(null) // { email, password }

async function onRow(key, u) {
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
      toast.success('Đã khóa tài khoản và đăng xuất mọi phiên của người dùng')
    } else {
      const res = await admin.resetPassword(u)
      temp.value = { email: u.email, password: res.temporaryPassword }
    }
  } catch (err) {
    toast.error(err.message)
  }
}

/* Thêm tài khoản */
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

onMounted(admin.load)
</script>

<template>
  <DesktopShell active="admin" full>
    <div class="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h1 class="text-[20px] font-semibold leading-7">Quản trị người dùng</h1>
          <p class="text-[13px] text-[var(--mds-text-secondary)]">Quản lý tài khoản đăng nhập. Quản trị viên không xem được bài riêng tư của người dùng.</p>
        </div>
        <MButton variant="primary" @click="openCreate"><template #icon><MIcon name="plus" :size="16" /></template>Thêm tài khoản</MButton>
      </div>
      <FormAlert v-if="error">{{ error.message }}</FormAlert>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-[var(--mds-bg)] shadow-[var(--mds-shadow-card)]">
        <MDataTable
          :columns="columns"
          :rows="rows"
          :loading="loading"
          :page="page"
          :has-next="hasNext"
          :page-size="admin.pageSize"
          :page-size-options="[20]"
          :total="total"
          :hide-tools="['export', 'columns', 'filter']"
          class="min-h-0 flex-1"
          @update:page="(p) => { admin.page.value = p; admin.load() }"
          @refresh="admin.load()"
        >
          <template #toolbar-search>
            <div class="w-[320px]">
              <MInput :model-value="admin.q.value" placeholder="Tìm theo tên hoặc email" clearable aria-label="Tìm người dùng" @update:model-value="admin.search">
                <template #prefix><MIcon name="search" :size="16" /></template>
              </MInput>
            </div>
          </template>
          <template #cell-displayName="{ row }">
            <span class="font-medium">{{ row.displayName }}</span>
            <MTag v-if="row.id === session.user?.id" size="sm" color="info" class="ml-1">Bạn</MTag>
          </template>
          <template #cell-role="{ row }">
            <MTag :color="row.role === 'admin' ? 'brand' : 'neutral'" size="sm">{{ ROLE_LABEL[row.role] }}</MTag>
          </template>
          <template #cell-status="{ row }">
            <MTag :color="row.status === 'active' ? 'success' : 'danger'" size="sm">{{ STATUS_LABEL[row.status] }}</MTag>
            <MTag v-if="row.mustChangePassword" size="sm" color="warning" class="ml-1">Mật khẩu tạm</MTag>
          </template>
          <template #cell-lastLoginAt="{ row }">{{ formatDateTime(row.lastLoginAt) || '—' }}</template>
          <template #cell-createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          <template #row-actions="{ row }">
            <MDropdownMenu :items="rowMenu(row)" :aria-busy="busy[row.id] || undefined" @select="(k) => onRow(k, row)" />
          </template>
        </MDataTable>
      </div>
    </div>

    <MDialog v-model="createOpen" title="Thêm tài khoản" width="520px">
      <form class="flex flex-col gap-4" novalidate @submit.prevent="doCreate">
        <FormAlert v-if="nuError">{{ nuError }}</FormAlert>
        <FormField label="Họ và tên" required><MInput v-model="nu.displayName" autocomplete="off" :error="nuErrors.displayName" /></FormField>
        <FormField label="Email" required><MInput v-model="nu.email" type="email" autocomplete="off" :error="nuErrors.email" /></FormField>
        <FormField label="Vai trò"><MSelect v-model="nu.role" :options="ROLE_OPTIONS" /></FormField>
        <p class="text-[12px] text-[var(--mds-text-secondary)]">Hệ thống sinh mật khẩu tạm, người dùng phải đổi ở lần đăng nhập đầu tiên. Tài khoản do quản trị tạo không bị giới hạn tên miền email.</p>
      </form>
      <template #footer>
        <MButton variant="outline" @click="createOpen = false">Hủy</MButton>
        <MButton variant="primary" :loading="creating" @click="doCreate">Tạo tài khoản</MButton>
      </template>
    </MDialog>

    <MDialog
      :model-value="!!confirm"
      :type="confirm?.key === 'disable' ? 'danger' : 'confirm'"
      :title="confirm?.key === 'disable' ? 'Khóa tài khoản?' : 'Đặt lại mật khẩu?'"
      :confirm-text="confirm?.key === 'disable' ? 'Khóa' : 'Đặt lại'"
      @update:model-value="(v) => !v && (confirm = null)"
      @confirm="doConfirm"
      @cancel="confirm = null"
    >
      <p class="text-[14px] leading-5">
        <template v-if="confirm?.key === 'disable'"><strong>{{ confirm?.user.email }}</strong> sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được nữa. Dữ liệu của người dùng vẫn được giữ.</template>
        <template v-else>Mật khẩu hiện tại của <strong>{{ confirm?.user.email }}</strong> sẽ hết hiệu lực và mọi phiên đăng nhập bị thu hồi.</template>
      </p>
    </MDialog>

    <MDialog :model-value="!!temp" title="Mật khẩu tạm" width="520px" @update:model-value="(v) => !v && (temp = null)">
      <TempPasswordBox v-if="temp" :email="temp.email" :password="temp.password" />
      <template #footer><MButton variant="primary" @click="temp = null">Đã lưu mật khẩu</MButton></template>
    </MDialog>
  </DesktopShell>
</template>
