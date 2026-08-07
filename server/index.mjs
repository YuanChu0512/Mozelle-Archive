import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Pool } from "pg";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatVisitorLocation,
  isAutomatedUserAgent,
  isPublicVisitorIp,
  locationFromCloudflareHeaders,
  normalizeAnalyticsPath,
  normalizeLocationPart,
  normalizeVisitorIp,
} from "./analytics.mjs";
import { sanitizeImageMetadata } from "./image-sanitizer.mjs";
import {
  buildAutomaticEnglish,
  createLibreTranslateClient,
  translationSourceHash,
} from "./translation.mjs";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "/data/uploads");
const publicOrigin = (process.env.PUBLIC_ORIGIN || "http://localhost").replace(/\/$/, "");
const port = Number(process.env.API_PORT || 8788);
const secureCookies = publicOrigin.startsWith("https://");
const translateText = createLibreTranslateClient();

const requiredEnvironment = [
  "SESSION_SECRET",
  "ADMIN_PASSWORD",
];

const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const hasDatabaseConfiguration = Boolean(
  process.env.DATABASE_URL ||
    (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD),
);
if (!hasDatabaseConfiguration) missingEnvironment.unshift("DATABASE_URL or PG* variables");
if (missingEnvironment.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
}

const sessionSecret = process.env.SESSION_SECRET;
const adminPasswordDigest = createHash("sha256")
  .update(process.env.ADMIN_PASSWORD)
  .digest();
const adminGitHubId = process.env.ADMIN_GITHUB_ID
  ? String(process.env.ADMIN_GITHUB_ID)
  : null;
const githubOAuthEnabled = Boolean(
  process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    adminGitHubId,
);
const passwordFailures = new Map();
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool();
const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 2 * 1024 * 1024,
});
let lastAnalyticsCleanupAt = 0;
const activeLocationLookups = new Map();
const failedLocationLookups = new Map();
const ipLocationEndpoint = (process.env.IP_LOCATION_ENDPOINT || "https://ipwho.is").replace(/\/$/, "");

await mkdir(uploadDirectory, { recursive: true });
await app.register(cookie);
await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024,
    fields: 4,
    parts: 5,
  },
});
await app.register(fastifyStatic, {
  root: uploadDirectory,
  prefix: "/uploads/",
  decorateReply: false,
  immutable: true,
  maxAge: "30d",
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "strict-origin-when-cross-origin");
  reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
  reply.header(
    "content-security-policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  return payload;
});

