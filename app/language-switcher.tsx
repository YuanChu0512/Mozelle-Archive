"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Language } from "./i18n";

type GlyphPhase = "decompose" | "reassemble";

type GlyphCandidate = {
  character: string;
  endOffset: number;
  startOffset: number;
  textNode: Text;
};

type CanvasGlyph = {
  delay: number;
  driftX: number;
  driftY: number;
  height: number;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  width: number;
  x: number;
  y: number;
};

type CanvasScene = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  glyphs: CanvasGlyph[];
  height: number;
  source: HTMLCanvasElement;
  width: number;
};

type ManagedLanguageLayer = {
  element: HTMLElement;
  remove: () => void;
};

function collectGlyphs(node: HTMLElement) {
  const candidates: GlyphCandidate[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode() as Text | null;

  while (textNode) {
    const candidateNode = textNode;
    const value = textNode.nodeValue ?? "";
    let textOffset = 0;
    Array.from(value).forEach((character) => {
      const startOffset = textOffset;
      textOffset += character.length;
      if (!character.trim()) return;
      candidates.push({
        character,
        endOffset: textOffset,
        startOffset,
        textNode: candidateNode,
      });
    });
    textNode = walker.nextNode() as Text | null;
  }

  return candidates;
}

function isTransparentColor(color: string) {
  const normalized = color.replaceAll(" ", "").toLowerCase();
  return normalized === "transparent"
    || normalized === "#0000"
    || normalized === "rgba(0,0,0,0)";
}

function isVisibleToken(node: HTMLElement) {
  const bounds = node.getBoundingClientRect();
  return bounds.width > 0
    && bounds.height > 0
    && bounds.bottom > 0
    && bounds.top < window.innerHeight
    && bounds.right > 0
    && bounds.left < window.innerWidth;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createCanvasGradient(
  context: CanvasRenderingContext2D,
  backgroundImage: string,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
) {
  if (!backgroundImage.startsWith("linear-gradient")) return null;
  const colorPattern = /(rgba?\([^)]*\)|#[\da-f]{3,8})(?:\s+([\d.]+)%?)?/gi;
  const stops: Array<{ color: string; position: number | null }> = [];
  let match = colorPattern.exec(backgroundImage);
  while (match) {
    stops.push({
      color: match[1],
      position: match[2] ? clamp(Number(match[2]) / 100) : null,
    });
    match = colorPattern.exec(backgroundImage);
  }
  if (stops.length < 2) return null;

  const angleMatch = backgroundImage.match(/linear-gradient\(\s*(-?[\d.]+)deg/i);
  const angle = Number(angleMatch?.[1] ?? 180) * Math.PI / 180;
  const directionX = Math.sin(angle);
  const directionY = -Math.cos(angle);
  const centerX = offsetX + width / 2;
  const centerY = offsetY + height / 2;
  const reach = (Math.abs(width * directionX) + Math.abs(height * directionY)) / 2;
  const gradient = context.createLinearGradient(
    centerX - directionX * reach,
    centerY - directionY * reach,
    centerX + directionX * reach,
    centerY + directionY * reach,
  );

  stops.forEach((stop, index) => {
    const position = stop.position ?? index / Math.max(1, stops.length - 1);
    gradient.addColorStop(position, stop.color);
  });
  return gradient;
}

function createTokenLayer(nodes: HTMLElement[], phase: GlyphPhase) {
  const layer = document.createElement("div");
  layer.className = `language-token-layer is-${phase}`;
  layer.dataset.tokenPhase = phase;
  layer.setAttribute("aria-hidden", "true");
  let tokenCount = 0;

  nodes.forEach((node, index) => {
    if (!node.isConnected) return;
    const bounds = node.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const style = window.getComputedStyle(node);
    const clone = node.cloneNode(true) as HTMLElement;
    clone.className = "language-token-clone";
    clone.removeAttribute("id");
    clone.removeAttribute("data-lang-token");
    clone.removeAttribute("data-lang-phase");
    clone.querySelectorAll<HTMLElement>("[id]").forEach((child) => child.removeAttribute("id"));
    clone.querySelectorAll<HTMLElement>("[data-lang-token]").forEach((child) => {
      child.removeAttribute("data-lang-token");
      child.removeAttribute("data-lang-phase");
    });
    clone.setAttribute("aria-hidden", "true");
    clone.style.left = `${bounds.left}px`;
    clone.style.top = `${bounds.top}px`;
    clone.style.width = `${bounds.width}px`;
    clone.style.height = `${bounds.height}px`;
    clone.style.margin = "0";
    clone.style.padding = style.padding;
    clone.style.color = style.color;
    clone.style.fontFamily = style.fontFamily;
    clone.style.fontSize = style.fontSize;
    clone.style.fontStyle = style.fontStyle;
    clone.style.fontWeight = style.fontWeight;
    clone.style.fontStretch = style.fontStretch;
    clone.style.fontVariant = style.fontVariant;
    clone.style.letterSpacing = style.letterSpacing;
    clone.style.lineHeight = style.lineHeight;
    clone.style.textAlign = style.textAlign;
    clone.style.textShadow = style.textShadow;
    clone.style.textTransform = style.textTransform;
    clone.style.whiteSpace = style.whiteSpace;
    clone.style.wordBreak = style.wordBreak;
    clone.style.overflowWrap = style.overflowWrap;
    clone.style.backgroundImage = style.backgroundImage;
    clone.style.backgroundPosition = style.backgroundPosition;
    clone.style.backgroundSize = style.backgroundSize;
    clone.style.backgroundRepeat = style.backgroundRepeat;
    clone.style.backgroundClip = style.backgroundClip;
    clone.style.setProperty("-webkit-background-clip", style.getPropertyValue("-webkit-background-clip"));
    clone.style.setProperty("-webkit-text-fill-color", style.getPropertyValue("-webkit-text-fill-color"));
    const shiftX = ((index % 3) - 1) * 5;
    const shiftY = index % 2 ? 5 : -4;
    clone.style.setProperty("--token-delay", `${(index % 6) * 7}ms`);
    clone.style.setProperty("--token-shift-x", `${shiftX}px`);
    clone.style.setProperty("--token-shift-y", `${shiftY}px`);
    clone.style.setProperty("--token-shift-x-reverse", `${shiftX * -1}px`);
    clone.style.setProperty("--token-shift-y-reverse", `${shiftY * -1}px`);
    layer.appendChild(clone);
    tokenCount += 1;
  });

  if (!tokenCount) return null;
  layer.dataset.tokenCount = String(tokenCount);
  document.body.appendChild(layer);
  return layer;
}

function createCanvasGlyphLayer(
  nodes: HTMLElement[],
  phase: GlyphPhase,
  liteMotion: boolean,
): ManagedLanguageLayer | null {
  const layer = document.createElement("div");
  layer.className = `language-canvas-layer is-${phase}`;
  layer.dataset.glyphPhase = phase;
  layer.setAttribute("aria-hidden", "true");
  const shell = document.querySelector<HTMLElement>(".site-shell");
  const shellStyle = shell ? window.getComputedStyle(shell) : null;
  const fallbackColor = shellStyle?.getPropertyValue("--ink").trim() || "currentColor";
  const styleCache = new WeakMap<HTMLElement, CSSStyleDeclaration>();
  const scenes: CanvasScene[] = [];
  const pixelRatio = liteMotion ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  const motionPadding = liteMotion ? 34 : 58;
  let glyphIndex = 0;

  nodes.forEach((node, tokenIndex) => {
    if (!node.isConnected) return;
    const tokenBounds = node.getBoundingClientRect();
    if (!tokenBounds.width || !tokenBounds.height) return;
    const tokenCenterX = tokenBounds.left + tokenBounds.width / 2;
    const tokenCenterY = tokenBounds.top + tokenBounds.height / 2;
    const canvasLeft = tokenBounds.left - motionPadding;
    const canvasTop = tokenBounds.top - motionPadding;
    const canvasWidth = Math.ceil(tokenBounds.width + motionPadding * 2);
    const canvasHeight = Math.ceil(tokenBounds.height + motionPadding * 2);
    const canvas = document.createElement("canvas");
    canvas.className = "language-token-canvas";
    canvas.width = Math.ceil(canvasWidth * pixelRatio);
    canvas.height = Math.ceil(canvasHeight * pixelRatio);
    canvas.style.left = `${canvasLeft}px`;
    canvas.style.top = `${canvasTop}px`;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const source = document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceContext = source.getContext("2d", { alpha: true });
    if (!sourceContext) return;
    sourceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const tokenStyle = window.getComputedStyle(node);
    const tokenGradient = tokenStyle.backgroundImage !== "none"
      ? createCanvasGradient(
          sourceContext,
          tokenStyle.backgroundImage,
          tokenBounds.width,
          tokenBounds.height,
          motionPadding,
          motionPadding,
        )
      : null;
    const glyphs: CanvasGlyph[] = [];

    collectGlyphs(node).forEach(({ character, endOffset, startOffset, textNode }, localIndex) => {
      const parent = textNode.parentElement ?? node;
      let style = styleCache.get(parent);
      if (!style) {
        style = window.getComputedStyle(parent);
        styleCache.set(parent, style);
      }
      const textFillColor = style.getPropertyValue("-webkit-text-fill-color");
      const parentGradient = style.backgroundImage !== "none"
        ? createCanvasGradient(
            sourceContext,
            style.backgroundImage,
            tokenBounds.width,
            tokenBounds.height,
            motionPadding,
            motionPadding,
          )
        : null;
      const hasTransparentText = isTransparentColor(style.color)
        || isTransparentColor(textFillColor);
      const glyphFill = hasTransparentText
        ? parentGradient ?? tokenGradient ?? fallbackColor
        : style.color;

      const range = document.createRange();
      range.setStart(textNode, startOffset);
      range.setEnd(textNode, endOffset);
      const bounds = range.getBoundingClientRect();
      range.detach();
      if (
        bounds.width <= 0
        || bounds.height <= 0
        || bounds.bottom <= 0
        || bounds.top >= window.innerHeight
        || bounds.right <= 0
        || bounds.left >= window.innerWidth
      ) return;

      sourceContext.font = [
        style.fontStyle,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
      ].filter(Boolean).join(" ");
      sourceContext.textAlign = "left";
      sourceContext.textBaseline = "alphabetic";
      sourceContext.fillStyle = glyphFill;
      const metrics = sourceContext.measureText(character);
      const ascent = metrics.actualBoundingBoxAscent || bounds.height * 0.76;
      const descent = metrics.actualBoundingBoxDescent || bounds.height * 0.16;
      const glyphX = bounds.left - canvasLeft;
      const glyphY = bounds.top - canvasTop;
      const baseline = glyphY + Math.max(
        ascent,
        (bounds.height - ascent - descent) / 2 + ascent,
      );
      sourceContext.fillText(character, glyphX, baseline);

      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const outwardX = centerX - tokenCenterX;
      const outwardY = centerY - tokenCenterY;
      const outwardLength = Math.max(1, Math.hypot(outwardX, outwardY));
      const seed = glyphIndex * 37 + tokenIndex * 61 + (character.codePointAt(0) ?? 0);
      const angle = ((seed * 137.508) % 360) * (Math.PI / 180);
      const distance = (liteMotion ? 14 : 23) + seed % (liteMotion ? 10 : 21);
      const cropPadding = 3;
      const sourceX = Math.max(0, glyphX - cropPadding);
      const sourceY = Math.max(0, glyphY - cropPadding);
      const sourceWidth = Math.min(
        canvasWidth - sourceX,
        Math.max(1, bounds.width + cropPadding * 2),
      );
      const sourceHeight = Math.min(
        canvasHeight - sourceY,
        Math.max(1, bounds.height + cropPadding * 2),
      );
      glyphs.push({
        delay: (localIndex % 11) * 3 + (tokenIndex % 4) * 3,
        driftX: outwardX / outwardLength * distance + Math.cos(angle) * (liteMotion ? 4 : 9),
        driftY: outwardY / outwardLength * distance + Math.sin(angle) * (liteMotion ? 4 : 9),
        height: sourceHeight,
        sourceHeight,
        sourceWidth,
        sourceX,
        sourceY,
        width: sourceWidth,
        x: sourceX,
        y: sourceY,
      });
      glyphIndex += 1;
    });

    if (!glyphs.length) return;
    layer.appendChild(canvas);
    scenes.push({
      canvas,
      context,
      glyphs,
      height: canvasHeight,
      source,
      width: canvasWidth,
    });
  });

  if (!glyphIndex || !scenes.length) return null;
  layer.dataset.glyphCount = String(glyphIndex);
  layer.dataset.tokenCount = String(scenes.length);

  const duration = phase === "decompose" ? 430 : 520;
  const drawFrame = (elapsed: number) => {
    scenes.forEach((scene) => {
      const { context, glyphs, height, source, width } = scene;
      context.clearRect(0, 0, width, height);
      glyphs.forEach((glyph) => {
        const progress = clamp((elapsed - glyph.delay) / Math.max(1, duration - glyph.delay));
        const eased = phase === "decompose"
          ? progress * progress
          : 1 - (1 - progress) ** 3;
        const visibility = phase === "decompose"
          ? 1 - progress ** 1.55
          : progress ** 0.78;
        const travel = phase === "decompose" ? eased : 1 - eased;
        const scale = phase === "decompose"
          ? 1 - eased * 0.36
          : 0.64 + eased * 0.36;
        const targetWidth = glyph.width * scale;
        const targetHeight = glyph.height * scale;
        const targetX = glyph.x + glyph.driftX * travel + (glyph.width - targetWidth) / 2;
        const targetY = glyph.y + glyph.driftY * travel + (glyph.height - targetHeight) / 2;
        context.globalAlpha = visibility;
        context.drawImage(
          source,
          Math.round(glyph.sourceX * pixelRatio),
          Math.round(glyph.sourceY * pixelRatio),
          Math.max(1, Math.round(glyph.sourceWidth * pixelRatio)),
          Math.max(1, Math.round(glyph.sourceHeight * pixelRatio)),
          targetX,
          targetY,
          targetWidth,
          targetHeight,
        );
      });
      context.globalAlpha = 1;
    });
  };

  drawFrame(0);
  document.body.appendChild(layer);
  let animationFrame = 0;
  let nextRenderAt = 0;
  const startedAt = performance.now();
  const particleFrameRate = Number(
    document.querySelector<HTMLCanvasElement>(".rhodes-particle-logo")?.dataset.targetFps,
  );
  const targetFrameRate = liteMotion
    ? 60
    : Math.min(144, Math.max(60, particleFrameRate || 144));
  const frameInterval = 1000 / targetFrameRate;
  const tick = (time: number) => {
    if (!nextRenderAt) nextRenderAt = time;
    if (time + 0.2 >= nextRenderAt) {
      drawFrame(Math.min(duration, time - startedAt));
      nextRenderAt += frameInterval;
      if (time - nextRenderAt > frameInterval * 2) nextRenderAt = time + frameInterval;
    }
    if (time - startedAt < duration) animationFrame = window.requestAnimationFrame(tick);
  };
  animationFrame = window.requestAnimationFrame(tick);

  return {
    element: layer,
    remove: () => {
      window.cancelAnimationFrame(animationFrame);
      layer.remove();
    },
  };
}

export function useLanguageSwitcher() {
  const [language, setLanguage] = useState<Language>("zh");
  const [switching, setSwitching] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<Language>("en");
  const timers = useRef<number[]>([]);
  const layers = useRef<Array<{ remove: () => void }>>([]);
  const sequence = useRef(0);

  useEffect(() => {
    const scheduledTimers = timers.current;
    const glyphLayers = layers.current;
    const saved = window.localStorage.getItem("mozelle-language");
    const initial: Language = saved === "en" ? "en" : "zh";
    const root = document.documentElement;
    root.dataset.language = initial;
    root.lang = initial === "en" ? "en" : "zh-CN";
    let active = true;
    queueMicrotask(() => {
      if (active) setLanguage(initial);
    });
    return () => {
      active = false;
      sequence.current += 1;
      scheduledTimers.forEach((timer) => window.clearTimeout(timer));
      glyphLayers.forEach((layer) => layer.remove());
      document.querySelectorAll<HTMLElement>("[data-lang-phase]").forEach((node) => {
        delete node.dataset.langPhase;
      });
      delete root.dataset.languageEffect;
      delete root.dataset.languageSwitching;
    };
  }, []);

  const toggleLanguage = (event: MouseEvent<HTMLButtonElement>) => {
    if (switching) return;
    const switchSequence = sequence.current + 1;
    sequence.current = switchSequence;
    const next: Language = language === "zh" ? "en" : "zh";
    const root = document.documentElement;
    const rect = event.currentTarget.getBoundingClientRect();
    const reducedMotion = root.dataset.motion === "lite";
    const liteMotion = root.dataset.motion === "lite" || window.innerWidth <= 720;
    root.style.setProperty("--language-x", `${rect.left + rect.width / 2}px`);
    root.style.setProperty("--language-y", `${rect.top + rect.height / 2}px`);

    const visibleTokens = Array.from(
      document.querySelectorAll<HTMLElement>("[data-lang-token]"),
    ).filter(isVisibleToken);
    const animatedTokens = new Set(visibleTokens);

    const outgoingTokenLayer = reducedMotion
      ? null
      : createTokenLayer(visibleTokens, "decompose");
    const outgoingGlyphLayer = reducedMotion
      ? null
      : createCanvasGlyphLayer(visibleTokens, "decompose", liteMotion);
    if (outgoingTokenLayer) layers.current.push({ remove: () => outgoingTokenLayer.remove() });
    if (outgoingGlyphLayer) layers.current.push(outgoingGlyphLayer);
    visibleTokens.forEach((node) => {
      node.dataset.langPhase = reducedMotion ? "reduced" : "decompose";
    });
    root.dataset.languageSwitching = next;
    root.dataset.languageEffect = reducedMotion ? "reduced" : "decompose";
    setTargetLanguage(next);
    setSwitching(true);

    const swapDelay = reducedMotion ? 0 : 360;
    const totalDuration = reducedMotion ? 140 : 1060;
    timers.current.push(window.setTimeout(() => {
      setLanguage(next);
      root.dataset.language = next;
      root.lang = next === "en" ? "en" : "zh-CN";
      window.localStorage.setItem("mozelle-language", next);
    }, swapDelay));

    if (!reducedMotion) {
      timers.current.push(window.setTimeout(() => {
        outgoingTokenLayer?.remove();
        outgoingGlyphLayer?.remove();
      }, 460));
      timers.current.push(window.setTimeout(() => {
        if (sequence.current !== switchSequence) return;
        const incomingTokens = Array.from(
          document.querySelectorAll<HTMLElement>("[data-lang-token]"),
        ).filter(isVisibleToken);
        incomingTokens.forEach((node) => animatedTokens.add(node));
        const incomingTokenLayer = createTokenLayer(incomingTokens, "reassemble");
        const incomingGlyphLayer = createCanvasGlyphLayer(
          incomingTokens,
          "reassemble",
          liteMotion,
        );
        if (incomingTokenLayer) layers.current.push({ remove: () => incomingTokenLayer.remove() });
        if (incomingGlyphLayer) layers.current.push(incomingGlyphLayer);
        incomingTokens.forEach((node) => {
          node.dataset.langPhase = "reassemble";
        });
        root.dataset.languageEffect = "reassemble";
      }, 465));
    }

    timers.current.push(window.setTimeout(() => {
      if (sequence.current !== switchSequence) return;
      sequence.current += 1;
      animatedTokens.forEach((node) => {
        if (node.isConnected) delete node.dataset.langPhase;
      });
      layers.current.forEach((layer) => layer.remove());
      layers.current.length = 0;
      delete root.dataset.languageEffect;
      delete root.dataset.languageSwitching;
      setSwitching(false);
    }, totalDuration));
  };

  return { language, switching, targetLanguage, toggleLanguage };
}

export function LanguageReassembly({
  active,
  target,
}: {
  active: boolean;
  target: Language;
}) {
  return (
    <div className={`language-reassembly ${active ? "is-active" : ""}`} aria-hidden="true">
      <span className="language-reassembly-axis axis-x" />
      <span className="language-reassembly-axis axis-y" />
      <span className="language-reassembly-readout">
        <small>GLYPH / DECODE</small>
        <strong>{target === "en" ? "EN" : "中文"}</strong>
      </span>
    </div>
  );
}
