/**
 * useToast — composable quản lý state toast toàn cục cho MToast.vue
 *
 * Hành vi MDS bắt buộc:
 * - Tự đóng sau 5 giây.
 * - Tối đa 3 toast hiển thị — nhiều hơn thì toast cũ nhất tự ẩn.
 * - Toast mới nhất hiển thị trên cùng.
 */
import { reactive } from 'vue'

// State global — mọi nơi gọi useToast() dùng chung 1 mảng
const toasts = reactive([])

let uid = 0
const AUTO_CLOSE_MS = 5000 // MDS: 5 giây tự động đóng
const MAX_VISIBLE = 3      // MDS: tối đa 3 thông báo gần nhất

function remove(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i !== -1) {
    clearTimeout(toasts[i].timer)
    toasts.splice(i, 1)
  }
}

function push(type, message) {
  const id = ++uid
  // Mới nhất trên cùng → thêm vào đầu mảng
  toasts.unshift({
    id,
    type,
    message,
    timer: setTimeout(() => remove(id), AUTO_CLOSE_MS),
  })
  // Quá 3 toast → tự ẩn toast cũ nhất (cuối mảng)
  while (toasts.length > MAX_VISIBLE) {
    remove(toasts[toasts.length - 1].id)
  }
  return id
}

export function useToast() {
  return {
    success: (msg) => push('success', msg),
    error: (msg) => push('error', msg),
    warning: (msg) => push('warning', msg),
    info: (msg) => push('info', msg),
    remove,
    toasts,
  }
}
