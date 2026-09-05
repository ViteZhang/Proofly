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

test("拒绝采样：≥248 的字节被丢掉，不是拿去取模", () => {
  // 直接 `byte % 31` 的话，字节 248..255 会落回前 8 个字符，让它们比
  // 其余 23 个多出约 ⅛ 的出现概率。用统计去测这件事要么样本量大得
  // 离谱，要么就会偶发失败 —— 不如把行为本身钉死：喂一串已知字节，
  // 看它是不是真的把越界的那些跳过去了。
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  // 前 8 个字节全部越界，随后是 0,1,2,…
  const feed = [248, 249, 250, 251, 252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7];
  let at = 0;
  try {
    globalThis.crypto.getRandomValues = ((a: Uint8Array) => {
      for (let i = 0; i < a.length; i++) a[i] = feed[at++ % feed.length];
      return a;
    }) as typeof globalThis.crypto.getRandomValues;

    // 越界的八个被丢掉，输出应当正好是字母表的前八个字符
    assert.equal(randomCode(8), CODE_ALPHABET.slice(0, 8));
  } finally {
    globalThis.crypto.getRandomValues = real;
  }
});

test("越界字节喂不完时会继续取，不会返回短码", () => {
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let calls = 0;
  try {
    // 前两批全是越界字节，第三批才有可用的
    globalThis.crypto.getRandomValues = ((a: Uint8Array) => {
      calls++;
      for (let i = 0; i < a.length; i++) a[i] = calls <= 2 ? 255 : 30;
      return a;
    }) as typeof globalThis.crypto.getRandomValues;

    assert.equal(randomCode(8), CODE_ALPHABET[30].repeat(8));
    assert.ok(calls >= 3, `要重试到拿够为止，实际调了 ${calls} 次`);
  } finally {
    globalThis.crypto.getRandomValues = real;
  }
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
