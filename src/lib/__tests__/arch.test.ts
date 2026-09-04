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
