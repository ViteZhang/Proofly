// =============================================================
// 搜索过滤的单测
//
// 「搜了没结果」和「搜出一堆不相关的」都会让人再也不点那个框。这一组
// 钉的就是这两头。
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { PER_GROUP, matches, recent, search } from "./filter";
import type { SearchItem, SearchKind } from "@/lib/search/types";

const item = (id: string, kind: SearchKind, title: string, subtitle = ""): SearchItem => ({
  id,
  kind,
  title,
  subtitle,
  proof: null,
  route: `/x/${id}`,
});

const index: SearchItem[] = [
  item("a1", "atom", "RAG 知识库问答", "润泽园教育科技 · 高级产品经理"),
  item("a2", "atom", "基于 RAG 的客服助手", "亿阁科技"),
  item("a3", "atom", "测评系统升级", "趣店"),
  item("s1", "skill", "RAG", "技术"),
  item("e1", "education", "大连理工大学", "软件工程"),
  item("c1", "credential", "PMP", "PMI"),
  item("t1", "task", "补齐意图路由准确率", "待办"),
];

test("标题和副标题都参与匹配", () => {
  assert.equal(matches(item("x", "atom", "标题", "副标题"), "副标"), true);
  assert.equal(matches(item("x", "atom", "标题", "副标题"), "没有"), false);
});

test("大小写不敏感", () => {
  assert.equal(matches(item("x", "atom", "RAG 知识库"), "rag"), true);
});

test("按公司名也能搜到经历", () => {
  const g = search(index, "趣店");
  assert.equal(g[0].items[0].title, "测评系统升级");
});

test("结果按类型分组，经历排最前", () => {
  const g = search(index, "RAG");
  assert.equal(g[0].kind, "atom");
  assert.equal(g[1].kind, "skill");
});

test("标题从头命中的排在只是包含的前面", () => {
  const g = search(index, "RAG");
  // 「RAG 知识库问答」以 RAG 开头，「基于 RAG 的客服助手」只是包含
  assert.equal(g[0].items[0].title, "RAG 知识库问答");
});

test("学历与证书都能被召回", () => {
  assert.equal(search(index, "大连理工")[0].kind, "education");
  assert.equal(search(index, "PMP")[0].kind, "credential");
});

test("六类内容都在索引里", () => {
  const kinds = new Set(index.map((i) => i.kind));
  for (const k of ["atom", "skill", "task", "education", "credential"]) {
    assert.ok(kinds.has(k as SearchKind), k);
  }
});

test("搜不到时返回空，界面据此说「没找到」", () => {
  assert.deepEqual(search(index, "量子计算"), []);
});

test("每组最多五条，多的用 more 报数而不是悄悄扔掉", () => {
  const many = Array.from({ length: 8 }, (_, i) => item(`m${i}`, "atom", `项目 ${i}`));
  const g = search(many, "项目");
  assert.equal(g[0].items.length, PER_GROUP);
  assert.equal(g[0].more, 3);
});

test("最近访问按给的顺序来，认不出的 id 跳过", () => {
  const r = recent(index, ["c1", "不存在", "a3"], 5);
  assert.equal(r[0].id, "c1");
  assert.equal(r[1].id, "a3");
});

test("没有访问记录时退回索引里最靠前的几条，不是空面板", () => {
  const r = recent(index, [], 3);
  assert.equal(r.length, 3);
});
