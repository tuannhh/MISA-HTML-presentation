-- 2026-10-12: Xuất bản bài trình bày ra domain công khai (giống "Publish" của CMS).
--  * publications: tối đa 1 bản xuất bản/bài. Bản xuất bản là ẢNH CHỤP HTML tĩnh (tệp trong storage của bài, thư mục
--    tenants/<t>/presentations/<id>/published/<revision>/) — sửa bài sau đó KHÔNG đổi bản công khai tới khi "Cập nhật bản xuất bản".
--    code: 8 ký tự [a-z0-9] riêng của bản xuất bản (không dùng mã nội bộ của bài) → URL /<ten-bai>-<code>.
--    Gỡ xuất bản: status='unpublished', xoá tệp; xuất bản lại giữ nguyên code (link cũ dùng lại được).
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS publications (
  id              CHAR(36)     NOT NULL,
  presentation_id CHAR(36)     NOT NULL,
  tenant_id       CHAR(36)     NOT NULL,
  code            CHAR(8)      NOT NULL,
  slug            VARCHAR(120) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  status          ENUM('published','unpublished') NOT NULL,
  revision        CHAR(16)     NOT NULL,
  csp_nonce       CHAR(24)     NOT NULL,
  spec_version    INT UNSIGNED NOT NULL,
  published_by    CHAR(36)     NULL,
  published_at    DATETIME(3)  NOT NULL,
  unpublished_at  DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_publications_presentation (presentation_id),
  UNIQUE KEY uq_publications_code (code),
  KEY ix_publications_status (status, published_at),
  CONSTRAINT fk_publications_presentation FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE CASCADE,
  CONSTRAINT fk_publications_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_publications_publisher FOREIGN KEY (published_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261012_100000.sql');