const schemaSql = await readFile(path.join(serverDirectory, "schema.sql"), "utf8");
await pool.query(schemaSql);

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signValue(value) {
  const encoded = base64Url(value);
  const signature = createHmac("sha256", sessionSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedValue(value) {
  if (!value || !value.includes(".")) return null;
  const [encoded, providedSignature] = value.split(".", 2);
  const expectedSignature = createHmac("sha256", sessionSecret)
    .update(encoded)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function createSession({ id, login, avatarUrl = null, provider }) {
  return signValue(
    JSON.stringify({
      id: String(id),
      login,
      avatarUrl,
      provider,
      role: "admin",
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  );
}

function readSession(request) {
  const raw = verifySignedValue(request.cookies.mozelle_admin);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    const validIdentity =
      (session.provider === "password" && session.id === "password-admin") ||
      (session.provider === "github" &&
        adminGitHubId &&
        String(session.id) === adminGitHubId);
    if (
      session.role !== "admin" ||
      !validIdentity ||
      typeof session.exp !== "number" ||
      session.exp < Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function requireAdmin(request, reply) {
  const session = readSession(request);
  if (!session) {
    return reply.code(401).send({ error: "UNAUTHORIZED", message: "请先完成后台管理员验证。" });
  }
  request.admin = session;
}

async function verifyMutationOrigin(request, reply) {
  const origin = request.headers.origin;
  if (origin && origin.replace(/\/$/, "") !== publicOrigin) {
    return reply.code(403).send({ error: "INVALID_ORIGIN", message: "请求来源不受信任。" });
  }
}

async function cleanupAnalyticsIfNeeded() {
  const now = Date.now();
  if (now - lastAnalyticsCleanupAt < 6 * 60 * 60 * 1000) return;
  lastAnalyticsCleanupAt = now;
  try {
    await pool.query("DELETE FROM page_views WHERE visited_at < NOW() - INTERVAL '90 days'");
    await pool.query("DELETE FROM ip_locations WHERE updated_at < NOW() - INTERVAL '90 days'");
  } catch (error) {
    app.log.error({ error }, "Unable to remove expired analytics records");
  }
}

async function saveVisitorLocation(ip, location) {
  await pool.query(
    `INSERT INTO ip_locations
       (ip_address, country, region, city, location_label, source, updated_at)
     VALUES ($1::inet, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (ip_address) DO UPDATE SET
       country = EXCLUDED.country,
       region = EXCLUDED.region,
       city = EXCLUDED.city,
       location_label = EXCLUDED.location_label,
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [
      ip,
      normalizeLocationPart(location.country),
      normalizeLocationPart(location.region),
      normalizeLocationPart(location.city),
      normalizeLocationPart(location.label, 240) || "未知地区",
      normalizeLocationPart(location.source, 24) || "lookup",
    ],
  );
}

async function lookupVisitorLocation(ip) {
  if (!isPublicVisitorIp(ip)) {
    const location = {
      country: "",
      region: "",
      city: "",
      label: "本地或内网地址",
      source: "local",
    };
    await saveVisitorLocation(ip, location);
    return location;
  }

  const response = await fetch(
    `${ipLocationEndpoint}/${encodeURIComponent(ip)}?fields=success,country,region,city&lang=zh-CN`,
    {
      headers: { accept: "application/json", "user-agent": "Mozelle-Journal/1.0" },
      signal: AbortSignal.timeout(3000),
    },
  );
  if (!response.ok) throw new Error(`IP location lookup failed with ${response.status}`);
  const payload = await response.json();
  if (payload?.success === false) throw new Error("IP location lookup returned no result");

  const country = normalizeLocationPart(payload?.country);
  const region = normalizeLocationPart(payload?.region);
  const city = normalizeLocationPart(payload?.city);
  const location = {
    country,
    region,
    city,
    label: formatVisitorLocation({ country, region, city }),
    source: "ipwhois",
  };
  await saveVisitorLocation(ip, location);
  return location;
}

async function ensureVisitorLocation(ip) {
  const cached = await pool.query(
    `SELECT location_label
     FROM ip_locations
     WHERE ip_address = $1::inet
       AND updated_at > NOW() - INTERVAL '30 days'`,
    [ip],
  );
  if (cached.rows.length) return cached.rows[0].location_label;

  const failedAt = failedLocationLookups.get(ip) || 0;
  if (Date.now() - failedAt < 60 * 60 * 1000) return null;
  if (activeLocationLookups.has(ip)) return activeLocationLookups.get(ip);

  const lookup = lookupVisitorLocation(ip)
    .then((location) => {
      failedLocationLookups.delete(ip);
      return location.label;
    })
    .catch((error) => {
      failedLocationLookups.set(ip, Date.now());
      if (failedLocationLookups.size > 2000) {
        failedLocationLookups.delete(failedLocationLookups.keys().next().value);
      }
      app.log.warn({ error }, "Unable to resolve visitor region");
      return null;
    })
    .finally(() => activeLocationLookups.delete(ip));
  activeLocationLookups.set(ip, lookup);
  return lookup;
}

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateSlug(value) {
  const slug = cleanText(value, 180).toLowerCase();
  return /^[a-z0-9\u4e00-\u9fff]+(?:-[a-z0-9\u4e00-\u9fff]+)*$/.test(slug)
    ? slug
    : null;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanText(tag, 32)).filter(Boolean))].slice(0, 12);
}

function normalizeMediaUrl(value) {
  const mediaUrl = cleanText(value, 500);
  if (!mediaUrl) return null;
  const allowedPaths = ["/uploads/", "/articles/"];
  if (
    allowedPaths.some((prefix) => mediaUrl.startsWith(prefix)) ||
    allowedPaths.some((prefix) => mediaUrl.startsWith(`${publicOrigin}${prefix}`))
  ) {
    return mediaUrl;
  }
  return null;
}

function normalizeCoverUrl(value) {
  if (!cleanText(value, 500)) return null;
  const coverUrl = normalizeMediaUrl(value);
  if (coverUrl) return coverUrl;
  throw new Error("内容主视觉必须来自媒体库或站内资料图。");
}

function normalizeGallery(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const src = normalizeMediaUrl(item.src);
    if (!src) return [];
    return [{
      src,
      alt: cleanText(item.alt, 180),
      caption: cleanText(item.caption, 500),
    }];
  });
}

function normalizeTranslationSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 48).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const href = cleanText(item.href, 1_000);
    let url;
    try {
      url = new URL(href);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    return [{ href, label: cleanText(item.label, 240) }];
  });
}

function normalizeTranslations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value.en;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const en = {};
  if (Object.hasOwn(source, "title")) en.title = cleanText(source.title, 180);
  if (Object.hasOwn(source, "summary")) en.summary = cleanText(source.summary, 600);
  if (Object.hasOwn(source, "tags")) en.tags = normalizeTags(source.tags);
  if (Object.hasOwn(source, "contentMarkdown")) {
    en.contentMarkdown = typeof source.contentMarkdown === "string"
      ? source.contentMarkdown.slice(0, 1_000_000)
      : "";
  } else if (Object.hasOwn(source, "content")) {
    en.contentMarkdown = Array.isArray(source.content)
      ? source.content
          .filter((paragraph) => typeof paragraph === "string")
          .join("\n\n")
          .slice(0, 1_000_000)
      : "";
  }
  if (Object.hasOwn(source, "gallery")) en.gallery = normalizeGallery(source.gallery);
  if (Object.hasOwn(source, "sources")) {
    en.sources = normalizeTranslationSources(source.sources);
  }
  if (source.auto && typeof source.auto === "object" && !Array.isArray(source.auto)) {
    const sourceHash = cleanText(source.auto.sourceHash, 64);
    const generatedAt = cleanText(source.auto.generatedAt, 40);
    const engine = cleanText(source.auto.engine, 80);
    if (sourceHash) en.auto = { sourceHash, generatedAt, engine };
  }
  return Object.keys(en).length ? { en } : {};
}

function normalizePostPayload(body = {}) {
  const title = cleanText(body.title, 180);
  const slug = validateSlug(body.slug);
  const contentMarkdown = typeof body.contentMarkdown === "string"
    ? body.contentMarkdown.slice(0, 1_000_000)
    : "";
  const allowedStatuses = new Set(["draft", "published", "scheduled"]);
  const allowedContentTypes = new Set(["article", "lab", "collection"]);
  const status = allowedStatuses.has(body.status) ? body.status : "draft";
  const contentType = allowedContentTypes.has(body.contentType)
    ? body.contentType
    : "article";
  const publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

  if (!title) throw new Error("内容标题不能为空。");
  if (!slug) throw new Error("内容链接只能包含中文、英文字母、数字和连字符。");
  if (status === "scheduled" && (!publishedAt || Number.isNaN(publishedAt.valueOf()))) {
    throw new Error("定时发布必须填写有效时间。");
  }

  return {
    contentType,
    title,
    slug,
    summary: cleanText(body.summary, 600),
    category: cleanText(body.category, 40) || "电子",
    tags: normalizeTags(body.tags),
    code: cleanText(body.code, 30) || "EE / NEW",
    readTime: cleanText(body.readTime, 30) || (contentType === "collection" ? "" : "5 min"),
    contentMarkdown,
    coverUrl: normalizeCoverUrl(body.coverUrl),
    gallery: normalizeGallery(body.gallery),
    translations: normalizeTranslations(body.translations),
    status,
    publishedAt:
      status === "published"
        ? publishedAt && !Number.isNaN(publishedAt.valueOf())
          ? publishedAt.toISOString()
          : new Date().toISOString()
        : status === "scheduled"
          ? publishedAt.toISOString()
          : null,
  };
}

function mapPost(row) {
  return {
    id: row.id,
    contentType: row.content_type || "article",
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    code: row.code,
    readTime: row.read_time,
    contentMarkdown: row.content_markdown,
    coverUrl: row.cover_url,
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    translations: normalizeTranslations(row.translations),
    status: row.status,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function renderMarkdown(markdown) {
  const rawHtml = marked.parse(markdown, { gfm: true, breaks: false });
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "h4", "strong", "em", "del", "blockquote",
      "ul", "ol", "li", "pre", "code", "a", "img", "hr", "table", "thead", "tbody",
      "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "loading"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer" },
      }),
      img: (_tagName, attributes) => ({
        tagName: "img",
        attribs: { ...attributes, loading: "lazy" },
      }),
    },
    exclusiveFilter(frame) {
      if (frame.tag === "img") {
        const src = frame.attribs?.src || "";
        return !normalizeMediaUrl(src);
      }
      return false;
    },
  });
}

function markdownParagraphs(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>*_`#-]/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function mapPublicPost(row) {
  const post = mapPost(row);
  const translations = post.translations?.en
    ? {
        en: {
          ...Object.fromEntries(
            Object.entries(post.translations.en).filter(([key]) => key !== "auto"),
          ),
          ...(post.translations.en.contentMarkdown
            ? {
                content: markdownParagraphs(post.translations.en.contentMarkdown),
                contentHtml: renderMarkdown(post.translations.en.contentMarkdown),
              }
            : {}),
        },
      }
    : {};
  return {
    id: post.id,
    slug: post.slug,
    contentType: post.contentType,
    category: post.category,
    code: post.code,
    date: (post.publishedAt || post.updatedAt).slice(0, 10).replace(/-/g, "."),
    readTime: post.readTime,
    title: post.title,
    summary: post.summary,
    tags: post.tags,
    content: markdownParagraphs(post.contentMarkdown),
    contentHtml: renderMarkdown(post.contentMarkdown),
    coverUrl: post.coverUrl,
    gallery: post.gallery,
    translations,
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    url: row.public_url,
    filename: row.filename,
    alt: row.alt_text,
    size: row.size_bytes,
    mimeType: row.mime_type,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  const gifHeader = buffer.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { mime: "image/gif", extension: "gif" };
  }
  return null;
}

async function seedPosts() {
  const migrationKey = "content-seed-v4-student-voice";
  const migration = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE migration_key = $1",
    [migrationKey],
  );
  if (migration.rowCount) return;
  const previousV3Migration = await pool.query(
    "SELECT applied_at FROM schema_migrations WHERE migration_key = $1",
    ["content-seed-v3-expanded-library"],
  );
  const previousV2Migration = await pool.query(
    "SELECT applied_at FROM schema_migrations WHERE migration_key = $1",
    ["content-seed-v2-structured-library"],
  );
  const previousV3SeedAppliedAt = previousV3Migration.rows[0]?.applied_at
    ? new Date(previousV3Migration.rows[0].applied_at)
    : null;
  const previousV2SeedAppliedAt = previousV2Migration.rows[0]?.applied_at
    ? new Date(previousV2Migration.rows[0].applied_at)
    : null;
  const legacyV2SeedSlugs = new Set([
    "ddr5-stability",
    "pmic-rails",
    "drmos-reading",
    "acg-workspace",
  ]);
  const previousV3SeedFingerprints = new Map([
    ["boe-cell-cut-process", "21db73d9ec5036931304ba55dc9a3fe5550eb573fbcae65d7cd7d0484bdc45a6"],
    ["sparkle-cosplay-record", "988dac4e12d1711e4c23d08e89f3e8dcd3fd3135f5b433e94d48b450f8e3061a"],
    ["ddr5-96gb-8400", "acc6e46ecc3092f206d1038ec3d14a05c2155875198b754a7f7d06d8be83dfc8"],
    ["rtx5090-time-spy-extreme-hof", "3c853378f1999eb11696577cdf3229bb459ee7d4e8e1477a3cc6ed838dbd7607"],
    ["rtx5090-laptop-shunt-mod", "860ab4e7e3b01a2e52585ad7eac0277ac74d9178dbc6a1f67882428185d41e2f"],
    ["ddr5-stability", "e4254267703daca1bf11ce693663422c36547b8adcb342bce1b50d360e33a5d9"],
    ["pmic-rails", "6800d1f34377c6a5ca79facbee7a73322e532a56f33e6df2ae2d5934b24938e8"],
    ["drmos-reading", "979b73d5fe1826c0fcb2b08a3bab53e691e96ad8af7ede58f48b25bf568433c0"],
    ["acg-workspace", "0db9969a3fd27209c294137751519b19ecedb9d18bf74f0ee43fabcf5a4f89f3"],
  ]);
  const contentFingerprint = ({ title, summary, readTime, content }) => createHash("sha256")
    .update(JSON.stringify([title, summary, readTime ?? "", content]))
    .digest("hex");

  const seeds = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const seed of seeds) {
      const existing = await client.query(
        `SELECT title, summary, read_time, content_markdown, code, created_at, updated_at
         FROM posts WHERE slug = $1 FOR UPDATE`,
        [seed.slug],
      );
      if (!existing.rowCount) {
        if (previousV3SeedAppliedAt) {
          // Every v3 slug was managed. If one is now missing, it was deleted deliberately.
          continue;
        }
        if (previousV2SeedAppliedAt && legacyV2SeedSlugs.has(seed.slug)) {
          // A missing v2 seed was deliberately deleted in the console; do not resurrect it.
          continue;
        }
      }
      if (existing.rowCount) {
        const row = existing.rows[0];
        const createdAt = new Date(row.created_at).valueOf();
        const updatedAt = new Date(row.updated_at).valueOf();
        const currentV3Fingerprint = contentFingerprint({
          title: row.title,
          summary: row.summary,
          readTime: row.read_time,
          content: row.content_markdown,
        });
        const untouchedV3Seed =
          previousV3SeedAppliedAt &&
          currentV3Fingerprint === previousV3SeedFingerprints.get(seed.slug);
        const untouchedLegacySeed =
          !previousV3SeedAppliedAt &&
          !previousV2SeedAppliedAt &&
          row.code === seed.code &&
          Math.abs(updatedAt - createdAt) < 1_000;
        const untouchedV2Seed =
          !previousV3SeedAppliedAt &&
          previousV2SeedAppliedAt &&
          legacyV2SeedSlugs.has(seed.slug) &&
          updatedAt <= previousV2SeedAppliedAt.valueOf();
        if (!untouchedV3Seed && !untouchedLegacySeed && !untouchedV2Seed) {
          // Preserve custom posts and any content edited through the console.
          continue;
        }
      }
      await client.query(
        `INSERT INTO posts
          (id, slug, content_type, title, summary, category, tags, code, read_time,
           content_markdown, cover_url, gallery, translations, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb, 'published', $14)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           read_time = EXCLUDED.read_time,
           content_markdown = EXCLUDED.content_markdown,
           updated_at = NOW()`,
        [
          randomUUID(), seed.slug, seed.contentType, seed.title, seed.summary,
          seed.category, JSON.stringify(seed.tags), seed.code, seed.readTime,
          seed.content, seed.coverUrl ?? null, JSON.stringify(seed.gallery ?? []),
          JSON.stringify(seed.translations ?? {}),
          seed.publishedAt ?? new Date().toISOString(),
        ],
      );
    }
    await client.query(
      "INSERT INTO schema_migrations (migration_key) VALUES ($1)",
      [migrationKey],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

await seedPosts();

app.get("/api/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true, service: "mozelle-journal-api" };
});

app.get("/api/auth/session", async (request) => {
  const session = readSession(request);
  return {
    authenticated: Boolean(session),
    passwordEnabled: true,
    loginUrl: githubOAuthEnabled ? "/api/auth/github/start" : undefined,
    user: session ? { login: session.login, avatarUrl: session.avatarUrl } : undefined,
  };
});

app.post(
  "/api/auth/password",
  { preHandler: [verifyMutationOrigin] },
  async (request, reply) => {
    const attemptKey = request.ip || "unknown";
    const now = Date.now();
    const previous = passwordFailures.get(attemptKey);
    if (previous?.blockedUntil > now) {
      const retryAfter = Math.ceil((previous.blockedUntil - now) / 1000);
      reply.header("retry-after", String(retryAfter));
      return reply.code(429).send({
        error: "TOO_MANY_ATTEMPTS",
        message: `尝试次数过多，请在 ${retryAfter} 秒后重试。`,
      });
    }

    const password =
      typeof request.body?.password === "string"
        ? request.body.password.slice(0, 128)
        : "";
    const providedDigest = createHash("sha256").update(password).digest();
    const passwordMatches = timingSafeEqual(adminPasswordDigest, providedDigest);

    if (!passwordMatches) {
      const withinWindow = previous && now - previous.firstFailure < 10 * 60 * 1000;
      const failures = withinWindow ? previous.failures + 1 : 1;
      const blockedUntil = failures >= 5 ? now + 10 * 60 * 1000 : 0;
      passwordFailures.set(attemptKey, {
        failures,
        firstFailure: withinWindow ? previous.firstFailure : now,
        blockedUntil,
      });
      return reply.code(failures >= 5 ? 429 : 401).send({
        error: failures >= 5 ? "TOO_MANY_ATTEMPTS" : "INVALID_PASSWORD",
        message:
          failures >= 5
            ? "尝试次数过多，请在 10 分钟后重试。"
            : "后台密码不正确。",
      });
    }

    passwordFailures.delete(attemptKey);
    reply.setCookie(
      "mozelle_admin",
      createSession({
        id: "password-admin",
        login: "Mozelle",
        provider: "password",
      }),
      {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      },
    );
    return {
      authenticated: true,
      user: { login: "Mozelle", avatarUrl: null },
    };
  },
);

app.get("/api/auth/github/start", async (_request, reply) => {
  if (!githubOAuthEnabled) {
    return reply.code(503).send("此站点未启用 GitHub 备用登录，请使用后台密码。");
  }
  const state = randomBytes(24).toString("base64url");
  reply.setCookie("mozelle_oauth_state", signValue(state), {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth/github",
    maxAge: 600,
  });
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${publicOrigin}/api/auth/github/callback`);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  return reply.redirect(authorize.href);
});

app.get("/api/auth/github/callback", async (request, reply) => {
  if (!githubOAuthEnabled) {
    return reply.code(503).send("此站点未启用 GitHub 备用登录，请使用后台密码。");
  }
  const { code, state } = request.query || {};
  const savedState = verifySignedValue(request.cookies.mozelle_oauth_state);
  reply.clearCookie("mozelle_oauth_state", { path: "/api/auth/github" });
  if (!code || !state || !savedState || state !== savedState) {
    return reply.code(400).send("GitHub 登录状态无效，请返回后台重新登录。");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${publicOrigin}/api/auth/github/callback`,
    }),
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    request.log.error(
      { status: tokenResponse.status, error: tokenPayload.error },
      "GitHub token exchange failed",
    );
    return reply.code(502).send("GitHub 登录失败，请稍后重试。");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${tokenPayload.access_token}`,
      "user-agent": "mozelle-journal",
      "x-github-api-version": "2022-11-28",
    },
  });
  const user = await userResponse.json();
  if (!userResponse.ok || String(user.id) !== adminGitHubId) {
    return reply.code(403).send("此 GitHub 账号没有后台管理权限。");
  }

  reply.setCookie("mozelle_admin", createSession({
    id: user.id,
    login: user.login,
    avatarUrl: user.avatar_url || null,
    provider: "github",
  }), {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return reply.redirect(`${publicOrigin}/admin`);
});

app.post(
  "/api/auth/logout",
  { preHandler: [verifyMutationOrigin] },
  async (_request, reply) => {
    reply.clearCookie("mozelle_admin", { path: "/" });
    return { ok: true };
  },
);

app.post(
  "/api/analytics/view",
  { preHandler: [verifyMutationOrigin] },
  async (request, reply) => {
    const pagePath = normalizeAnalyticsPath(request.body?.path);
    const visitorIp = normalizeVisitorIp(request.ip);
    const userAgent = request.headers["user-agent"];
    if (!pagePath || !visitorIp || isAutomatedUserAgent(userAgent)) {
      return reply.code(204).send();
    }

    const insertResult = await pool.query(
      `INSERT INTO page_views (ip_address, path)
       SELECT $1::inet, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM page_views
         WHERE ip_address = $1::inet
           AND path = $2
           AND visited_at > NOW() - INTERVAL '30 seconds'
       )`,
      [visitorIp, pagePath],
    );
    if (insertResult.rowCount) {
      const edgeLocation = locationFromCloudflareHeaders(request.headers, visitorIp);
      if (edgeLocation) {
        void saveVisitorLocation(visitorIp, edgeLocation).catch((error) => {
          app.log.warn({ error }, "Unable to cache visitor region");
        });
      } else {
        void ensureVisitorLocation(visitorIp);
      }
    }
    void cleanupAnalyticsIfNeeded();
    return reply.code(204).send();
  },
);

app.get("/api/posts", async (_request, reply) => {
  const { rows } = await pool.query(
    `SELECT * FROM posts
     WHERE status IN ('published', 'scheduled')
       AND published_at IS NOT NULL
       AND published_at <= NOW()
     ORDER BY published_at DESC`,
  );
  reply.header("cache-control", "public, max-age=30, stale-while-revalidate=120");
  return { posts: rows.map(mapPublicPost) };
});

app.get("/api/settings", async (_request, reply) => {
  const defaults = {
    siteTitle: "Mozelle Archive",
    tagline: "把所见、所想与所爱，收进一页页未完的档案。",
    bio: "电子专业学生，记录硬件、超频、游戏、Cosplay 与二次元世界。",
    defaultCategory: "电子",
    defaultAuthor: "Mozelle",
  };
  const { rows } = await pool.query("SELECT setting_key, setting_value FROM site_settings");
  reply.header("cache-control", "public, max-age=30, stale-while-revalidate=120");
  return {
    settings: {
      ...defaults,
      ...Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])),
    },
  };
});

app.get("/api/admin/posts", { preHandler: [requireAdmin] }, async () => {
  const { rows } = await pool.query("SELECT * FROM posts ORDER BY updated_at DESC");
  return { posts: rows.map(mapPost) };
});

app.get("/api/admin/analytics", { preHandler: [requireAdmin] }, async (_request, reply) => {
  const [summaryResult, dailyResult, topPagesResult, recentResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_views,
         COUNT(DISTINCT ip_address)::int AS unique_visitors,
         COUNT(*) FILTER (
           WHERE (visited_at AT TIME ZONE 'Asia/Shanghai')::date =
             (NOW() AT TIME ZONE 'Asia/Shanghai')::date
         )::int AS today_views,
         COUNT(DISTINCT ip_address) FILTER (
           WHERE (visited_at AT TIME ZONE 'Asia/Shanghai')::date =
             (NOW() AT TIME ZONE 'Asia/Shanghai')::date
         )::int AS today_visitors,
         COUNT(*) FILTER (
           WHERE visited_at >= NOW() - INTERVAL '7 days'
         )::int AS week_views
       FROM page_views`,
    ),
    pool.query(
      `WITH days AS (
         SELECT generate_series(
           (NOW() AT TIME ZONE 'Asia/Shanghai')::date - 13,
           (NOW() AT TIME ZONE 'Asia/Shanghai')::date,
           INTERVAL '1 day'
         )::date AS day
       )
       SELECT
         TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
         COUNT(page_views.id)::int AS views,
         COUNT(DISTINCT page_views.ip_address)::int AS visitors
       FROM days
       LEFT JOIN page_views
         ON (page_views.visited_at AT TIME ZONE 'Asia/Shanghai')::date = days.day
       GROUP BY days.day
       ORDER BY days.day`,
    ),
    pool.query(
      `SELECT
         path,
         COUNT(*)::int AS views,
         COUNT(DISTINCT ip_address)::int AS visitors
       FROM page_views
       WHERE visited_at >= NOW() - INTERVAL '30 days'
       GROUP BY path
       ORDER BY views DESC, path ASC
       LIMIT 10`,
    ),
    pool.query(
      `SELECT
         page_views.ip_address::text AS ip,
         page_views.path,
         page_views.visited_at,
         ip_locations.location_label AS location
       FROM page_views
       LEFT JOIN ip_locations
         ON ip_locations.ip_address = page_views.ip_address
       ORDER BY page_views.visited_at DESC
       LIMIT 100`,
    ),
  ]);

  const missingLocations = [...new Set(
    recentResult.rows
      .filter((row) => !row.location)
      .map((row) => row.ip),
  )].slice(0, 10);
  if (missingLocations.length) {
    await Promise.allSettled(missingLocations.map((ip) => ensureVisitorLocation(ip)));
    const refreshedRecent = await pool.query(
      `SELECT
         page_views.ip_address::text AS ip,
         page_views.path,
         page_views.visited_at,
         ip_locations.location_label AS location
       FROM page_views
       LEFT JOIN ip_locations
         ON ip_locations.ip_address = page_views.ip_address
       ORDER BY page_views.visited_at DESC
       LIMIT 100`,
    );
    recentResult.rows = refreshedRecent.rows;
  }

  const summary = summaryResult.rows[0] ?? {};
  reply.header("cache-control", "private, no-store");
  return {
    retentionDays: 90,
    summary: {
      totalViews: summary.total_views ?? 0,
      uniqueVisitors: summary.unique_visitors ?? 0,
      todayViews: summary.today_views ?? 0,
      todayVisitors: summary.today_visitors ?? 0,
      weekViews: summary.week_views ?? 0,
    },
    daily: dailyResult.rows,
    topPages: topPagesResult.rows,
    recent: recentResult.rows.map((row) => ({
      ip: row.ip,
      location: row.location || "暂未定位",
      path: row.path,
      visitedAt: row.visited_at?.toISOString?.() ?? row.visited_at,
    })),
  };
});

app.post(
  "/api/admin/posts",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    let post;
    try {
      post = normalizePostPayload(request.body);
    } catch (error) {
      return reply.code(400).send({ error: "INVALID_POST", message: error.message });
    }
    let automaticEnglish;
    try {
      automaticEnglish = await buildAutomaticEnglish(post, {}, { translateText });
      post.translations = automaticEnglish.translations;
    } catch (error) {
      request.log.error({ err: error }, "automatic English translation failed");
      return reply.code(502).send({
        error: "TRANSLATION_FAILED",
        message: "英文版自动生成失败，请稍后重试。中文内容尚未保存。",
      });
    }
    const id = randomUUID();
    try {
      const { rows } = await pool.query(
        `INSERT INTO posts
          (id, slug, content_type, title, summary, category, tags, code, read_time,
           content_markdown, cover_url, gallery, translations, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15)
         RETURNING *`,
        [
          id, post.slug, post.contentType, post.title, post.summary, post.category,
          JSON.stringify(post.tags), post.code, post.readTime, post.contentMarkdown,
          post.coverUrl, JSON.stringify(post.gallery), JSON.stringify(post.translations),
          post.status, post.publishedAt,
        ],
      );
      await pool.query(
        "INSERT INTO revisions (id, post_id, snapshot) VALUES ($1, $2, $3::jsonb)",
        [randomUUID(), id, JSON.stringify(mapPost(rows[0]))],
      );
      return reply.code(201).send({
        post: mapPost(rows[0]),
        translation: { status: automaticEnglish.status },
      });
    } catch (error) {
      if (error.code === "23505") {
        return reply.code(409).send({ error: "SLUG_EXISTS", message: "内容链接已经被使用。" });
      }
      throw error;
    }
  },
);

