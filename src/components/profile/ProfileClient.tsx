"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Credential, Education, Employment } from "@/lib/queries/profile";
import type { ProfileEntity } from "@/app/app/profile/actions";
import { CredentialDrawer } from "./CredentialDrawer";
import { CredentialSection } from "./CredentialSection";
import { DeleteConfirm } from "./DeleteConfirm";
import { EducationDrawer } from "./EducationDrawer";
import { EducationSection } from "./EducationSection";
import { EmploymentDrawer } from "./EmploymentDrawer";
import { EmploymentSection } from "./EmploymentSection";
import { BackfillButton } from "./BackfillButton";
import { IdentityEditor } from "./IdentityEditor";
import type { ProfileFact } from "@/lib/queries/facts";

type Editing<T> = T | null | undefined; // undefined=关着，null=新增，T=改这条
type Doomed = { entity: ProfileEntity; id: string; name: string } | null;

/**
 * 四个区块的编辑状态集中在这一层。
 *
 * 三个抽屉都用 key 强制重挂：抽屉里的字段是 useState 初始化的，改完 A 再
 * 点 B 如果复用同一个实例，看到的会是 A 的内容。
 */
export function ProfileClient({
  facts,
  educations,
  employments,
  credentials,
}: {
  facts: ProfileFact[];
  educations: Education[];
  employments: Employment[];
  credentials: Credential[];
}) {
  const [edu, setEdu] = useState<Editing<Education>>(undefined);
  const [emp, setEmp] = useState<Editing<Employment>>(undefined);
  const [cred, setCred] = useState<Editing<Credential>>(undefined);
  const [doomed, setDoomed] = useState<Doomed>(null);

  const add = (onClick: () => void) => (
    <Button size="sm" onClick={onClick}>
      ＋ 新增
    </Button>
  );

  const rowButtons = (onEdit: () => void, onDelete: () => void) => (
    <>
      <Button size="sm" variant="text" onClick={onEdit}>
        编辑
      </Button>
      <Button size="sm" variant="text" className="!text-[var(--danger)]" onClick={onDelete}>
        删除
      </Button>
    </>
  );

  return (
    <>
      <IdentityEditor facts={facts} />

      <EducationSection
        items={educations}
        action={add(() => setEdu(null))}
        rowActions={(e) =>
          rowButtons(
            () => setEdu(e),
            () => setDoomed({ entity: "education", id: e.id, name: e.school }),
          )
        }
      />

      <EmploymentSection
        items={employments}
        action={
          <div className="flex gap-2">
            {/* 空的时候标题旁不重复放一个：那时候整个空态就是这个按钮 */}
            {employments.length > 0 && <BackfillButton compact />}
            {add(() => setEmp(null))}
          </div>
        }
        backfill={<BackfillButton />}
        rowActions={(e) =>
          rowButtons(
            () => setEmp(e),
            () => setDoomed({ entity: "employment", id: e.id, name: e.org }),
          )
        }
      />

      <CredentialSection
        items={credentials}
        action={add(() => setCred(null))}
        rowActions={(c) =>
          rowButtons(
            () => setCred(c),
            () => setDoomed({ entity: "credential", id: c.id, name: c.name }),
          )
        }
      />

      <EducationDrawer key={`edu-${edu?.id ?? "new"}`} item={edu} onClose={() => setEdu(undefined)} />
      <EmploymentDrawer key={`emp-${emp?.id ?? "new"}`} item={emp} onClose={() => setEmp(undefined)} />
      <CredentialDrawer key={`cred-${cred?.id ?? "new"}`} item={cred} onClose={() => setCred(undefined)} />

      {doomed && (
        <DeleteConfirm
          entity={doomed.entity}
          id={doomed.id}
          name={doomed.name}
          onClose={() => setDoomed(null)}
        />
      )}
    </>
  );
}
