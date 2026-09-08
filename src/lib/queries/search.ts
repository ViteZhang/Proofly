// =============================================================
// Proofly · 全局搜索索引的读取
// 形状与分组顺序在 lib/search/types，那份不连库，过滤逻辑才好单测。
// =============================================================

import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, type SearchItem } from "@/lib/search/types";

export type { SearchItem, SearchKind } from "@/lib/search/types";
export { KIND_LABEL, KIND_ORDER, SEMANTIC_THRESHOLD } from "@/lib/search/types";

export async function loadSearchIndex(): Promise<SearchItem[]> {
  const supabase = await createClient();

  const [atomsQ, skillsQ, tasksQ, eduQ, credQ] = await Promise.all([
    supabase
      .from("atoms")
      .select("id,title,org,role,level,evidence_level")
      .order("updated_at", { ascending: false }),
    supabase.from("skills").select("id,label,category,evidence_strength"),
    // 已经做完的行动不进索引：搜索是用来「找现在要处理的东西」的。
    supabase.from("tasks").select("id,title,action_type,status").neq("status", "done"),
    supabase.from("educations").select("id,school,major,degree"),
    supabase.from("credentials").select("id,name,issuer,level,kind"),
  ]);

  const out: SearchItem[] = [];

  for (const a of atomsQ.data ?? []) {
    out.push({
      id: a.id,
      kind: a.level === "capability_slice" ? "slice" : "atom",
      title: a.title,
      subtitle: [a.org, a.role].filter(Boolean).join(" · ") || "没填公司",
      proof: a.evidence_level,
      route: `/app/library?atom=${a.id}`,
    });
  }

  for (const s of skillsQ.data ?? []) {
    out.push({
      id: s.id,
      kind: "skill",
      title: s.label,
      subtitle: s.category ?? "技能",
      proof: null,
      route: `/app/library?skill=${encodeURIComponent(s.label)}`,
    });
  }

  for (const t of tasksQ.data ?? []) {
    out.push({
      id: t.id,
      kind: "task",
      title: t.title,
      subtitle: t.status === "doing" ? "进行中" : "待办",
      proof: null,
      route: `/app/actions?task=${t.id}`,
    });
  }

  for (const e of eduQ.data ?? []) {
    out.push({
      id: e.id,
      kind: "education",
      title: e.school,
      subtitle: e.major ?? "学历",
      proof: null,
      route: "/app/profile#education",
    });
  }

  for (const c of credQ.data ?? []) {
    out.push({
      id: c.id,
      kind: "credential",
      title: [c.name, c.level].filter(Boolean).join(" · "),
      subtitle: c.issuer ?? KIND_LABEL.credential,
      proof: null,
      route: "/app/profile#credential",
    });
  }

  return out;
}
