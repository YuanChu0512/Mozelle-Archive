import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mapCatalogEntry, registerPublicCatalog } from "../server/public-catalog.mjs";

const row = {
  id: "19cf8f19-0541-43ce-b5c1-19f0b1f7c4dd", slug: "test-record",
  title: "Record", summary: "Summary", content_type: "article", category: "电子",
  content_markdown: "Large article body", tags: ["DDR5"], code: "EE / 01",
  published_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  translations: { en: { title: "Record", summary: "Summary", contentMarkdown: "Long translated body", auto: { sourceHash: "private-metadata" } } },
};

test("catalog never includes article bodies or translation bookkeeping", () => {
  const result = JSON.stringify(mapCatalogEntry(row));
  assert.ok(!result.includes("Large article body"));
  assert.ok(!result.includes("Long translated body"));
  assert.ok(!result.includes("sourceHash"));
  assert.equal(mapCatalogEntry(row).date, "2026.01.01");
});

test("public detail uses parameterized published-only lookup and caches a saved revision", async () => {
  const app = Fastify();
  let renderCount = 0;
  const calls = [];
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: values?.[0] === "missing" ? [] : [row] };
  } };
  registerPublicCatalog(app, pool, (value) => { renderCount += 1; return { id: value.id, title: value.title }; });
  try {
    const first = await app.inject("/api/posts/test-record");
    assert.equal(first.statusCode, 200);
    assert.equal((await app.inject("/api/posts/test-record")).statusCode, 200);
    assert.equal(renderCount, 1);
    assert.deepEqual(calls[0].values, ["test-record"]);
    assert.match(calls[0].sql, /published_at <= NOW\(\)/);
    assert.match(calls[0].sql, /slug = \$1/);
    assert.equal((await app.inject("/api/posts/missing")).statusCode, 404);
    row.updated_at = "2026-01-02T00:00:00Z";
    await app.inject("/api/posts/test-record");
    assert.equal(renderCount, 2);
    const catalog = await app.inject("/api/catalog");
    assert.equal(catalog.statusCode, 200);
    assert.match(calls.at(-1).sql, /SELECT id, slug/);
    assert.doesNotMatch(calls.at(-1).sql, /SELECT \*|content_markdown/);
  } finally { await app.close(); }
});
