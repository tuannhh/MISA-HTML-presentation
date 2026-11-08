<script setup>
// Hộp thoại thư mục dùng chung desktop/mobile: đặt tên (tạo/đổi tên), chuyển đến (cây thư mục, khoá chỗ không hợp lệ), xoá.
// Trạng thái + thao tác nằm ở useFolderView (truyền vào qua prop view).
import { computed, reactive } from 'vue'
import MDialog from '@/components/mds/MDialog.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import MTree from '@/components/mds/MTree.vue'

const props = defineProps({
  view: { type: Object, required: true },
  mobile: { type: Boolean, default: false },
})
// reactive() mở các ref/computed lồng trong object view (moveNodes, current…) khi dùng trong template.
const v = reactive(props.view)
const width = computed(() => (props.mobile ? 'calc(100vw - 32px)' : '480px'))
const nameOpen = computed({ get: () => v.nameDlg.open, set: (x) => (v.nameDlg.open = x) })
const moveOpen = computed({ get: () => v.moveDlg.open, set: (x) => (v.moveDlg.open = x) })
const removeOpen = computed({ get: () => v.removeDlg.open, set: (x) => (v.removeDlg.open = x) })
const moveTitle = computed(() => {
  const t = v.moveDlg.target
  if (!t) return 'Chuyển đến'
  return v.moveDlg.kind === 'deck' ? `Chuyển “${t.title}” vào thư mục` : `Chuyển thư mục “${t.name}” đến`
})
const btn = computed(() => (props.mobile ? 'min-h-12 flex-1' : ''))
</script>

<template>
  <MDialog v-model="nameOpen" :title="v.nameDlg.mode === 'create' ? 'Thư mục mới' : 'Đổi tên thư mục'" :width="width">
    <form class="py-1" @submit.prevent="v.submitName()">
      <label class="mb-1 block text-[13px] font-medium" for="folder-name">Tên thư mục</label>
      <MInput id="folder-name" v-model="v.nameDlg.name" placeholder="VD: Hội nghị 2026" :error="v.nameDlg.error" maxlength="120" autofocus @update:model-value="v.nameDlg.error = ''" />
      <p v-if="v.nameDlg.mode === 'create' && v.current" class="mt-2 text-[12px] leading-4 text-[var(--mds-text-secondary)]">Tạo bên trong “{{ v.current.name }}”.</p>
    </form>
    <template #footer>
      <MButton variant="outline" :class="btn" @click="nameOpen = false">Hủy</MButton>
      <MButton variant="primary" :class="btn" :loading="v.nameDlg.busy" @click="v.submitName()">{{ v.nameDlg.mode === 'create' ? 'Tạo thư mục' : 'Lưu' }}</MButton>
    </template>
  </MDialog>

  <MDialog v-model="moveOpen" :title="moveTitle" :width="mobile ? width : '520px'">
    <p class="mb-2 text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">Chọn thư mục đích. Thư mục mờ là chỗ không chuyển được (chính nó, thư mục con của nó hoặc quá 5 cấp).</p>
    <div class="max-h-[50vh] overflow-y-auto rounded-lg border border-[var(--mds-border)] p-1" :class="mobile ? 'text-[15px]' : 'text-[13px]'">
      <MTree :nodes="v.moveNodes" v-model:selected="v.moveDlg.selected" v-model:expanded="v.moveDlg.expanded" aria-label="Cây thư mục" />
    </div>
    <template #footer>
      <MButton variant="outline" :class="btn" @click="moveOpen = false">Hủy</MButton>
      <MButton variant="primary" :class="btn" :loading="v.moveDlg.busy" @click="v.submitMove()">Chuyển đến đây</MButton>
    </template>
  </MDialog>

  <MDialog v-model="removeOpen" type="danger" title="Xóa thư mục?" confirm-text="Xóa thư mục" :width="width" @confirm="v.submitRemove()">
    <p :class="mobile ? 'text-[15px] leading-6' : 'text-[14px] leading-5'">
      Thư mục <strong>{{ v.removeDlg.folder?.name }}</strong> sẽ bị xóa. Bài trình bày và thư mục con bên trong <strong>không bị xóa</strong> — chúng được chuyển ra thư mục bên ngoài.
    </p>
  </MDialog>
</template>
