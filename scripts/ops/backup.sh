#!/usr/bin/env bash
# Sao lưu DB + tệp CÙNG MỘT LẦN (Gate DevOps — docs/RUNBOOK.md §Sao lưu): chạy trên máy chủ, cạnh docker-compose.yml.
#   scripts/ops/backup.sh /srv/backup/misa-presentation            # stack mặc định
#   PROJECT=mp-load COMPOSE_FILES="-f docker-compose.yml -f deploy/loadtest/docker-compose.loadtest.yml" scripts/ops/backup.sh <thư mục>
# Thứ tự: (1) DB bằng mysqldump --single-transaction (ảnh chụp nhất quán, không khoá ghi) → (2) tệp private (asset, mẫu, bản xuất bản)
# → (3) SHA256SUMS. DB chụp TRƯỚC tệp: tệp mới ghi trong lúc sao lưu chỉ thừa (vô hại); tệp bị xoá trong khoảng đó có thể thiếu —
# verify-storage.js sau khôi phục sẽ báo (thực tế rất hiếm). Mật khẩu DB đọc trong container, không đi qua dòng lệnh máy chủ.
# Git Bash (Windows) tự đổi đường dẫn kiểu /data trong tham số — tắt để chạy giống Linux.
export MSYS_NO_PATHCONV=1
set -euo pipefail
OUT_ROOT=${1:?Cách dùng: scripts/ops/backup.sh <thư mục đích>}
PROJECT=${PROJECT:-misa-presentation}
# shellcheck disable=SC2086
compose() { docker compose -p "$PROJECT" ${COMPOSE_FILES:-} "$@"; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR="$OUT_ROOT/$STAMP"
mkdir -p "$DIR"
started=$(date +%s)

compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --triggers --set-gtid-purged=OFF --no-tablespaces --databases "$MYSQL_DATABASE" 2>/dev/null' | gzip -6 > "$DIR/db.sql.gz"
# Kiểm dump hoàn chỉnh (mysqldump ghi dòng kết thúc khi xong).
gunzip -c "$DIR/db.sql.gz" | tail -n 1 | grep -q 'Dump completed' || { echo "LỖI: dump DB không hoàn chỉnh" >&2; exit 1; }
db_done=$(date +%s)

# Chỉ thư mục private (asset/mẫu/xuất bản). temp/uploads là tệp tạm — không sao lưu.
compose exec -T app tar -C /data/storage -czf - private > "$DIR/storage.tgz"
(cd "$DIR" && sha256sum db.sql.gz storage.tgz > SHA256SUMS)
end=$(date +%s)
{
  echo "stamp=$STAMP"
  echo "project=$PROJECT"
  echo "db_seconds=$((db_done - started))"
  echo "storage_seconds=$((end - db_done))"
  echo "db_bytes=$(wc -c < "$DIR/db.sql.gz")"
  echo "storage_bytes=$(wc -c < "$DIR/storage.tgz")"
} > "$DIR/MANIFEST"
cat "$DIR/MANIFEST"
echo "Đã sao lưu: $DIR"
