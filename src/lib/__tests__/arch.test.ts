// =============================================================
// Proofly · 架构边界单测
//
//   pnpm arch:test
//
// 熔断是安全机制，计费是商业机制。两者一旦互相渗透，日后改一边
// 会意外影响另一边 —— 比如为了省钱把熔断阈值调松，或者为了绕过
// 熔断去读余额。所以在代码层面钉死：两个目录互不 import。
//
// 《商业化技术方案 v1.0》第 5 节把 withCredits 列为唯一允许的交汇点。
// 实际实现连这个例外都没用上：billing 不认识 llm，token 数由调用方
// 通过 ctx.report() 交回来。所以这里两个方向都测严格版。
//
// 上游：《商业化 C1》切片 C1.7、硬规则 2.4
// =============================================================

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LIB = path.resolve(import.meta.dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** 找出 `from "@/lib/<area>"` 这类引用，注释里的不算。 */
function importsOf(file: string, area: string): boolean {
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const re = new RegExp(`from\\s+["'](@/lib/${area}|\\.{1,2}/.*${area})[/"']`);
  return re.test(src);
}

test("llm 不认识 billing", () => {
  const bad = walk(path.join(LIB, "llm")).filter((f) => importsOf(f, "billing"));
  assert.deepEqual(
    bad.map((f) => path.relative(LIB, f)),
    [],
    "熔断层引用了计费层：为省钱调松熔断，或为绕熔断去读余额，都从这一行开始",
  );
});

test("billing 不认识 llm", () => {
  const bad = walk(path.join(LIB, "billing")).filter((f) => importsOf(f, "llm"));
  assert.deepEqual(
    bad.map((f) => path.relative(LIB, f)),
    [],
    "计费层引用了熔断层：token 数应当由调用方 ctx.report() 交回来",
  );
});

test("分值只从 config/plan 来，别处不许写死", () => {
  // 计费目录里出现 15 / 25 这种裸数字，八成是把标价抄了一份。
  const offenders: string[] = [];
  for (const f of walk(path.join(LIB, "billing"))) {
    if (f.endsWith(".test.ts")) continue;
    const src = readFileSync(f, "utf8");
    if (/ACTION_PRICES\s*=/.test(src)) offenders.push(path.relative(LIB, f));
  }
  assert.deepEqual(offenders, [], "价目表只能有一份，在 src/config/plan.ts");
});

test("调了模型的业务代码必须同时接了计费", () => {
  // 《商业化 C2》七、2：禁止绕过 withCredits 直接调 callLLM。
  //
  // 静态能查的最强形式：凡是 import 了 callLLM 的业务文件，必须同时
  // import 计费入口。挡不住「import 了但那次调用没包进去」，但能挡住
  // 「新接一个动作时压根忘了计费」——那才是会真实发生的事。
  //
  // 下面这批是还没接的，按 C2 的切片顺序排。接完一个删一行；
  // 这张表就是「计费还差哪些动作」的唯一真相。
  const pending = new Set([
    "lib/parse/index.ts", // 上传时的认字，由 registerUpload 的 bundled 留痕覆盖
    "lib/chat/classify.ts", // C2.2 已接：分类跑在计费决定之前，用量并进这一轮
    "lib/chat/pipeline.ts", // C2.2 已接：由 notes/actions 的 chat_record 分支包住
    "lib/nudge/index.ts", // 主动追问：系统发起，不是用户动作，不计费
    "lib/interview/job.ts", // C2.5 面试题包
    "lib/health/deep-job.ts", // C2.6 体检深扫
    "lib/ingest/embedding.ts", // 向量召回，随文档解析与方向评估一起接
  ]);

  const offenders: string[] = [];
  for (const f of [...walk(LIB), ...walk(path.resolve(LIB, "..", "app"))]) {
    if (f.endsWith(".test.ts")) continue;
    const rel = path.relative(path.resolve(LIB, ".."), f);
    const src = readFileSync(f, "utf8");
    if (!/from\s+["']@\/lib\/llm["']/.test(src)) continue;
    if (/from\s+["']@\/lib\/billing\//.test(src)) continue;
    if (pending.has(rel)) continue;
    offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    "这些文件调了模型却没接计费。要么包进 withCredits，要么写进上面的待接清单",
  );
});

test("业务代码不直接调 hold/settle/release，只走 withCredits", () => {
  const allowed = new Set(["billing/withCredits.ts"]);
  const offenders: string[] = [];
  for (const f of walk(LIB)) {
    if (f.endsWith(".test.ts")) continue;
    const rel = path.relative(LIB, f);
    if (allowed.has(rel)) continue;
    const src = readFileSync(f, "utf8");
    if (/rpc\(\s*["'](hold_credits|settle_hold|release_hold)["']/.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "三态机制只有一个入口。绕过 withCredits 就一定会漏掉其中一步，而漏掉的那步通常是退款",
  );
});
