// Vòng AI tự soát sau khi dựng bài (DESIGN_REVIEW): chụp từng trang đã dựng → model đọc ảnh chấm theo danh sách kiểm
// (chữ tràn/chồng, số lặp, bố cục hụt/dày, hình 3D lỗi, tương phản, chữ nhỏ) → sửa tự động trong phạm vi an toàn:
// đổi kiểu trình bày (chỉ trong các kiểu còn hợp nội dung), vẽ lại hoặc bỏ hình minh hoạ lỗi.
// Hàm thuần — presentationService chụp ảnh + gọi model; tệp này lập mô tả trang, lược đồ trả lời và áp kết quả lên spec.
import { VARIANTS, MANUAL_VARIANTS, fits, resolveVariant } from '../../shared/deck/variants.js';
import { plainText } from '../../shared/deck/rich.js';

export const REVIEW_ISSUES = Object.freeze(['overflow', 'overlap', 'duplicate_number', 'empty_space', 'crowded', 'bad_art', 'art_mismatch', 'low_contrast', 'small_text', 'other']);
export const REVIEW_BATCH = 8;
// Hình vẽ lại tối đa mỗi lượt soát (mỗi hình ~5–10 giây, chạy song song theo hàng đợi ảnh AI).
export const REVIEW_REDRAW_MAX = 6;

/** Kiểu trình bày AI được đổi sang cho trang (hợp nội dung, không phải kiểu chỉ người dùng chọn), trừ kiểu đang dùng. */
export function altVariants(s, ratio) {
  const cur = resolveVariant(s, ratio);
  return (VARIANTS[s.layout] || []).filter((v) => v !== cur && !MANUAL_VARIANTS.has(`${s.layout}:${v}`) && fits(s.layout, v, s, ratio));
}

const hasSlideArt = (s) => s.image?.frame === 'art' && !!s.image.asset;
const hasItemArt = (s) => (s.items || []).some((it) => it.image?.frame === 'art' && it.image.asset);

/** Mô tả ngắn 1 trang kèm ảnh chụp — model biết bố cục, kiểu đang dùng và các kiểu được phép đổi. */
export function slideBrief(s, i, ratio) {
  const alts = altVariants(s, ratio);
  const art = hasSlideArt(s) ? 'hình 3D cỡ trang' : hasItemArt(s) ? 'hình 3D từng mục' : 'không';
  return [
    `Trang ${i + 1} · bố cục ${s.layout} · kiểu đang dùng: ${resolveVariant(s, ratio) || 'mặc định'}`,
    `kiểu có thể đổi: ${alts.length ? alts.join(', ') : '(không)'}`,
    `hình minh hoạ: ${art}`,
    ...(s.callout?.style === 'band' ? ['khối cuối trang: dải kết luận'] : s.callout?.style === 'quote' ? ['khối cuối trang: câu chốt cỡ lớn'] : []),
    ...([...(s.items || []), ...(s.steps || [])].some((it) => it.badge) ? ['có mục then chốt gắn huy hiệu'] : []),
    `tiêu đề: ${plainText(s.title || '').slice(0, 120)}`,
  ].join(' · ');
}

export const REVIEW_PROMPT = `Bạn là giám đốc nghệ thuật soát bài trình bày trước khi giao cho khách. Mỗi ảnh là 1 trang đã dựng, đi kèm dòng mô tả trang.
Chấm TỪNG trang theo danh sách kiểm, chỉ báo lỗi NHÌN THẤY RÕ trên ảnh (không đoán, không bắt bẻ thẩm mỹ chung chung):
1. overflow — chữ tràn khỏi khung/thẻ, bị cắt mất, vượt mép trang. overlap — chữ chồng lên chữ hoặc chồng lên hình (huy hiệu nhỏ cố ý đè lên mép trên thẻ then chốt là đúng thiết kế).
2. duplicate_number — số thứ tự hiện 2 lần (số lớn trang trí và số ngay trong tiêu đề/nhãn), nhãn lặp nguyên văn tiêu đề.
3. empty_space — khoảng trống lớn vô nghĩa, ô/thẻ trống, nội dung dồn một góc. crowded — quá dày, các ý dính nhau, khó đọc.
4. bad_art — hình 3D lỗi kỹ thuật: còn nền/viền xám bẩn quanh vật thể, vật thể méo/vỡ, có chữ/ký tự trong hình. art_mismatch — hình không liên quan nội dung, hoặc hình quá to lấn át chữ.
5. low_contrast — chữ khó đọc trên nền. small_text — chữ quá nhỏ so với khung trang.
Quyết định cho từng trang:
- ok = true khi không có lỗi đáng kể (khi đó issues rỗng, variant rỗng, art = keep).
- variant: CHỈ ghi khi đổi kiểu trình bày chữa được lỗi bố cục (overflow, overlap, duplicate_number, empty_space, crowded) và kiểu đó nằm trong "kiểu có thể đổi" của trang; không thì để rỗng.
- art: redraw khi hình 3D lỗi kỹ thuật hoặc không hợp nội dung; drop khi trang tốt hơn nếu bỏ hình (vd. hình chiếm chỗ làm chữ nhỏ/dày); keep trong mọi trường hợp khác (kể cả trang không có hình).
Chữ phải là phần chính, dễ đọc từ cuối phòng họp: chữ thân bài nhìn nhỏ hơn khoảng 1/45 chiều cao trang → small_text.
- detail: ≤ 20 từ tiếng Việt, nêu đúng chỗ lỗi.
Trả đúng số trang được gửi, theo số trang ghi trong mô tả.`;

