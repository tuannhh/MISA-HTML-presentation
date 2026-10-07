<script setup>
// Danh sách bài trình bày desktop: tab Bài của tôi / Được chia sẻ với tôi / Thư viện công khai, tìm kiếm, lưới thẻ có ảnh bìa.
// Chủ bài mở panel Chia sẻ ngay từ menu thao tác của thẻ.
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import DeckThumb from '@/shared/DeckThumb.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import SharePanel from '@/shared/SharePanel.vue'
import { useDecks } from '@/composables/useDecks.js'
import { deckMenuItems, deckTarget, deckAccess, VISIBILITY_LABEL, SHARE_ROLE_LABEL, NAV_ROUTE } from '@/lib/deckActions.js'
import { STATUS_TAG, relativeTime } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const scope = ['public', 'shared'].includes(route.meta.nav) ? route.meta.nav : 'mine'
const list = useDecks(scope)
const { rows, total, page, q, loading, error, busy, pendingRemove, pendingShare } = list

const tabs = [
  { key: 'mine', label: 'Bài của tôi' },
  { key: 'shared', label: 'Được chia sẻ với tôi' },
  { key: 'public', label: 'Thư viện công khai' },
]
const COPY = {
  mine: { title: 'Bài trình bày của tôi', sub: 'Chỉ bạn nhìn thấy các bài riêng tư của mình.', empty: 'Bạn chưa có bài trình bày nào', emptyDesc: 'Tải tài liệu, dán link hoặc nhập nội dung — AI sẽ dựng bài trình bày có chuyển động.' },
  shared: { title: 'Được chia sẻ với tôi', sub: 'Bài người khác mời bạn xem hoặc chỉnh sửa.', empty: 'Chưa có bài nào được chia sẻ với bạn', emptyDesc: 'Khi chủ bài mời bạn theo email, bài sẽ xuất hiện ở đây.' },
  public: { title: 'Thư viện công khai', sub: 'Bài được chia sẻ công khai cho toàn hệ thống — chỉ xem, tải và nhân bản.', empty: 'Chưa có bài công khai', emptyDesc: 'Khi người dùng công khai bài, bài sẽ xuất hiện ở đây.' },
}
const copy = COPY[scope]
const onTab = (k) => k !== scope && router.push(NAV_ROUTE[k])
const shareOpen = computed({ get: () => !!pendingShare.value, set: (v) => !v && (pendingShare.value = null) })
async function setShareVisibility(isPublic) {
  await list.setVisibility(pendingShare.value, isPublic ? 'public' : 'private')
}
const cancelRemove = () => (pendingRemove.value = null)
const lastPage = computed(() => Math.max(1, Math.ceil(total.value / list.pageSize)))

onMounted(() => {
  if (typeof route.query.q === 'string') q.value = route.query.q
  list.load()
})
// Tìm từ ô tìm kiếm trên header khi đang ở trang này.
watch(() => route.query.q, (v) => list.search(typeof v === 'string' ? v : ''))
</script>

