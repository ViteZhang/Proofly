-- =============================================================
-- Proofly · 30 免费原因增加 bundled
--
-- 上游：《商业化 C2》一、接入清单「方向评估 · 含 JD 拆解 + 匹配」
--
-- 有些模型调用不单独收费，因为它的成本已经并进了另一个动作的标价。
-- 典型是 JD 拆解：用户点的是「解析并评估 ⬡5」，拆解与匹配是同一个
-- 动作的两步，收两次 5 分就是欺负人。
--
-- 但它确实烧了 token，所以必须留痕 —— 记成 free_forever 会污染
-- 「永久免费 = 纯代码功能」这个语义，那是免费层价值感的落脚点，
-- 混进一个烧模型的动作，以后没人说得清哪些是真的零成本。
-- =============================================================

alter table usage_logs drop constraint if exists usage_logs_free_reason_check;
alter table usage_logs add constraint usage_logs_free_reason_check
  check (free_reason is null or free_reason in
    ('free_forever','free_quota','regen_window','budget_grace','bundled'));
