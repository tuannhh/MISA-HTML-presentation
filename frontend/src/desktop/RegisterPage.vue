<script setup>
import AuthLayout from './AuthLayout.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import { useRegisterForm } from '@/composables/useAuthForms.js'
import { session } from '@/lib/session.js'

const { form, errors, submitting, formError, submit } = useRegisterForm()
const domains = (session.config.allowedEmailDomains || []).map((d) => '@' + d).join(', ')
</script>

<template>
  <AuthLayout title="Đăng ký tài khoản" :subtitle="domains ? `Dùng email công ty (${domains}).` : ''">
    <FormAlert v-if="!session.config.selfRegistration" tone="info">Hệ thống không mở đăng ký tự do. Liên hệ quản trị viên để được cấp tài khoản.</FormAlert>
    <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError">{{ formError }}</FormAlert>
      <FormField label="Họ và tên" required>
        <MInput v-model="form.displayName" autocomplete="name" :error="errors.displayName" />
      </FormField>
      <FormField label="Email" required>
        <MInput v-model="form.email" type="email" autocomplete="email" placeholder="ten@misa.com.vn" :error="errors.email" />
      </FormField>
      <FormField label="Mật khẩu" required hint="10–128 ký tự, có cả chữ và số">
        <MInput v-model="form.password" type="password" autocomplete="new-password" :error="errors.password" />
      </FormField>
      <FormField label="Nhập lại mật khẩu" required>
        <MInput v-model="form.confirm" type="password" autocomplete="new-password" :error="errors.confirm" />
      </FormField>
      <MButton variant="primary" size="lg" type="submit" class="w-full" :loading="submitting">Tạo tài khoản</MButton>
    </form>
    <template #below>
      <p class="text-[14px] text-[var(--mds-text-secondary)]">
        Đã có tài khoản?
        <RouterLink :to="{ path: '/login', query: $route.query }" class="font-medium text-[var(--mds-brand-600)] hover:underline">Đăng nhập</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
