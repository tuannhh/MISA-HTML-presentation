#!/usr/bin/env bash
# Kiểm tra sức khoẻ để gắn vào giám sát/cron (Gate DevOps — docs/RUNBOOK.md §Cảnh báo). Kiểu Nagios: 0 OK, 1 WARN, 2 CRIT.
#   APP_URL=http://127.0.0.1:8080 scripts/ops/check.sh
# Kiểm: app sống + DB sẵn sàng (/api/health/ready), hàng đợi AI (đầy / job chờ lâu / job chạy quá lâu), dung lượng đĩa volume
# tệp + MySQL, RAM container app. Ngưỡng đổi bằng biến môi trường (mặc định theo số đo tải — xem docs/LOAD-TEST.md).
# Git Bash (Windows) tự đổi đường dẫn kiểu /data trong tham số — tắt để chạy giống Linux.
export MSYS_NO_PATHCONV=1
set -uo pipefail
APP_URL=${APP_URL:-http://127.0.0.1:8080}
PROJECT=${PROJECT:-misa-presentation}
QUEUE_WARN=${QUEUE_WARN:-15}            # active+pending (trần 22 = 2 chạy + 20 chờ)
WAIT_WARN_SEC=${WAIT_WARN_SEC:-600}     # job chờ lâu nhất
RUN_CRIT_SEC=${RUN_CRIT_SEC:-1200}      # job chạy lâu nhất (AI treo; hạn Gemini 240s × retry)
DISK_WARN_PCT=${DISK_WARN_PCT:-80}
DISK_CRIT_PCT=${DISK_CRIT_PCT:-90}
MEM_WARN_PCT=${MEM_WARN_PCT:-85}
RENDER_WARN=${RENDER_WARN:-8}           # lượt chờ trình duyệt (PDF/ảnh bìa); trần xuất PDF 10
THUMB_WARN=${THUMB_WARN:-200}           # bài chờ chụp ảnh bìa (việc nền, gộp theo bài)
status=0
out() { echo "$1 $2"; [ "$1" = CRIT ] && status=2; [ "$1" = WARN ] && [ $status -lt 1 ] && status=1; }
num() { sed -n "s/.*\"$1\":\([0-9.]*\).*/\1/p" | head -n1; }

ready=$(curl -s -m 5 "$APP_URL/api/health/ready") || ready=""
if ! echo "$ready" | grep -q '"status":"ready"'; then
  out CRIT "app/DB chưa sẵn sàng: ${ready:-không phản hồi}"
else
  active=$(echo "$ready" | num active); pending=$(echo "$ready" | num pending)
  wait=$(echo "$ready" | num oldestWaitSec); run=$(echo "$ready" | num longestRunSec)
  q=$(( ${active:-0} + ${pending:-0} ))
  if [ "$q" -ge 22 ]; then out CRIT "hàng đợi AI đầy ($q/22) — người dùng đang nhận QUEUE_FULL"
  elif [ "$q" -ge "$QUEUE_WARN" ]; then out WARN "hàng đợi AI cao ($q/22)"
  else out OK "hàng đợi AI $q/22"; fi
  [ "${wait:-0}" -ge "$WAIT_WARN_SEC" ] && out WARN "job AI chờ lâu nhất ${wait}s"
  [ "${run:-0}" -ge "$RUN_CRIT_SEC" ] && out CRIT "job AI chạy ${run}s — có thể treo (xem log gemini_*)"
  render=$(echo "$ready" | num renderPending); thumbs=$(echo "$ready" | num thumbnailsPending)
  [ "${render:-0}" -ge "$RENDER_WARN" ] && out WARN "hàng trình duyệt ${render} lượt chờ — xuất PDF sắp nhận QUEUE_FULL"
  [ "${thumbs:-0}" -ge "$THUMB_WARN" ] && out WARN "${thumbs} bài chờ ảnh bìa — trình duyệt không theo kịp"
fi

for svc in app:/data mysql:/var/lib/mysql; do
  name=${svc%%:*}; dir=${svc#*:}
  pct=$(docker compose -p "$PROJECT" exec -T "$name" df -P "$dir" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
  if [ -z "$pct" ]; then out CRIT "không đọc được dung lượng đĩa $name"
  elif [ "$pct" -ge "$DISK_CRIT_PCT" ]; then out CRIT "đĩa $name $dir ${pct}%"
  elif [ "$pct" -ge "$DISK_WARN_PCT" ]; then out WARN "đĩa $name $dir ${pct}%"
  else out OK "đĩa $name ${pct}%"; fi
done

mem=$(docker stats --no-stream --format '{{.MemPerc}}' "$(docker compose -p "$PROJECT" ps -q app)" 2>/dev/null | tr -d '%' | cut -d. -f1)
if [ -n "$mem" ] && [ "$mem" -ge "$MEM_WARN_PCT" ]; then out WARN "RAM app ${mem}% giới hạn container"; elif [ -n "$mem" ]; then out OK "RAM app ${mem}%"; fi
exit $status
