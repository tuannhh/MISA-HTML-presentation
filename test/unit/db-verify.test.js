// F14: verifyTables phải đòi đủ bảng mà code dùng (kể cả mẫu thiết kế) và changelog bắt buộc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTables } from '../../src/db/pool.js';

const ALL = ['users', 'presentations', 'assets', 'presentation_shares', 'presentation_versions', 'design_templates', 'template_assets', 'publications', 'sessions', 'audit_logs', 'schema_changelog'];
const CHANGELOGS = ['changelog_database_20261005_170000.sql', 'changelog_database_20261006_090000.sql', 'changelog_database_20261006_200000.sql', 'changelog_database_20261007_100000.sql', 'changelog_database_20261012_100000.sql'];
const fakePool = (tables, changelogs = CHANGELOGS) => ({
  async query(sql) {
    if (/INFORMATION_SCHEMA/.test(sql)) return [tables.map((name) => ({ name }))];
    return [changelogs.map((name) => ({ name }))];
  },
});

test('F14: thiếu bảng mẫu thiết kế → không khởi động, nêu đúng tên bảng', async () => {
  await assert.rejects(verifyTables(fakePool(ALL.filter((t) => !t.startsWith('template_') && t !== 'design_templates'))), /design_templates, template_assets/);
});

test('F14: đủ bảng + changelog → qua; thiếu changelog → báo tên tệp', async () => {
  await verifyTables(fakePool(ALL));
  await assert.rejects(verifyTables(fakePool(ALL, CHANGELOGS.slice(0, 3))), /changelog_database_20261007_100000/);
});

test('Xuất bản ra web: thiếu bảng publications / changelog 20261012 → không khởi động, nêu đúng tên', async () => {
  await assert.rejects(verifyTables(fakePool(ALL.filter((t) => t !== 'publications'))), /publications/);
  await assert.rejects(verifyTables(fakePool(ALL, CHANGELOGS.slice(0, 4))), /changelog_database_20261012_100000/);
});
