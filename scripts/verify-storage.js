// Kiểm tra toàn vẹn DB ↔ tệp (Gate DevOps — sau khôi phục backup, hoặc định kỳ): mọi asset / ảnh mẫu / bản xuất bản đang hiện
// trong DB phải có tệp trên đĩa. Chỉ ĐỌC, không sửa gì. Thoát 0 khi đủ, 1 khi thiếu (in số lượng + tối đa 20 mã thiếu, không in nội dung).
//   docker compose exec -T app node scripts/verify-storage.js
import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { createPool } from '../src/db/pool.js';
import { publishedDir } from '../src/services/publicationService.js';

const config = loadConfig();
const pool = createPool(config.db);
const root = path.resolve(config.storage.privateDir);
const exists = (key) => access(path.resolve(root, key)).then(() => true, () => false);

async function check(label, rows, keyOf) {
  const missing = [];
  // Kiểm song song theo lô nhỏ — tránh mở quá nhiều file handle trên volume lớn.
  for (let i = 0; i < rows.length; i += 64) {
    const part = rows.slice(i, i + 64);
    const ok = await Promise.all(part.map((r) => exists(keyOf(r))));
    ok.forEach((v, k) => !v && missing.push(part[k].id));
  }
  console.log(`${label}: ${rows.length} dòng, thiếu tệp ${missing.length}${missing.length ? ` (vd. ${missing.slice(0, 20).join(', ')})` : ''}`);
  return missing.length;
}

try {
  const [[{ users }]] = await pool.query('SELECT COUNT(*) AS users FROM users');
  const [[{ decks }]] = await pool.query('SELECT COUNT(*) AS decks FROM presentations');
  console.log(`Người dùng: ${users} · Bài trình bày: ${decks}`);
  const [assets] = await pool.query('SELECT id, storage_key FROM assets');
  const [tpl] = await pool.query('SELECT id, storage_key FROM template_assets');
  const [pubs] = await pool.query("SELECT id, tenant_id, presentation_id, revision FROM publications WHERE status = 'published'");
  let bad = 0;
  bad += await check('Asset bài trình bày', assets, (r) => r.storage_key);
  bad += await check('Ảnh mẫu thiết kế', tpl, (r) => r.storage_key);
  bad += await check('Bản xuất bản đang hiện', pubs, (r) => `${publishedDir(r.tenant_id, r.presentation_id, r.revision)}/index.html`);
  console.log(bad ? `KẾT QUẢ: THIẾU ${bad} tệp` : 'KẾT QUẢ: ĐỦ — DB và tệp khớp');
  process.exitCode = bad ? 1 : 0;
} finally {
  await pool.end();
}