app.put(
  "/api/admin/posts/:id",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    let post;
    try {
      post = normalizePostPayload(request.body);
    } catch (error) {
      return reply.code(400).send({ error: "INVALID_POST", message: error.message });
    }
    const existing = await pool.query("SELECT * FROM posts WHERE id = $1", [request.params.id]);
    if (!existing.rows.length) {
      return reply.code(404).send({ error: "NOT_FOUND", message: "内容不存在。" });
    }
    let automaticEnglish;
    try {
      const currentPost = mapPost(existing.rows[0]);
      automaticEnglish = await buildAutomaticEnglish(post, currentPost.translations, {
        translateText,
        sourceUnchanged: translationSourceHash(currentPost) === translationSourceHash(post),
      });
      post.translations = automaticEnglish.translations;
    } catch (error) {
      request.log.error({ err: error }, "automatic English translation failed");
      return reply.code(502).send({
        error: "TRANSLATION_FAILED",
        message: "英文版自动生成失败，请稍后重试。中文内容尚未保存。",
      });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT * FROM posts WHERE id = $1 FOR UPDATE", [request.params.id]);
      if (!current.rows.length) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "NOT_FOUND", message: "内容不存在。" });
      }
      await client.query(
        "INSERT INTO revisions (id, post_id, snapshot) VALUES ($1, $2, $3::jsonb)",
        [randomUUID(), request.params.id, JSON.stringify(mapPost(current.rows[0]))],
      );
      const result = await client.query(
        `UPDATE posts SET
          slug = $2, content_type = $3, title = $4, summary = $5, category = $6,
          tags = $7::jsonb, code = $8, read_time = $9, content_markdown = $10,
          cover_url = $11, gallery = $12::jsonb, translations = $13::jsonb,
          status = $14, published_at = $15, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          request.params.id, post.slug, post.contentType, post.title, post.summary,
          post.category, JSON.stringify(post.tags), post.code, post.readTime,
          post.contentMarkdown, post.coverUrl, JSON.stringify(post.gallery),
          JSON.stringify(post.translations), post.status, post.publishedAt,
        ],
      );
      await client.query("COMMIT");
      return {
        post: mapPost(result.rows[0]),
        translation: { status: automaticEnglish.status },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return reply.code(409).send({ error: "SLUG_EXISTS", message: "内容链接已经被使用。" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.delete(
  "/api/admin/posts/:id",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    const result = await pool.query("DELETE FROM posts WHERE id = $1", [request.params.id]);
    return result.rowCount ? { ok: true } : reply.code(404).send({ error: "NOT_FOUND" });
  },
);

app.get(
  "/api/admin/posts/:id/revisions",
  { preHandler: [requireAdmin] },
  async (request) => {
    const { rows } = await pool.query(
      "SELECT id, snapshot, created_at FROM revisions WHERE post_id = $1 ORDER BY created_at DESC LIMIT 30",
      [request.params.id],
    );
    return {
      revisions: rows.map((row) => ({
        id: row.id,
        snapshot: row.snapshot,
        createdAt: row.created_at?.toISOString?.() ?? row.created_at,
      })),
    };
  },
);

app.post(
  "/api/admin/posts/:id/revisions/:revisionId/restore",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    const revision = await pool.query(
      "SELECT snapshot FROM revisions WHERE id = $1 AND post_id = $2",
      [request.params.revisionId, request.params.id],
    );
    if (!revision.rows.length) return reply.code(404).send({ error: "NOT_FOUND" });
    const current = await pool.query(
      "SELECT content_type, gallery, translations FROM posts WHERE id = $1",
      [request.params.id],
    );
    if (!current.rows.length) return reply.code(404).send({ error: "NOT_FOUND" });
    const snapshotPayload = revision.rows[0].snapshot;
    const snapshot = normalizePostPayload({
      ...snapshotPayload,
      contentType: snapshotPayload.contentType ?? current.rows[0].content_type,
      gallery: snapshotPayload.gallery ?? current.rows[0].gallery,
      translations: snapshotPayload.translations ?? current.rows[0].translations,
    });
    const result = await pool.query(
      `UPDATE posts SET slug = $2, content_type = $3, title = $4, summary = $5,
       category = $6, tags = $7::jsonb, code = $8, read_time = $9,
       content_markdown = $10, cover_url = $11, gallery = $12::jsonb,
       translations = $13::jsonb, status = $14, published_at = $15, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        request.params.id, snapshot.slug, snapshot.contentType, snapshot.title,
        snapshot.summary, snapshot.category, JSON.stringify(snapshot.tags), snapshot.code,
        snapshot.readTime, snapshot.contentMarkdown, snapshot.coverUrl,
        JSON.stringify(snapshot.gallery), JSON.stringify(snapshot.translations),
        snapshot.status, snapshot.publishedAt,
      ],
    );
    return { post: mapPost(result.rows[0]) };
  },
);

