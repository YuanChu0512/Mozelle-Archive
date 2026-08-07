import { createHash } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 120_000;
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

export class TranslationServiceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "TranslationServiceError";
  }
}

function stableSource(post) {
  return {
    title: post.title || "",
    summary: post.summary || "",
    tags: Array.isArray(post.tags) ? post.tags : [],
    contentMarkdown: post.contentMarkdown || "",
    gallery: Array.isArray(post.gallery)
      ? post.gallery.map((item) => ({
          src: item?.src || "",
          alt: item?.alt || "",
          caption: item?.caption || "",
        }))
      : [],
  };
}

export function translationSourceHash(post) {
  return createHash("sha256")
    .update(JSON.stringify(stableSource(post)))
    .digest("hex");
}

export function createLibreTranslateClient({
  origin = process.env.TRANSLATION_ORIGIN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const baseUrl = typeof origin === "string" ? origin.replace(/\/$/, "") : "";

  return async function translateText(text) {
    if (!text || !CJK_PATTERN.test(text)) return text || "";
    if (!baseUrl) {
      throw new TranslationServiceError("自动翻译服务尚未配置。");
    }

    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/translate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: "zh",
            target: "en",
            format: "text",
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`translation service returned ${response.status}`);
        }
        const payload = await response.json();
        if (typeof payload?.translatedText !== "string") {
          throw new Error("translation service returned an invalid payload");
        }
        return payload.translatedText;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new TranslationServiceError("自动翻译暂时不可用，请稍后重试。", {
      cause: lastError,
    });
  };
}

function protectMarkdown(text) {
  const tokens = [];
  const protect = (value) => {
    const token = `ZXQKEEP${tokens.length}QXZ`;
    tokens.push({ token, value });
    return token;
  };

  let protectedText = text.replace(/`[^`\n]+`/g, protect);
  protectedText = protectedText.replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (_match, start, url, end) => (
    `${start}${protect(url)}${end}`
  ));
  protectedText = protectedText.replace(/https?:\/\/[^\s)]+/g, protect);
  protectedText = protectedText.replace(
    /^(\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+))/gm,
    protect,
  );
  return { protectedText, tokens };
}

function restoreMarkdown(text, tokens) {
  let restored = text;
  for (const { token, value } of tokens) {
    const index = token.match(/\d+/)?.[0] || "";
    const pattern = new RegExp(`ZXQ\\s*KEEP\\s*${index}\\s*QXZ`, "i");
    if (!pattern.test(restored)) {
      throw new TranslationServiceError("翻译结果破坏了正文中的链接或代码标记。");
    }
    restored = restored.replace(pattern, value);
  }
  return restored;
}

function markdownChunks(block, maximumLength = 3_500) {
  const parts = block.split(/(\n{2,})/);
  const chunks = [];
  let current = "";
  for (const part of parts) {
    if (current && current.length + part.length > maximumLength) {
      chunks.push(current);
      current = "";
    }
    current += part;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateMarkdown(markdown, translateText) {
  const blocks = markdown.split(/(```[\s\S]*?```)/g);
  const translated = [];

  for (const block of blocks) {
    if (!block || block.startsWith("```")) {
      translated.push(block);
      continue;
    }

    for (const chunk of markdownChunks(block)) {
      if (!CJK_PATTERN.test(chunk)) {
        translated.push(chunk);
        continue;
      }
      const { protectedText, tokens } = protectMarkdown(chunk);
      const result = await translateText(protectedText);
      translated.push(restoreMarkdown(result, tokens));
    }
  }

  return translated.join("");
}

function hasUsefulEnglish(translation) {
  return Boolean(
    translation &&
    (translation.title?.trim() ||
      translation.summary?.trim() ||
      translation.contentMarkdown?.trim()),
  );
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function buildAutomaticEnglish(
  post,
  previousTranslations = {},
  { translateText, sourceUnchanged = false } = {},
) {
  const sourceHash = translationSourceHash(post);
  const previous = previousTranslations?.en || {};
  if (
    hasUsefulEnglish(previous) &&
    (previous.auto?.sourceHash === sourceHash || sourceUnchanged)
  ) {
    return {
      status: "preserved",
      translations: {
        en: {
          ...previous,
          auto: {
            sourceHash,
            generatedAt: previous.auto?.generatedAt || new Date().toISOString(),
            engine: previous.auto?.engine || "libretranslate-argos",
          },
        },
      },
    };
  }

  if (typeof translateText !== "function") {
    throw new TranslationServiceError("自动翻译服务尚未配置。");
  }

  const [title, summary, tags, contentMarkdown, gallery] = await Promise.all([
    translateText(post.title),
    translateText(post.summary),
    mapWithConcurrency(post.tags || [], 2, (tag) => translateText(tag)),
    translateMarkdown(post.contentMarkdown || "", translateText),
    mapWithConcurrency(post.gallery || [], 2, async (item) => ({
      src: item.src,
      alt: await translateText(item.alt || ""),
      caption: await translateText(item.caption || ""),
    })),
  ]);

  return {
    status: "generated",
    translations: {
      en: {
        title,
        summary,
        tags,
        contentMarkdown,
        gallery,
        sources: Array.isArray(previous.sources) ? previous.sources : [],
        auto: {
          sourceHash,
          generatedAt: new Date().toISOString(),
          engine: "libretranslate-argos",
        },
      },
    },
  };
}
