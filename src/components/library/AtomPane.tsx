"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createAtom } from "@/app/(app)/library/actions";
import type { AtomDetail as Detail } from "@/lib/queries/atoms";
import { AtomEditForm } from "./AtomEditForm";
import { AtomReadView } from "./AtomReadView";

// 只读态 ⇄ 编辑态的开关。就地切换，不弹窗。
// 页面用 key={detail.id} 挂载它，所以换一条经历时编辑态自然重置。
export function AtomPane({
  detail,
  projects,
}: {
  detail: Detail;
  projects: { id: string; title: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 新建之后带 ?edit=1 过来，直接进编辑态——不然拿到的是一条没法填的「未命名经历」
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");

  // 保存成功到服务端把新数据发回来，中间隔着一次往返。这期间不能退回只读态，
  // 否则会闪半秒旧值，看着像没保存上。detail 换了新对象就说明数据到了。
  const [seen, setSeen] = useState(detail);
  const [settling, setSettling] = useState(false);
  if (seen !== detail) {
    setSeen(detail);
    if (settling) setSettling(false);
  }
  const [adding, startAdd] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);

  function leaveEdit() {
    setEditing(false);
    if (searchParams.get("edit")) {
      router.replace(`/library?atom=${detail.id}`, { scroll: false });
    }
  }

  function afterSave() {
    setSettling(true);
    // 兜底：万一那次刷新没回来，也不能把人锁在编辑态里
    setTimeout(() => setSettling(false), 5000);
    leaveEdit();
  }

  function addSlice() {
    setAddError(null);
    startAdd(async () => {
      const res = await createAtom({
        title: "未命名能力点",
        level: "capability_slice",
        parent_id: detail.id,
        // 能力点跟着所属经历走，省得每条都重填一遍
        context: detail.context,
        org: detail.org,
        role: null,
        period_start: null,
        period_end: null,
        status: detail.status,
        situation: null,
        task: null,
        actions: [],
        sort_order: detail.children.length,
      });
      if (res.ok) router.push(`/library?atom=${res.data.id}&edit=1`, { scroll: false });
      else setAddError(res.error);
    });
  }

  if (editing || settling) {
    return (
      <AtomEditForm
        atom={detail}
        projects={projects}
        settling={settling}
        onSaved={afterSave}
        onCancel={() => {
          setSettling(false);
          leaveEdit();
        }}
        onDeleted={() => router.replace("/library", { scroll: false })}
      />
    );
  }

  return (
    <>
      <AtomReadView
        atom={detail}
        onEdit={() => setEditing(true)}
        onAddSlice={addSlice}
        addingSlice={adding}
      />
      {addError && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {addError}
        </p>
      )}
    </>
  );
}
