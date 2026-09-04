import assert from "node:assert/strict";
import { test } from "node:test";

import { CODE_ALPHABET, formatCode, normalizeCode, randomCode } from "./code";

test("字母表剔除了手抄最容易错的五个字符", () => {
  for (const ch of "01OIL") {
    assert.equal(CODE_ALPHABET.includes(ch), false, `${ch} 不该在字母表里`);
  }
  // 36 个字母数字减去 5 个 = 31。方案里写的「32 位」算错了一位。
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(new Set(CODE_ALPHABET).size, 31, "字母表不该有重复字符");
});

test("随机码只用字母表里的字符，且长度对", () => {
  for (let i = 0; i < 200; i++) {
    const c = randomCode();
    assert.equal(c.length, 8);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), ch);
  }
});

test("拒绝采样：31 个字符的出现频次没有系统性偏斜", () => {
  // 直接 `byte % 31` 的话，前 6 个字符会比后 25 个多出约 ⅛。
  // 这里数 6 万个字符，看最热和最冷的差距 —— 偏置版本必然超过 5%。
  const count = new Map<string, number>();
  for (let i = 0; i < 7500; i++) {
    for (const ch of randomCode()) count.set(ch, (count.get(ch) ?? 0) + 1);
  }
  assert.equal(count.size, 31);
  const n = [...count.values()];
  const mean = n.reduce((a, b) => a + b, 0) / n.length;
  const worst = Math.max(...n.map((v) => Math.abs(v - mean) / mean));
  assert.ok(worst < 0.05, `最大偏差 ${(worst * 100).toFixed(1)}%`);
});

test("规范形式是 PF-XXXX-XXXX", () => {
  assert.equal(formatCode("7K3MQ2XR"), "PF-7K3M-Q2XR");
});

test("用户怎么打都兑得动", () => {
  const want = "PF-7K3M-Q2XR";
  for (const input of [
    "PF-7K3M-Q2XR",
    "pf-7k3m-q2xr",
    "  PF-7K3M-Q2XR  ",
    "PF7K3MQ2XR",
    "pf 7k3m q2xr",
    "7K3MQ2XR", // 只抄了码体
    "7k3m-q2xr",
  ]) {
    assert.equal(normalizeCode(input), want, input);
  }
});

test("码体自己以 PF 开头时不会被吃掉前两位", () => {
  // 字母表里有 P 也有 F，所以「以 PF 开头就当成前缀」是错的。
  // 靠长度判断：带前缀 10 位，不带 8 位。
  assert.equal(normalizeCode("PF3M9XJ2"), "PF-PF3M-9XJ2");
  assert.equal(normalizeCode("PF-PF3M-9XJ2"), "PF-PF3M-9XJ2");
});

test("空输入不会变成一个孤零零的前缀", () => {
  assert.equal(normalizeCode(""), "");
  assert.equal(normalizeCode("   "), "");
  assert.equal(normalizeCode("--"), "");
});
