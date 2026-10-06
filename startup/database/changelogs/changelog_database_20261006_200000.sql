-- 2026-10-06: Bộ nhận diện thương hiệu + mẫu thiết kế dùng lại.
--  * assets.kind thêm 'brand': ảnh nền trang bìa/nội dung/mở đầu phần/kết, dải đầu & chân trang (độ phân giải cao, giữ nền trong suốt).
--  * design_templates: mẫu thiết kế (tông màu, nền, phông, logo, bộ nhận diện) người dùng lưu lại để áp cho bài khác.
--    Riêng tư (chỉ chủ) hoặc công khai (mọi người dùng áp được, chỉ chủ sửa/xoá).
--  * template_assets: ảnh của mẫu (bản sao riêng — áp mẫu vào bài thì sao chép tiếp sang asset của bài, không dùng chung tệp).
-- Idempotent: MODIFY chỉ khi ENUM chưa có 'brand'; CREATE TABLE IF NOT EXISTS.

SET @has_brand := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'kind' AND COLUMN_TYPE LIKE '%''brand''%');
SET @sql := IF(@has_brand = 0,
  'ALTER TABLE assets MODIFY COLUMN kind ENUM(''image'',''thumbnail'',''video'',''logo'',''poster'',''brand'') NOT NULL DEFAULT ''image''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS design_templates (
  id          CHAR(36)      NOT NULL,
  tenant_id   CHAR(36)      NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  visibility  ENUM('private','public') NOT NULL DEFAULT 'private',
  -- { theme, palette, background, font, logo, brand, style } — mã asset trỏ tới template_assets của chính mẫu.
  design      JSON          NOT NULL,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_design_templates_tenant (tenant_id, updated_at),
  KEY ix_design_templates_public (visibility, updated_at),
  CONSTRAINT fk_design_templates_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS template_assets (
  id            CHAR(36)      NOT NULL,
  tenant_id     CHAR(36)      NOT NULL,
  template_id   CHAR(36)      NOT NULL,
  kind          ENUM('logo','brand','image') NOT NULL,
  mime          VARCHAR(80)   NOT NULL,
  bytes         INT UNSIGNED  NOT NULL,
  width         SMALLINT UNSIGNED NULL,
  height        SMALLINT UNSIGNED NULL,
  storage_key   VARCHAR(255)  NOT NULL,
  original_name VARCHAR(255)  NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_template_assets_template (template_id),
  CONSTRAINT fk_template_assets_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_template_assets_template FOREIGN KEY (template_id) REFERENCES design_templates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261006_200000.sql');
