#!/usr/bin/env bash
# 로컬 테스트 사이트 회귀 테스트 전체 실행 (외부망 불필요). 약 5~6분.
# 사용: bash spike/harness/run_local.sh            → 하나라도 실패하면 종료 코드 1
#       EXT=다른/빌드/폴더 bash spike/harness/run_local.sh   (다른 익스텐션 빌드 검사)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${WC_OUT:-$HERE/../out}"
mkdir -p "$OUT"; rm -f "$OUT/reports.jsonl"
python3 "$HERE/boot.py" || { echo "boot 실패"; exit 2; }
FAILED=()
for t in t_core t_edge1 t_edge4 t_edge6 t_edge8 t_edge9 t_sel_final t_handle; do
  echo "=================== $t"
  timeout 300 python3 "$HERE/$t.py"
  rc=$?
  [ $rc -ne 0 ] && FAILED+=("$t(rc=$rc)")
done
echo "=================== 요약"
if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL PASS"; else echo "FAILED: ${FAILED[*]}"; exit 1; fi
