const publishedOnly = "status IN ('published', 'scheduled') AND published_at IS NOT NULL AND published_at <= NOW()";

export function mapCatalogEntry(row) {
  const en = row.translations?.en;
  return {
    id: row.id, slug: row.slug, contentType: row.content_type || "article",
    title: row.title, summary: row.summary, category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [], code: row.code,
    readTime: row.read_time, coverUrl: row.cover_url,
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    date: new Date(row.published_at || row.updated_at).toISOString().slice(0, 10).replace(/-/g, "."),
    content: [],
    translations: en ? { en: {
      title: en.title, summary: en.summary, readTime: en.readTime,
      tags: Array.isArray(en.tags) ? en.tags : [],
    } } : {},
  };
}

export function registerPublicCatalog(app, pool, renderPost) {
  // The index does not retrieve or render Markdown. Only the chosen detail
  // endpoint pays that cost, with a bounded cache keyed by the saved revision.
  const rendered = new Map();
  app.get("/api/catalog", async (_request, reply) => {
    const { rows } = await pool.query(`SELECT id, slug, content_type, title, summary,
      category, tags, code, read_time, cover_url, gallery, published_at, updated_at,
      jsonb_build_object('en', jsonb_build_object(
        'title', translations->'en'->'title', 'summary', translations->'en'->'summary',
        'readTime', translations->'en'->'readTime', 'tags', translations->'en'->'tags'
      )) AS translations
      FROM posts WHERE ${publishedOnly} ORDER BY published_at DESC`);
    reply.header("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return { posts: rows.map(mapCatalogEntry) };
  });

  app.get("/api/posts/:id", async (request, reply) => {
    const id = request.params.id;
    if (id.length > 240) return reply.code(400).send({ error: "Invalid record identifier" });
    const { rows } = await pool.query(
      `SELECT * FROM posts WHERE ${publishedOnly} AND (slug = $1 OR id = $1) LIMIT 1`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Record not found" });
    const row = rows[0];
    const key = `${row.id}:${new Date(row.updated_at).getTime()}`;
    let post = rendered.get(key);
    if (!post) {
      post = renderPost(row);
      if (rendered.size >= 32) rendered.delete(rendered.keys().next().value);
      rendered.set(key, post);
    }
    reply.header("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return { post };
  });
}