<template>
  <DesktopShell :active="scope">
    <div class="mx-auto flex max-w-[1440px] flex-col gap-4 p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-[20px] font-semibold leading-7 text-[var(--mds-text)]">{{ copy.title }}</h1>
          <p class="text-[13px] text-[var(--mds-text-secondary)]">{{ copy.sub }}</p>
        </div>
        <MButton variant="primary" @click="router.push('/create')">
          <template #icon><MIcon name="plus" :size="16" /></template>
          Tạo bài mới
        </MButton>
      </div>

      <div class="rounded-lg bg-[var(--mds-bg)] shadow-[var(--mds-shadow-card)]">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mds-border)] px-4">
          <MTabs :model-value="scope" :tabs="tabs" @update:model-value="onTab" />
          <div class="w-full max-w-[320px] py-2">
            <MInput :model-value="q" placeholder="Tìm theo tên bài" clearable aria-label="Tìm theo tên bài" @update:model-value="list.search">
              <template #prefix><MIcon name="search" :size="16" /></template>
            </MInput>
          </div>
        </div>

        <div class="p-4">
          <FormAlert v-if="error" class="mb-4">
            {{ error.message }}
            <button type="button" class="ml-2 font-medium text-[var(--mds-brand-600)] hover:underline" @click="list.load()">Thử lại</button>
          </FormAlert>

          <div v-if="loading && !rows.length" class="flex justify-center py-16"><MSpinner :size="32" /></div>

          <MEmptyState
            v-else-if="!rows.length && !error"
            :type="q ? 'no-result' : 'initial'"
            :title="q ? 'Không tìm thấy bài phù hợp' : copy.empty"
            :description="q ? 'Thử từ khóa khác.' : copy.emptyDesc"
          >
            <template v-if="!q && scope === 'mine'" #actions>
              <MButton variant="primary" @click="router.push('/create')">
                <template #icon><MIcon name="plus" :size="16" /></template>
                Tạo bài đầu tiên
              </MButton>
            </template>
          </MEmptyState>

          <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4" aria-label="Danh sách bài trình bày">
            <li
              v-for="d in rows"
              :key="d.id"
              class="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] transition-shadow hover:shadow-[var(--mds-shadow-card)]"
            >
              <RouterLink :to="deckTarget(d)" class="block focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]" :aria-label="`Mở ${d.title}`">
                <DeckThumb :deck="d" class="rounded-none" />
              </RouterLink>
              <div class="flex min-w-0 items-start gap-2 p-3">
                <div class="min-w-0 flex-1">
                  <RouterLink :to="deckTarget(d)" class="block truncate text-[14px] font-semibold leading-5 text-[var(--mds-text)] hover:text-[var(--mds-brand-600)]" :title="d.title">{{ d.title }}</RouterLink>
                  <p class="mt-0.5 truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">
                    <template v-if="!d.isOwner && d.authorName">{{ d.authorName }} · </template>{{ d.slideCount ? `${d.slideCount} trang · ` : '' }}{{ d.ratio }} · {{ relativeTime(d.updatedAt) }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <MTag v-if="d.status !== 'ready'" :color="STATUS_TAG[d.status].color" size="sm">{{ STATUS_TAG[d.status].label }}</MTag>
                    <MTag v-if="d.isOwner" :color="d.visibility === 'public' ? 'brand' : 'neutral'" size="sm">{{ VISIBILITY_LABEL[d.visibility] }}</MTag>
                    <MTag v-else-if="d.shareRole" :color="deckAccess(d) === 'editor' ? 'info' : 'neutral'" size="sm">{{ SHARE_ROLE_LABEL[deckAccess(d)] }}</MTag>
                  </div>
                  <p v-if="d.status === 'failed' && d.errorMessage" class="mt-2 line-clamp-2 text-[12px] leading-4 text-[var(--mds-danger)]" :title="d.errorMessage">{{ d.errorMessage }}</p>
                </div>
                <MSpinner v-if="busy[d.id]" :size="16" class="mt-2" />
                <MDropdownMenu v-else :items="deckMenuItems(d)" @select="(k) => list.handle(k, d)" />
              </div>
            </li>
          </ul>

          <div v-if="total > list.pageSize" class="mt-4 flex items-center justify-end gap-2 text-[13px] text-[var(--mds-text-secondary)]">
            <span>Trang {{ page }}/{{ lastPage }} · {{ total }} bài</span>
            <MButton variant="icon" aria-label="Trang trước" :disabled="page <= 1" @click="list.goPage(page - 1)"><template #icon><MIcon name="chevron-left" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Trang sau" :disabled="page >= lastPage" @click="list.goPage(page + 1)"><template #icon><MIcon name="chevron-right" :size="16" /></template></MButton>
          </div>
        </div>
      </div>
    </div>

    <MDialog v-model="shareOpen" :title="pendingShare ? `Chia sẻ “${pendingShare.title}”` : 'Chia sẻ'" width="600px">
      <SharePanel v-if="pendingShare" :deck-id="pendingShare.id" :visibility="pendingShare.visibility" :set-visibility="setShareVisibility" />
    </MDialog>

    <MDialog
      :model-value="!!pendingRemove"
      type="danger"
      title="Xóa bài trình bày?"
      confirm-text="Xóa"
      @update:model-value="(v) => !v && cancelRemove()"
      @confirm="list.confirmRemove()"
      @cancel="cancelRemove"
    >
      <p class="text-[14px] leading-5">
        Bài <strong>{{ pendingRemove?.title }}</strong> cùng toàn bộ ảnh sẽ bị xóa vĩnh viễn. Không thể khôi phục.
      </p>
    </MDialog>
  </DesktopShell>
</template>
