#!/usr/bin/env bash
# =============================================================
# Proofly · 兑换并发验收（《兑换码后台方案》约束二、切片 A1）
#
# 方案里写「两道防线缺一不可」，那就得真的并发跑一次才算数 ——
# 「逻辑上应该没问题」不是验收。这个脚本开 N 个独立连接同时兑同一
# 张码，看会不会超发。
#
# 用法（对一个测试库，**不要**对生产库）：
#   PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres \
#     PGDATABASE=proofly bash scripts/redeem-concurrency.sh
# =============================================================
set -u
PSQL="psql -X -q -t -A"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
want() { [ "$2" = "$3" ] && ok "$1（$3）" || bad "$1：要 $3，得 $2"; }

ADMIN='77777777-7777-7777-7777-777777777777'

# 造 $1 个用户 + 一张 max_uses=$2 的码，码面 $3
setup() {
  local n=$1 uses=$2 code=$3
  $PSQL >/dev/null <<SQL
delete from redeem_attempts;
delete from redeem_redemptions;
delete from redeem_codes;
delete from redeem_batches;
delete from entitlements where user_id::text like '9%';
delete from quota_counters where user_id::text like '9%';
delete from user_profiles  where user_id::text like '9%';
delete from auth.users     where id::text like '9%';
delete from auth.users     where id = '$ADMIN';
insert into auth.users (id, email) values ('$ADMIN','admin@test.local');
do \$\$
declare i int;
begin
  for i in 1..$n loop
    insert into auth.users (id, email)
    values (('9000000' || lpad(i::text, 1, '0') || '-0000-0000-0000-000000000000')::uuid,
            'u' || i || '@test.local');
  end loop;
end \$\$;
with b as (
  insert into redeem_batches
    (name, purpose, reason, credits_each, max_uses_each, code_count, created_by)
  values ('并发验收', 'internal_beta', '并发验收用', 200, $uses, 1, '$ADMIN')
  returning id
)
insert into redeem_codes (batch_id, code, credits, max_uses)
select id, '$code', 200, $uses from b;
SQL
}

uid() { echo "9000000$1-0000-0000-0000-000000000000"; }

