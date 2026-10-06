// Giữ phần tên bài trên đường dẫn khớp tên hiện tại: /<ten-bai>/<ma>/<tinh-nang>. Tên đổi (AI đặt tên sau khi lập dàn ý,
// người dùng đổi tên rồi lưu) → thay đường dẫn tại chỗ (cùng route, App.vue giữ trang theo mã ngắn nên không tải lại).
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { deckPath } from '@/lib/deckPath.js';

export function useDeckUrl(deck, feature) {
  const route = useRoute();
  const router = useRouter();
  watch(
    () => (deck.value?.code ? deckPath(deck.value, feature) : ''),
    (want) => {
      // Chỉ thay khi vẫn đang ở đúng tính năng này của đúng bài (không chen vào lúc đang chuyển trang khác).
      if (want && route.params.code === deck.value.code && route.path.endsWith(`/${feature}`) && route.path !== want) router.replace(want);
    },
    { immediate: true },
  );
}
