<script setup>
import AuthLayout from './AuthLayout.vue'
import FormField from '@/shared/FormField.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import FormAlert from '@/shared/FormAlert.vue'
import { useLoginForm } from '@/composables/useAuthForms.js'
import { session } from '@/lib/session.js'

const { form, errors, submitting, formError, submit } = useLoginForm()
</script>

<template>
  <AuthLayout title="Đăng nhập" subtitle="Tạo bài trình bày có chuyển động từ tài liệu của bạn bằng AI.">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError">{{ formError }}</FormAlert>
      <FormField label="Email" required>
        <MInput v-model="form.email" type="email" autocomplete="username" placeholder="ten@misa.com.vn" :error="errors.email" />
      </FormField>
      <FormField label="Mật khẩu" required>
        <MInput v-model="form.password" type="password" autocomplete="current-password" :error="errors.password" />
      </FormField>
      <MButton variant="primary" size="lg" type="submit" class="w-full" :loading="submitting">Đăng nhập</MButton>
    </form>
    <template #below>
      <p v-if="session.config.selfRegistration" class="text-[14px] text-[var(--mds-text-secondary)]">
        Chưa có tài khoản?
        <RouterLink :to="{ path: '/register', query: $route.query }" class="font-medium text-[var(--mds-brand-600)] hover:underline">Đăng ký</RouterLink>
      </p>
      <p v-else class="text-[14px] text-[var(--mds-text-secondary)]">Liên hệ quản trị viên để được cấp tài khoản.</p>
    </template>
  </AuthLayout>
</template>