# 同时兑：$1 = 参与的 user 序号列表（空格分隔），$2 = 码面
fire() {
  local code=$2 dir n=0; dir=$(mktemp -d)
  # 文件名用序号不用 user 序号：同一个人会出现多次（测「一个人并发点
  # 两下」），拿 user 序号当文件名会让它们互相覆盖，成功次数就数少了。
  for i in $1; do
    n=$((n+1))
    ( $PSQL -c "select pg_sleep(1); select redeem_code('$(uid "$i")'::uuid, '$code');" \
        >"$dir/$n.out" 2>"$dir/$n.err" ) &
  done
  wait
  cat "$dir"/*.out
  rm -rf "$dir"
}

echo "── 1 · 同一个人并发兑一张一次性码 ──"
setup 1 1 'PF-CONC-0001'
OUT=$(fire "1 1 1 1 1 1 1 1" 'PF-CONC-0001')
want "只成功一次"        "$(echo "$OUT" | grep -c '"ok" *: *true')"  1
# 数「失败了几次」而不是「几次是 ALREADY_USED_BY_ME」：A5 的失败限流
# 也在这条路径上，八个连接同时打时，后面几个可能读到已经攒起来的失败
# 计数而返回 RATE_LOCKED。谁在第几位是竞态决定的，钉死具体话术会让这
# 条断言变成偶发失败。要保证的是「只成功一次」，不是「输的那些怎么输」。
want "其余七次都没成功"  "$(echo "$OUT" | grep -c '"ok" *: *false')" 7
want "used_count"        "$($PSQL -c "select used_count from redeem_codes where code='PF-CONC-0001'")" 1
want "核销记录"          "$($PSQL -c "select count(*) from redeem_redemptions")" 1
want "额度记录"          "$($PSQL -c "select count(*) from entitlements where source='redeem'")" 1
want "余额"              "$($PSQL -c "select credits_available from quota_counters where user_id='$(uid 1)'")" 200

echo "── 2 · 十个人抢一张 max_uses=3 的码 ──"
setup 9 3 'PF-CONC-0002'
OUT=$(fire "1 2 3 4 5 6 7 8 9" 'PF-CONC-0002')
want "成功三次"          "$(echo "$OUT" | grep -c '"ok" *: *true')"  3
want "其余名额用完"      "$(echo "$OUT" | grep -c 'USED_UP')" 6
want "used_count 没抢穿" "$($PSQL -c "select used_count from redeem_codes where code='PF-CONC-0002'")" 3
want "核销记录三条"      "$($PSQL -c "select count(*) from redeem_redemptions")" 3
want "发出去 600 分"     "$($PSQL -c "select coalesce(sum(credits_total),0) from entitlements where source='redeem'")" 600

echo "── 3 · 五个人各点两次，抢 max_uses=4 ──"
setup 5 4 'PF-CONC-0003'
OUT=$(fire "1 1 2 2 3 3 4 4 5 5" 'PF-CONC-0003')
want "成功四次"          "$(echo "$OUT" | grep -c '"ok" *: *true')"  4
want "used_count"        "$($PSQL -c "select used_count from redeem_codes where code='PF-CONC-0003'")" 4
want "没人领到两份"      "$($PSQL -c "select count(*) from (select user_id from redeem_redemptions group by user_id having count(*)>1) x")" 0

echo "── 4 · 失败限流：5 次/小时，触顶锁 1 小时 ──"
setup 2 1 'PF-CONC-0005'
for i in 1 2 3 4 5; do
  $PSQL -c "select redeem_code('$(uid 1)'::uuid, 'PF-NOPE-000$i', 'ip-a')" >/dev/null
done
R6=$($PSQL -c "select redeem_code('$(uid 1)'::uuid, 'PF-CONC-0005', 'ip-a') ->> 'reason'")
want "第 6 次被锁"        "$R6" RATE_LOCKED
want "锁住时那张真码没被消耗" \
  "$($PSQL -c "select used_count from redeem_codes where code='PF-CONC-0005'")" 0
want "锁只锁自己，别人照兑" \
  "$($PSQL -c "select redeem_code('$(uid 2)'::uuid, 'PF-CONC-0005', 'ip-b') ->> 'ok'")" true
want "触顶那次也留了痕" \
  "$($PSQL -c "select count(*) from redeem_attempts where user_id='$(uid 1)' and reason='RATE_LOCKED'")" 1

echo "── 5 · 成功限流：10 次/天（正常用户不会超过 2 次）──"
$PSQL >/dev/null <<SQL
delete from redeem_attempts;
delete from redeem_redemptions;
delete from redeem_codes;
delete from redeem_batches;
delete from entitlements where user_id::text like '9%';
delete from quota_counters where user_id::text like '9%';
with b as (
  insert into redeem_batches
    (name, purpose, reason, credits_each, max_uses_each, code_count, created_by)
  values ('成功限流验收', 'internal_beta', '成功限流验收用', 10, 1, 11, '$ADMIN')
  returning id)
insert into redeem_codes (batch_id, code, credits, max_uses)
-- 码面必须是规范形状 PF-XXXX-XXXX：归一化只认 8 位码体，
-- 造一个 PF-D00-0000 这样 9 位的，兑的时候会被改写成别的字符串。
select b.id, 'PF-DAY0-00' || lpad(i::text, 2, '0'), 10, 1
  from b, generate_series(0, 10) i;
SQL
DAYOK=0
for i in 00 01 02 03 04 05 06 07 08 09; do
  [ "$($PSQL -c "select redeem_code('$(uid 1)'::uuid, 'PF-DAY0-00$i') ->> 'ok'")" = "true" ] \
    && DAYOK=$((DAYOK+1))
done
want "前十次都成功"      "$DAYOK" 10
want "第十一次被拦" \
  "$($PSQL -c "select redeem_code('$(uid 1)'::uuid, 'PF-DAY0-0010') ->> 'reason'")" RATE_DAILY

echo "── 6 · 守恒：额度总额 = 核销总额 = 余额总和 ──"
want "额度 vs 核销" \
  "$($PSQL -c "select (select coalesce(sum(credits_total),0) from entitlements where source='redeem') = (select coalesce(sum(credits),0) from redeem_redemptions)")" t
want "额度 vs 余额" \
  "$($PSQL -c "select (select coalesce(sum(credits_total),0) from entitlements where source='redeem') = (select coalesce(sum(credits_available),0) from quota_counters where user_id::text like '9%')")" t
want "没有孤儿额度" \
  "$($PSQL -c "select count(*) from entitlements e where e.source='redeem' and not exists (select 1 from redeem_redemptions r where r.entitlement_id = e.id)")" 0

echo "── 7 · 失败的那些一点痕迹都不留 ──"
setup 2 1 'PF-CONC-0004'
$PSQL -c "select redeem_code('$(uid 1)'::uuid,'PF-CONC-0004')" >/dev/null
$PSQL -c "select redeem_code('$(uid 2)'::uuid,'PF-CONC-0004')" >/dev/null
want "输的那个没有核销记录" "$($PSQL -c "select count(*) from redeem_redemptions where user_id='$(uid 2)'")" 0
want "输的那个没有额度"     "$($PSQL -c "select count(*) from entitlements where user_id='$(uid 2)'")" 0
want "输的那个余额为 0"     "$($PSQL -c "select coalesce((select credits_available from quota_counters where user_id='$(uid 2)'),0)")" 0

echo
echo "通过 $PASS · 失败 $FAIL"
[ "$FAIL" -eq 0 ]
