// =============================================================
// Proofly · 异步作业的段落合并单测
//
// 断点续跑的全部风险都压在这个函数上：判错一段，用户要么白等一遍
// 十分钟，要么付了钱拿到半份结果。
// =============================================================

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeSegments, parseSegments, type Segment } from "./job";

const WANTED = [
  { name: "probe", label: "项目深挖题" },
  { name: "case", label: "案例题" },
];

function seg(name: string, status: Segment["status"], note?: string): Segment {
  return { name, label: name, status, note };
}

test("全新作业：两段都待跑", () => {
  assert.deepEqual(
    mergeSegments([], WANTED).map((s) => s.status),
    ["pending", "pending"],
  );
});

test("续跑：已完成的段保留（验收 22 · 跳过 probe 只跑 case）", () => {
  const merged = mergeSegments([seg("probe", "done", "18 道")], WANTED);
  assert.equal(merged[0].status, "done");
  assert.equal(merged[0].note, "18 道", "完成时的备注要带着，界面靠它说「已经生成好了」");
  assert.equal(merged[1].status, "pending");
});

test("失败的段必须重置成待跑，不能当成跑过了", () => {
  const merged = mergeSegments([seg("probe", "failed"), seg("case", "done")], WANTED);
  assert.equal(merged[0].status, "pending", "失败的段留着 failed 会在重试时被跳过");
  assert.equal(merged[1].status, "done");
});

test("段落定义变了以新的为准，旧的多余段落丢弃", () => {
  const merged = mergeSegments(
    [seg("probe", "done"), seg("legacy", "done")],
    WANTED,
  );
  assert.deepEqual(merged.map((s) => s.name), ["probe", "case"]);
});

test("label 永远取当前定义，不继承旧的", () => {
  const merged = mergeSegments([{ name: "probe", label: "老名字", status: "done" }], WANTED);
  assert.equal(merged[0].label, "项目深挖题");
});

test("parseSegments 认得住脏数据", () => {
  assert.deepEqual(parseSegments(null), []);
  assert.deepEqual(parseSegments("[]"), []);
  assert.deepEqual(parseSegments([{ name: "a", label: "a", status: "done" }]).length, 1);
});
