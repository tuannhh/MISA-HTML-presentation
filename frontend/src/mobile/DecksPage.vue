<script setup>
// Danh sách mobile (Bài của tôi / Được chia sẻ / Công khai): list row (ảnh bìa nhỏ + tên + metadata), tìm kiếm 48px,
// thao tác qua bottom sheet; chủ bài mở màn con Chia sẻ toàn màn hình.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import ActionSheet from './ActionSheet.vue'
import FullScreenSheet from './FullScreenSheet.vue'
import SharePanel from '@/shared/SharePanel.vue'
import DeckThumb from '@/shared/DeckThumb.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import { useDecks } from '@/composables/useDecks.js'
import { deckMenuItems, deckTarget, deckAccess, VISIBILITY_LABEL, SHARE_ROLE_LABEL } from '@/lib/deckActions.js'
import { STATUS_TAG, relativeTime } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const scope = ['public', 'shared'].includes(route.meta.nav) ? route.meta.nav : 'mine'
const list = useDecks(scope)
const { rows, total, page, q, loading, error, busy, pendingRemove, pendingShare } = list
const COPY = {
  mine: { title: 'Bài của tôi', empty: 'Chưa có bài trình bày', emptyDesc: 'Tải tài liệu, dán link hoặc nhập nội dung để AI dựng bài.' },
  shared: { title: 'Được chia sẻ với tôi', empty: 'Chưa có bài được chia sẻ', emptyDesc: 'Khi chủ bài mời bạn theo email, bài sẽ hiện ở đây.' },
  public: { title: 'Thư viện công khai', empty: 'Chưa có bài công khai', emptyDesc: 'Bài được chia sẻ công khai sẽ hiện ở đây (chỉ xem).' },
}
const copy = COPY[scope]
const shareOpen = computed({ get: () => !!pendingShare.value, set: (v) => !v && (pendingShare.value = null) })
async function setShareVisibility(isPublic) {
  await list.setVisibility(pendingShare.value, isPublic ? 'public' : 'private')
}
const sheetFor = ref(null)
const sheetOpen = computed({ get: () => !!sheetFor.value, set: (v) => !v && (sheetFor.value = null) })
const lastPage = computed(() => Math.max(1, Math.ceil(total.value / list.pageSize)))
const cancelRemove = () => (pendingRemove.value = null)
function onSheet(key) {
  const d = sheetFor.value
  sheetFor.value = null
  if (d) list.handle(key, d)
}

onMounted(list.load)
</script>

<template>
  <MobileShell :title="copy.title" :nav="scope">
    <div class="sticky top-0 z-10 bg-[var(--mds-bg)] px-4 py-2">
      <MInput :model-value="q" type="search" enterkeyhint="search" placeholder="Tìm theo tên bài" clearable aria-label="Tìm theo tên bài" @update:model-value="list.search">
        <template #prefix><MIcon name="search" :size="16" /></template>
      </MInput>
    </div>

    <div v-if="error" class="p-4">
      <FormAlert>
        {{ error.message }}
        <button type="button" class="ml-1 min-h-12 font-medium text-[var(--mds-brand-600)]" @click="list.load()">Thử lại</button>
      </FormAlert>
    </div>

    <div v-if="loading && !rows.length" class="flex justify-center py-16"><MSpinner :size="32" /></div>

    <div v-else-if="!rows.length && !error" class="px-4 py-10">
      <MEmptyState
        :type="q ? 'no-result' : 'initial'"
        :title="q ? 'Không tìm thấy bài phù hợp' : copy.empty"
        :description="q ? 'Thử từ khóa khác.' : copy.emptyDesc"
      >
        <template v-if="!q && scope === 'mine'" #actions>
          <MButton variant="primary" @click="router.push('/create')"><template #icon><MIcon name="plus" :size="16" /></template>Tạo bài</MButton>
        </template>
      </MEmptyState>
    </div>

    <ul v-else class="bg-[var(--mds-bg)]" aria-label="Danh sách bài trình bày">
      <li v-for="d in rows" :key="d.id" class="flex min-h-[80px] items-center gap-2 border-b border-[var(--mds-border-light)] pl-4 pr-1">
        <RouterLink :to="deckTarget(d)" class="flex min-w-0 flex-1 items-center gap-3 py-3">
          <span class="block w-[112px] shrink-0"><DeckThumb :deck="d" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-semibold leading-5">{{ d.title }}</span>
            <span class="mt-0.5 block truncate text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">
              <template v-if="!d.isOwner && d.authorName">{{ d.authorName }} · </template>{{ d.slideCount ? `${d.slideCount} trang · ` : '' }}{{ relativeTime(d.updatedAt) }}
            </span>
            <span class="mt-1 flex gap-1">
              <MTag v-if="d.status !== 'ready'" :color="STATUS_TAG[d.status].color" size="sm">{{ STATUS_TAG[d.status].label }}</MTag>
              <MTag v-if="d.isOwner" :color="d.visibility === 'public' ? 'brand' : 'neutral'" size="sm">{{ VISIBILITY_LABEL[d.visibility] }}</MTag>
              <MTag v-else-if="d.shareRole" :color="deckAccess(d) === 'editor' ? 'info' : 'neutral'" size="sm">{{ SHARE_ROLE_LABEL[deckAccess(d)] }}</MTag>
            </span>
          </span>
        </RouterLink>
        <div class="grid h-12 w-12 shrink-0 place-items-center">
          <MSpinner v-if="busy[d.id]" :size="20" />
          <MButton v-else variant="icon" :aria-label="`Thao tác với ${d.title}`" @click="sheetFor = d">
            <template #icon><MIcon name="dots-vertical" :size="24" /></template>
          </MButton>
        </div>
      </li>
    </ul>

    <div v-if="total > list.pageSize" class="flex items-center justify-between gap-2 p-4 text-[14px] text-[var(--mds-text-secondary)]">
      <MButton variant="outline" :disabled="page <= 1" @click="list.goPage(page - 1)"><template #icon><MIcon name="chevron-left" :size="16" /></template>Trước</MButton>
      <span class="tabular-nums">{{ page }}/{{ lastPage }}</span>
      <MButton variant="outline" :disabled="page >= lastPage" @click="list.goPage(page + 1)">Sau<MIcon name="chevron-right" :size="16" /></MButton>
    </div>

    <ActionSheet v-model="sheetOpen" :title="sheetFor?.title" :items="sheetFor ? deckMenuItems(sheetFor) : []" @select="onSheet" />
    <FullScreenSheet v-model="shareOpen" title="Chia sẻ">
      <SharePanel v-if="pendingShare" compact :deck-id="pendingShare.id" :visibility="pendingShare.visibility" :set-visibility="setShareVisibility" />
    </FullScreenSheet>

    <MDialog :model-value="!!pendingRemove" type="danger" title="Xóa bài trình bày?" confirm-text="Xóa" width="calc(100vw - 32px)" @update:model-value="(v) => !v && cancelRemove()" @confirm="list.confirmRemove()" @cancel="cancelRemove">
      <p class="text-[15px] leading-6">Bài <strong>{{ pendingRemove?.title }}</strong> cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn.</p>
    </MDialog>
  </MobileShell>
</template>