app.get("/api/admin/media", { preHandler: [requireAdmin] }, async () => {
  const { rows } = await pool.query("SELECT * FROM assets ORDER BY created_at DESC");
  return { assets: rows.map(mapAsset) };
});

app.post(
  "/api/admin/media",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    let filePart;
    let alt = "";
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (filePart) return reply.code(400).send({ error: "ONE_FILE_ONLY" });
        filePart = {
          filename: part.filename,
          clientMime: part.mimetype,
          buffer: await part.toBuffer(),
        };
      } else if (part.fieldname === "alt") {
        alt = cleanText(part.value, 180);
      }
    }
    if (!filePart) return reply.code(400).send({ error: "FILE_REQUIRED", message: "请选择图片。" });
    const detected = detectImage(filePart.buffer);
    if (!detected) {
      return reply.code(415).send({ error: "UNSUPPORTED_IMAGE", message: "仅支持 JPEG、PNG、WebP 和 GIF。" });
    }
    let sanitizedBuffer;
    try {
      sanitizedBuffer = sanitizeImageMetadata(filePart.buffer, detected.mime);
    } catch {
      return reply.code(422).send({ error: "INVALID_IMAGE", message: "图片结构不完整或已损坏。" });
    }
    const hash = createHash("sha256").update(sanitizedBuffer).digest("hex").slice(0, 16);
    const objectKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${hash}.${detected.extension}`;
    const destination = path.join(uploadDirectory, objectKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, sanitizedBuffer, { flag: "wx" });
    const id = randomUUID();
    const publicUrl = `/uploads/${objectKey}`;
    try {
      const { rows } = await pool.query(
        `INSERT INTO assets
          (id, object_key, filename, mime_type, size_bytes, alt_text, public_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id, objectKey, cleanText(filePart.filename, 240) || `${id}.${detected.extension}`,
          detected.mime, sanitizedBuffer.length, alt, publicUrl,
        ],
      );
      return reply.code(201).send({ asset: mapAsset(rows[0]) });
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  },
);