export function reviewResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      slides: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            slide: { type: 'INTEGER', description: 'số trang ghi trong mô tả' },
            ok: { type: 'BOOLEAN' },
            issues: {
              type: 'ARRAY',
              items: { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: [...REVIEW_ISSUES] }, detail: { type: 'STRING' } }, required: ['kind', 'detail'] },
            },
            variant: { type: 'STRING', description: 'kiểu đổi sang, rỗng nếu giữ' },
            art: { type: 'STRING', enum: ['keep', 'redraw', 'drop'] },
          },
          required: ['slide', 'ok', 'issues', 'variant', 'art'],
        },
      },
    },
    required: ['slides'],
  };
}

const LAYOUT_ISSUES = new Set(['overflow', 'overlap', 'duplicate_number', 'empty_space', 'crowded']);
const ART_ISSUES = new Set(['bad_art', 'art_mismatch']);
const TEXT_ISSUES = new Set(['small_text', 'crowded', 'overflow']);
const HERO_KEEP = new Set(['cover', 'section']);

/**
 * Áp kết quả soát lên spec (đã qua normalizeSpec). Chỉ nhận sửa khớp với lỗi được nêu và nằm trong phạm vi cho phép.
 * @param {object} spec
 * @param {Array} verdicts mục trả về của model (đã gộp các lượt)
 * @returns {{ checked: number, flagged: number, variants: number, dropped: number, redraw: Array<{ slide: number, item: number|null }>, issues: Record<string, number> }}
 */
export function applyReview(spec, verdicts, ratio = 16 / 9) {
  const out = { checked: 0, flagged: 0, variants: 0, dropped: 0, redraw: [], issues: {} };
  const seen = new Set();
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    const i = Number(v?.slide) - 1;
    const s = spec.slides?.[i];
    if (!s || seen.has(i)) continue;
    seen.add(i);
    out.checked += 1;
    const kinds = new Set((Array.isArray(v.issues) ? v.issues : []).map((x) => x?.kind).filter((k) => REVIEW_ISSUES.includes(k)));
    if (v.ok === true && !kinds.size) continue;
    if (!kinds.size) continue;
    out.flagged += 1;
    for (const k of kinds) out.issues[k] = (out.issues[k] || 0) + 1;
    const want = typeof v.variant === 'string' ? v.variant.trim() : '';
    if (want && [...kinds].some((k) => LAYOUT_ISSUES.has(k)) && altVariants(s, ratio).includes(want)) {
      s.variant = want === VARIANTS[s.layout][0] ? '' : want;
      out.variants += 1;
    }
    // Chữ là chính: trang (không phải bìa / mở đầu phần) có hình cỡ trang mà chữ nhỏ / dày / tràn → bỏ hình, chữ có thêm chỗ.
    if (hasSlideArt(s) && !HERO_KEEP.has(s.layout) && [...kinds].some((k) => TEXT_ISSUES.has(k))) {
      delete s.image;
      out.dropped += 1;
      continue;
    }
    if (![...kinds].some((k) => ART_ISSUES.has(k))) continue;
    if (v.art === 'drop') {
      if (hasSlideArt(s)) delete s.image;
      else if (hasItemArt(s)) (s.items || []).forEach((it) => it.image?.frame === 'art' && delete it.image);
      else continue;
      out.dropped += 1;
    } else if (v.art === 'redraw' && out.redraw.length < REVIEW_REDRAW_MAX) {
      if (hasSlideArt(s)) out.redraw.push({ slide: i, item: null });
      else if (hasItemArt(s)) {
        // Bộ hình từng mục vẽ lại cả bộ cho đồng bộ — nếu không đủ hạn mức thì bỏ cả bộ (trang về biểu tượng).
        const items = (s.items || []).map((it, k) => (it.image?.frame === 'art' ? k : -1)).filter((k) => k >= 0);
        if (out.redraw.length + items.length <= REVIEW_REDRAW_MAX) items.forEach((k) => out.redraw.push({ slide: i, item: k }));
        else {
          (s.items || []).forEach((it) => it.image?.frame === 'art' && delete it.image);
          out.dropped += 1;
        }
      }
    }
  }
  return out;
}

