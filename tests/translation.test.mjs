import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutomaticEnglish,
  translationSourceHash,
} from "../server/translation.mjs";

const post = {
  title: "内存超频记录",
  summary: "记录电压与温度。",
  tags: ["超频", "内存"],
  contentMarkdown: "## 测试方法\n\n保留 `tREFI` 与 [资料](https://example.com/doc)。\n\n```js\nconst label = '中文不翻译';\n```",
  gallery: [{ src: "/uploads/a.webp", alt: "测试平台", caption: "室温 24°C" }],
};

test("source hash is stable and reacts to translatable content", () => {
  assert.equal(translationSourceHash(post), translationSourceHash({ ...post }));
  assert.notEqual(
    translationSourceHash(post),
    translationSourceHash({ ...post, summary: "另一段摘要" }),
  );
});

test("existing English is preserved when the Chinese source is unchanged", async () => {
  let calls = 0;
  const result = await buildAutomaticEnglish(
    post,
    { en: { title: "Memory overclocking notes", contentMarkdown: "Existing copy" } },
    { sourceUnchanged: true, translateText: async () => { calls += 1; return "unused"; } },
  );
  assert.equal(result.status, "preserved");
  assert.equal(result.translations.en.title, "Memory overclocking notes");
  assert.equal(calls, 0);
  assert.equal(result.translations.en.auto.sourceHash, translationSourceHash(post));
});

test("automatic translation preserves fenced code, inline code, URLs, and media order", async () => {
  const result = await buildAutomaticEnglish(post, {}, {
    translateText: async (text) => text.replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, "translated"),
  });
  const english = result.translations.en;
  assert.equal(result.status, "generated");
  assert.match(english.contentMarkdown, /```js\nconst label = '中文不翻译';\n```/);
  assert.match(english.contentMarkdown, /`tREFI`/);
  assert.match(english.contentMarkdown, /https:\/\/example\.com\/doc/);
  assert.match(english.contentMarkdown, /^## /m);
  assert.equal(english.gallery[0].src, "/uploads/a.webp");
  assert.equal(english.tags.length, 2);
});