app.delete(
  "/api/admin/media/:id",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request, reply) => {
    const asset = await pool.query("SELECT * FROM assets WHERE id = $1", [request.params.id]);
    if (!asset.rows.length) return reply.code(404).send({ error: "NOT_FOUND" });
    const row = asset.rows[0];
    const usage = await pool.query(
      "SELECT 1 FROM posts WHERE cover_url = $1 OR content_markdown LIKE $2 OR gallery::text LIKE $2 OR translations::text LIKE $2 LIMIT 1",
      [row.public_url, `%${row.public_url}%`],
    );
    if (usage.rows.length) {
      return reply.code(409).send({ error: "ASSET_IN_USE", message: "图片仍被内容引用，无法删除。" });
    }
    await pool.query("DELETE FROM assets WHERE id = $1", [request.params.id]);
    await unlink(path.join(uploadDirectory, row.object_key)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return { ok: true };
  },
);

app.get("/api/admin/settings", { preHandler: [requireAdmin] }, async () => {
  const { rows } = await pool.query("SELECT setting_key, setting_value FROM site_settings");
  return { settings: Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])) };
});

app.put(
  "/api/admin/settings",
  { preHandler: [verifyMutationOrigin, requireAdmin] },
  async (request) => {
    const allowedKeys = new Set(["siteTitle", "tagline", "bio", "defaultCategory", "defaultAuthor"]);
    const entries = Object.entries(request.body || {}).filter(([key]) => allowedKeys.has(key));
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO site_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
    }
    return { ok: true };
  },
);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (error.code === "FST_REQ_FILE_TOO_LARGE") {
    return reply.code(413).send({ error: "FILE_TOO_LARGE", message: "图片不能超过 10 MB。" });
  }
  return reply.code(error.statusCode || 500).send({
    error: "INTERNAL_ERROR",
    message: error.statusCode && error.statusCode < 500 ? error.message : "服务器暂时无法处理请求。",
  });
});

const close = async (signal) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGTERM", () => void close("SIGTERM"));
process.on("SIGINT", () => void close("SIGINT"));

await app.listen({ host: "0.0.0.0", port });
