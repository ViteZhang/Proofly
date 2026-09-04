#!/usr/bin/env bash
# =============================================================
# Proofly · 计费并发验收（《商业化 C1》验收 9–11）
#
# 「逻辑上应该没问题」不算数，得真的并发跑。这个脚本开 N 个独立
# 连接同时调 hold_credits，看会不会超扣。
#
# 用法（对一个测试库，不要对生产库）：
#   PGHOST=... PGPORT=... PGUSER=postgres PGDATABASE=proofly \
#     bash scripts/billing-concurrency.sh
# =============================================================
set -u
U='88888888-8888-8888-8888-888888888888'
PSQL="psql -X -q -t -A"

setup() {  # $1 = 余额
  $PSQL <<SQL >/dev/null
delete from usage_logs where user_id='$U';
delete from credit_holds where user_id='$U';
delete from entitlements where user_id='$U';
delete from quota_counters where user_id='$U';
delete from user_profiles where user_id='$U';
delete from auth.users where id='$U';
insert into auth.users (id, email) values ('$U','concurrency@test.local');
select grant_credits('$U','purchase',$1);
SQL
}

# 同时发起 $1 笔、每笔 $2 分。各连接先睡 1 秒，等大家都连上再一起打。
# $4 = same：全部用同一个幂等 key
fire() {
  local n=$1 credits=$2 tag=$3 same=${4:-} ok=0 fail=0
  local dir; dir=$(mktemp -d)
  for i in $(seq 1 "$n"); do
    local key="$tag-$i"; [ "$same" = "same" ] && key="$tag"
    ( $PSQL -c "select pg_sleep(1); select hold_credits('$U','interview_kit',$credits,'$key');" \
        >"$dir/$i.out" 2>"$dir/$i.err"; echo $? > "$dir/$i.code" ) &
  done
  wait
  for i in $(seq 1 "$n"); do
    if [ "$(cat "$dir/$i.code")" = "0" ]; then ok=$((ok+1)); else fail=$((fail+1)); fi
  done
  echo "$ok $fail"
  rm -rf "$dir"
}

state() { $PSQL -c "select credits_available||' '||credits_held from quota_counters where user_id='$U';"; }
holds() { $PSQL -c "select count(*) from credit_holds where user_id='$U' and status='held';"; }

pass=0; failed=0
check() { # 标签 实际 期望
  if [ "$2" = "$3" ]; then echo "✓ $1"; pass=$((pass+1));
  else echo "✗ $1 — 期望 [$3]，实际 [$2]"; failed=$((failed+1)); fi
}

echo "== 验收 9 · 余额 10，两个各需 8 分的 HOLD 同时打 =="
setup 10
read -r ok fail <<< "$(fire 2 8 c9)"
check "只有一个成功" "$ok/$fail" "1/1"
check "余额剩 2、预扣 8" "$(state)" "2 8"

echo "== 验收 10 · 余额 100，10 个各 10 分同时打 =="
setup 100
read -r ok fail <<< "$(fire 10 10 c10)"
check "全部成功" "$ok/$fail" "10/0"
check "余额精确为 0" "$(state)" "0 100"
check "十条 hold 都在" "$(holds)" "10"

echo "== 验收 11 · 余额 100，11 个各 10 分同时打 =="
setup 100
read -r ok fail <<< "$(fire 11 10 c11)"
check "10 成功 1 失败" "$ok/$fail" "10/1"
check "余额为 0，不出负数" "$(state)" "0 100"
check "只产生十条 hold" "$(holds)" "10"

echo "== 验收 8 补充 · 五个同幂等 key 并发（重复点击）=="
setup 100
read -r ok fail <<< "$(fire 5 10 c8 same)"
check "五个全部返回成功" "$ok/$fail" "5/0"
check "只扣了一次" "$(state)" "90 10"
check "只产生一条 hold" "$(holds)" "1"

# C3 验收 32（两个人同时兑同一张 max_uses=1 的码）挪走了。
#
# 兑换码在后台 A0 里从一张表扩成三张，这段脚本跟着就跑不动了；而更该
# 说的是，它本来就只覆盖了两个连接。现在那组断言在
# scripts/redeem-concurrency.sh 里，26 条，还多了失败限流与成功限流。
#
#   pnpm redeem:concurrency

echo
echo "通过 $pass 条，失败 $failed 条"
[ "$failed" -eq 0 ]