/* ---------------- đo độ vừa: trang phải co chữ nhiều → thử các kiểu trình bày khác, lấy kiểu vừa nhất ---------------- */
// Trang co dưới mức này (chữ còn < ~3/4 cỡ chuẩn) mới thử kiểu khác; chỉ đổi khi kiểu mới vừa hơn rõ rệt.
export const FIT_TIGHT = 0.78;
export const FIT_GAIN = 0.08;
export const FIT_MAX_TRIALS = 60;
const setVariant = (s, v) => (s.variant = v === VARIANTS[s.layout][0] ? '' : v);

/**
 * Các phép thử { slide, variant, noArt } cho trang đang phải co chữ nhiều (ks = hệ số co từng trang). Trang dày nhất được thử trước.
 * Trang có bộ hình 3D từng mục: thêm phép thử bỏ bộ hình (giữ kiểu đang dùng) — chỉ chọn khi không kiểu nào giữ hình mà vừa chữ.
 */
export function fitTrials(spec, ks, ratio = 16 / 9) {
  const out = [];
  const tight = spec.slides.map((s, i) => ({ i, k: Number(ks?.[i]) || 1 })).filter((x) => x.k < FIT_TIGHT).sort((a, b) => a.k - b.k);
  for (const { i } of tight) {
    const s = spec.slides[i];
    const list = altVariants(s, ratio).map((variant) => ({ slide: i, variant, noArt: false }));
    if (hasItemArt(s)) list.push({ slide: i, variant: resolveVariant(s, ratio) || VARIANTS[s.layout]?.[0] || '', noArt: true });
    if (out.length + list.length > FIT_MAX_TRIALS) continue;
    out.push(...list);
  }
  return out;
}
const dropItemArt = (s) => (s.items || []).forEach((it) => it.image?.frame === 'art' && delete it.image);

/** Bài thử: mỗi phép thử là 1 trang (cùng nội dung, kiểu trình bày khác) — đo một lượt cho mọi phép thử. */
export function fitProbe(spec, trials) {
  return {
    ...spec,
    slides: trials.map((t) => {
      const s = structuredClone(spec.slides[t.slide]);
      setVariant(s, t.variant);
      if (t.noArt) dropItemArt(s);
      return s;
    }),
  };
}

/**
 * Áp kết quả đo: trang đổi sang phép thử vừa nhất nếu hơn hiện trạng ít nhất FIT_GAIN; phép thử giữ hình vừa chữ (≥ FIT_TIGHT) được ưu tiên
 * hơn phép thử bỏ hình. Trả { changed, dropped } (số trang đổi, trong đó số trang bỏ bộ hình).
 */
export function applyFit(spec, ks, trials, trialKs) {
  const by = new Map();
  trials.forEach((t, n) => (by.get(t.slide) || by.set(t.slide, []).get(t.slide)).push({ ...t, k: Number(trialKs?.[n]) || 0 }));
  const out = { changed: 0, dropped: 0 };
  for (const [i, list] of by) {
    const cur = Number(ks[i]) || 1;
    const ok = list.filter((t) => t.k >= cur + FIT_GAIN).sort((a, b) => b.k - a.k);
    const pick = ok.find((t) => !t.noArt && t.k >= FIT_TIGHT) || ok[0];
    if (!pick) continue;
    setVariant(spec.slides[i], pick.variant);
    if (pick.noArt) dropItemArt(spec.slides[i]), (out.dropped += 1);
    out.changed += 1;
  }
  return out;
}
