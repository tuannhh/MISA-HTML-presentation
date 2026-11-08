<script setup>
// Danh sách bài trình bày desktop: tab Bài của tôi / Được chia sẻ với tôi / Thư viện công khai, tìm kiếm, lưới thẻ có ảnh bìa.
// Chủ bài mở panel Chia sẻ ngay từ menu thao tác của thẻ. "Bài của tôi" có thư mục lồng nhau (?folder=…): đường dẫn,
// thẻ thư mục, kéo thẻ bài thả vào thư mục/đường dẫn để chuyển.
import { computed, onMounted, ref, watch } from 'vue'
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
import FolderDialogs from '@/shared/FolderDialogs.vue'
import { useDecks } from '@/composables/useDecks.js'
import { useFolderView } from '@/composables/useFolderView.js'
import { deckMenuItems, deckTarget, deckAccess, VISIBILITY_LABEL, SHARE_ROLE_LABEL, NAV_ROUTE } from '@/lib/deckActions.js'
import { STATUS_TAG, relativeTime } from '@/lib/format.js'

const route = useRoute()
const router = useRouter()
const scope = ['public', 'shared'].includes(route.meta.nav) ? route.meta.nav : 'mine'
const list = useDecks(scope)
const { rows, total, page, q, loading, error, busy, pendingRemove, pendingShare } = list
const fv = scope === 'mine' ? useFolderView(list) : null
const showFolders = computed(() => !!fv && !fv.searching.value)
const subfolders = computed(() => (showFolders.value ? fv.subfolders.value : []))

/* ---- Kéo thẻ bài (của mình) thả vào thẻ thư mục / mục đường dẫn ---- */
const DRAG_TYPE = 'application/x-misa-deck'
const dragging = ref(null)
const dropOn = ref(null) // id thư mục đang được rê lên ('' = gốc)
function onDragStart(e, d) {
  if (!fv || !d.isOwner) return e.preventDefault()
  dragging.value = d.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(DRAG_TYPE, d.id)
}
function onDragEnd() {
  dragging.value = null
  dropOn.value = null
}
function onDragOver(e, id) {
  if (!dragging.value || !e.dataTransfer.types.includes(DRAG_TYPE)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropOn.value = id
}
function onDrop(e, id) {
  const deckId = e.dataTransfer.getData(DRAG_TYPE)
  onDragEnd()
  if (deckId) fv.dropDeck(deckId, id || null)
}

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
  if (fv) fv.init()
  else list.load()
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

          <template v-if="showFolders">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <nav aria-label="Đường dẫn thư mục" class="min-w-0 flex-1">
                <ol class="flex min-w-0 flex-wrap items-center gap-0.5 text-[14px] leading-5">
                  <li>
                    <button
                      type="button"
                      class="rounded-lg px-2 py-1 font-medium hover:bg-[var(--mds-bg-hover-soft)]"
                      :class="[fv.currentId.value ? 'text-[var(--mds-brand-600)]' : 'text-[var(--mds-text)]', dropOn === '' ? 'bg-[var(--mds-brand-50)] outline outline-2 outline-[var(--mds-brand-600)]' : '']"
                      @click="fv.open(null)"
                      @dragover="(e) => fv.currentId.value && onDragOver(e, '')"
                      @dragleave="dropOn = null"
                      @drop="(e) => onDrop(e, null)"
                    >
                      <MIcon name="home" :size="16" class="-mt-0.5 mr-1 inline" />Bài của tôi
                    </button>
                  </li>
                  <li v-for="(c, i) in fv.crumbs.value" :key="c.id" class="flex min-w-0 items-center">
                    <MIcon name="chevron-right" :size="16" class="shrink-0 text-[var(--mds-icon-neutral)]" />
                    <button
                      type="button"
                      class="max-w-[240px] truncate rounded-lg px-2 py-1 font-medium hover:bg-[var(--mds-bg-hover-soft)]"
                      :class="[i < fv.crumbs.value.length - 1 ? 'text-[var(--mds-brand-600)]' : 'text-[var(--mds-text)]', dropOn === c.id ? 'bg-[var(--mds-brand-50)] outline outline-2 outline-[var(--mds-brand-600)]' : '']"
                      :title="c.name"
                      :aria-current="i === fv.crumbs.value.length - 1 ? 'page' : undefined"
                      @click="fv.open(c.id)"
                      @dragover="(e) => i < fv.crumbs.value.length - 1 && onDragOver(e, c.id)"
                      @dragleave="dropOn = null"
                      @drop="(e) => onDrop(e, c.id)"
                    >{{ c.name }}</button>
                  </li>
                </ol>
              </nav>
              <div class="flex items-center gap-1">
                <MDropdownMenu v-if="fv.current.value" :items="fv.FOLDER_MENU" @select="(k) => fv.handleFolder(k, fv.current.value)" />
                <MButton variant="outline" :disabled="!fv.canNest.value" :title="fv.canNest.value ? '' : 'Thư mục lồng tối đa 5 cấp'" @click="fv.askCreate()">
                  <template #icon><MIcon name="folder" :size="16" /></template>
                  Thư mục mới
                </MButton>
              </div>
            </div>

            <ul v-if="subfolders.length" class="mb-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-label="Thư mục">
              <li
                v-for="f in subfolders"
                :key="f.id"
                class="flex min-w-0 items-center gap-1 rounded-lg border bg-[var(--mds-bg)] pr-1 transition-colors"
                :class="dropOn === f.id ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:bg-[var(--mds-bg-hover-soft)]'"
                @dragover="(e) => onDragOver(e, f.id)"
                @dragleave="dropOn = null"
                @drop="(e) => onDrop(e, f.id)"
              >
                <button type="button" class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left" :aria-label="`Mở thư mục ${f.name}`" @click="fv.open(f.id)">
                  <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]"><MIcon name="folder" :size="20" /></span>
                  <span class="min-w-0">
                    <span class="block truncate text-[14px] font-semibold leading-5 text-[var(--mds-text)]" :title="f.name">{{ f.name }}</span>
                    <span class="block truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ fv.folderMeta(f) }}</span>
                  </span>
                </button>
                <MDropdownMenu :items="fv.FOLDER_MENU" @select="(k) => fv.handleFolder(k, f)" />
              </li>
            </ul>
          </template>

          <div v-if="loading && !rows.length" class="flex justify-center py-16"><MSpinner :size="32" /></div>

          <p v-else-if="!rows.length && !error && subfolders.length" class="py-6 text-center text-[13px] text-[var(--mds-text-secondary)]">
            {{ fv?.currentId.value ? 'Thư mục này chưa có bài trực tiếp — mở thư mục con hoặc chuyển bài vào đây.' : 'Mọi bài đã được xếp vào thư mục.' }}
          </p>

          <MEmptyState
            v-else-if="!rows.length && !error && fv?.currentId.value && !q"
            type="initial"
            title="Thư mục trống"
            description="Chọn “Chuyển vào thư mục…” trong menu của bài, hoặc kéo thẻ bài thả vào thư mục."
          />

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
              :class="dragging === d.id ? 'opacity-50' : ''"
              :draggable="!!fv && d.isOwner"
              @dragstart="(e) => onDragStart(e, d)"
              @dragend="onDragEnd"
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

    <FolderDialogs v-if="fv" :view="fv" />

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
