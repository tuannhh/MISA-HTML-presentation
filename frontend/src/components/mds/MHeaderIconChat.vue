<script setup>
/**
 * MHeaderIconChat — icon AMIS Chat, đúng bản trong bộ demo chuẩn của giám đốc
 * thiết kế (`IconAmisChat.vue`, capture ngày 2026-07-16 từ dvviet-thin:3000).
 * Đây LÀ MỘT hình bong bóng chat bo tròn, fill đặc 1 màu (không phải outline
 * stroke như icon "message" trong registry MIcon), 3 chấm bên trong là lỗ
 * khoét bằng fill-rule evenodd — không phải 3 hình tròn tô trắng riêng.
 * KHÔNG thay bằng MIcon name="message" hay tự vẽ lại hình dạng khác — đã có
 * 2 lần thử sai (badge tròn cố định, rồi icon message generic) trước khi tìm
 * đúng lại source gốc này. Xem references/patterns/header-bar.md mục 3c.
 */
defineProps({
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: 'currentColor' },
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path
      :fill="color"
      fill-rule="evenodd"
      d="M12 2.5C17.2467 2.5 21.5 6.7533 21.5 12C21.5 17.2467 17.2467 21.5 12 21.5C10.2382 21.5 8.58781 21.0191 7.17285 20.1826L3.15332 21.4756C2.97481 21.5331 2.7791 21.4861 2.64648 21.3535C2.51388 21.2209 2.46694 21.0252 2.52441 20.8467L3.81738 16.8271C2.98089 15.4122 2.50001 13.7618 2.5 12C2.5 6.7533 6.7533 2.5 12 2.5ZM7.60547 10.9014C6.99879 10.9014 6.50689 11.3933 6.50684 12C6.50684 12.6067 6.99876 13.0986 7.60547 13.0986C8.21222 13.0986 8.7041 12.6068 8.7041 12C8.70405 11.3933 8.21219 10.9014 7.60547 10.9014ZM12 10.9014C11.3933 10.9014 10.9014 11.3933 10.9014 12C10.9014 12.6067 11.3933 13.0986 12 13.0986C12.6068 13.0986 13.0986 12.6068 13.0986 12C13.0986 11.3933 12.6067 10.9014 12 10.9014ZM16.3945 10.9014C15.7879 10.9014 15.2959 11.3933 15.2959 12C15.2959 12.6067 15.7878 13.0986 16.3945 13.0986C17.0013 13.0986 17.4932 12.6068 17.4932 12C17.4931 11.3933 17.0013 10.9014 16.3945 10.9014Z"
    />
  </svg>
</template>
