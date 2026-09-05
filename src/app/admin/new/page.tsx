import { NewBatchForm } from "@/components/admin/NewBatchForm";
import { PageHead } from "@/components/admin/ui";

export default function NewBatchPage() {
  return (
    <>
      <PageHead
        title="新建批次"
        back={{ href: "/admin/batches", label: "批次" }}
        desc="右侧的成本上限会随参数实时变。它在你点「生成」之前就出现，不是在之后。"
      />
      <NewBatchForm />
    </>
  );
}
