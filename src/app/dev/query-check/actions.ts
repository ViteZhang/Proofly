"use server";

// =============================================================
// 仅供切片 1.1 停下点核对数据形状用的开发工具。
// Step 0 没有留下测试数据，这里灌一批带「样例」前缀的假数据，
// 好让筛选 / 分组 / 父子 / 证明度推导有东西可点。
// 交付物清单要求的六条精选经历仍然要手工录入，不走这里。
// 本页与本文件在切片 1.7 收尾时一并删除。
// =============================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/domain";

const PREFIX = "样例 · ";

export async function seedDemoAtoms(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("先登录");

  // 在职任职：一条已上线、有实测结果指标 → measured
  const { data: a, error: ea } = await supabase
    .from("atoms")
    .insert({
      title: `${PREFIX}AI 作业点评`,
      context: "employment",
      org: "样例科技",
      role: "产品负责人",
      period_start: "2024-03-01",
      status: "shipped",
      situation: "教师批改作业耗时长，反馈周期以天计。",
      task: "把点评环节做成可自动生成、教师只做终审的流程。",
      actions: ["拆解批改流程", "设计点评模板", "灰度到三个年级"],
      sort_order: 0,
    })
    .select("id")
    .single();
  if (ea) return fail(`灌样例失败：${ea.message}`);

  // 在职任职：开发中、只有交付物指标 → designed_only（用来验「交付物不提升证明度」）
  const { data: b, error: eb } = await supabase
    .from("atoms")
    .insert({
      title: `${PREFIX}AI 成长陪伴助手`,
      context: "employment",
      org: "样例科技",
      role: "产品负责人",
      period_start: "2025-01-01",
      status: "in_dev",
      situation: "家长看不到孩子的长期变化。",
      task: "做一个能长期跟随、按阶段给建议的助手。",
      actions: ["定义成长阶段模型", "设计对话护栏"],
      pending_metrics: [
        { id: "seed-p1", name: "日活渗透率", note: null },
        { id: "seed-p2", name: "七日留存", note: null },
      ],
      sort_order: 1,
    })
    .select("id")
    .single();
  if (eb) return fail(`灌样例失败：${eb.message}`);

  const { error: ec } = await supabase.from("atoms").insert([
    {
      title: `${PREFIX}打招呼智能体`,
      parent_id: b.id,
      level: "capability_slice",
      context: "employment",
      org: "样例科技",
      status: "in_dev",
      sort_order: 0,
    },
    {
      title: `${PREFIX}Multi-Agent 意图路由`,
      parent_id: b.id,
      level: "capability_slice",
      context: "employment",
      org: "样例科技",
      status: "in_dev",
      sort_order: 1,
    },
  ]);
  if (ec) return fail(`灌样例失败：${ec.message}`);

  // 个人项目
  const { error: ed } = await supabase.from("atoms").insert({
    title: `${PREFIX}知识宇宙`,
    context: "side_project",
    status: "in_dev",
    period_start: "2025-05-01",
    pending_metrics: [{ id: "seed-p3", name: "月活", note: null }],
    sort_order: 0,
  });
  if (ed) return fail(`灌样例失败：${ed.message}`);

  // 已结束的任职 → 过往经历分组，无任何指标 → absent
  const { error: ee } = await supabase.from("atoms").insert({
    title: `${PREFIX}Java 研发`,
    context: "employment",
    org: "样例信息",
    role: "研发工程师",
    period_start: "2018-07-01",
    period_end: "2021-06-30",
    status: "shipped",
    sort_order: 0,
  });
  if (ee) return fail(`灌样例失败：${ee.message}`);

  // 指标：A 两条实测结果指标；B 一条实测交付物（不应提升 B 的证明度）
  const { error: em } = await supabase.from("metrics").insert([
    {
      atom_id: a.id,
      name: "教师批改耗时",
      kind: "outcome",
      from_value: "40 分钟",
      to_value: "10 分钟",
      delta: "-75%",
      evidence_level: "measured",
      method: "抽样 30 位教师，连续两周计时对比。",
    },
    {
      atom_id: a.id,
      name: "点评采纳率",
      kind: "outcome",
      delta: "82%",
      evidence_level: "measured",
      method: "教师终审时未修改即通过的比例。",
    },
    {
      atom_id: b.id,
      name: "设计文档",
      kind: "output",
      delta: "4 份",
      evidence_level: "measured",
      method: "含阶段模型、对话护栏、路由规则、评测方案。",
    },
  ]);
  if (em) return fail(`灌样例失败：${em.message}`);

  // 技能：一个关联到实测经历（strong），一个只关联开发中经历（weak）
  const { data: skills, error: es } = await supabase
    .from("skills")
    .insert([{ label: `${PREFIX}LLM 效果评估` }, { label: `${PREFIX}对话产品设计` }])
    .select("id,label");
  if (es) return fail(`灌样例失败：${es.message}`);

  const strong = skills.find((s) => s.label.includes("效果评估"));
  const weak = skills.find((s) => s.label.includes("产品设计"));
  const { error: el } = await supabase.from("atom_skills").insert([
    { atom_id: a.id, skill_id: strong!.id },
    { atom_id: b.id, skill_id: weak!.id },
  ]);
  if (el) return fail(`灌样例失败：${el.message}`);

  // 叙事护栏挂在 B 上
  const { error: eg } = await supabase.from("guards").insert({
    atom_id: b.id,
    must_say: ["我负责的是产品定义与效果验收", "阶段模型是我提出并落地的"],
    never_say: ["独立开发", "从 0 到 1 全是我做的"],
    role_framing: "产品负责人，带一个 4 人小组",
    probes: [{ q: "这个阶段模型怎么验证的？", a_outline: "先做专家评审，再灰度对照。" }],
  });
  if (eg) return fail(`灌样例失败：${eg.message}`);

  revalidatePath("/dev/query-check");
  revalidatePath("/library");
  revalidatePath("/");
  return ok({ created: 6 });
}

export async function clearDemoAtoms(): Promise<ActionResult<{ removed: number }>> {
  const supabase = await createClient();

  // 子项由外键 cascade 删掉，这里只删顶层匹配到的即可。
  const { data, error } = await supabase
    .from("atoms")
    .delete()
    .like("title", `${PREFIX}%`)
    .select("id");
  if (error) return fail(`清样例失败：${error.message}`);

  await supabase.from("skills").delete().like("label", `${PREFIX}%`);

  revalidatePath("/dev/query-check");
  revalidatePath("/library");
  revalidatePath("/");
  return ok({ removed: data?.length ?? 0 });
}
