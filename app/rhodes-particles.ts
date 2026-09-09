export function mountRhodesParticles(visual: HTMLElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  if (!context) return;

  type RhodesParticle = {
    ox: number;
    oy: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    phase: number;
    size: number;
    bright: boolean;
  };

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const prefersReducedMotion = document.documentElement.dataset.motion === "lite";
  const lowPower =
    document.documentElement.dataset.motion === "lite" || coarsePointer;
  const particles: RhodesParticle[] = [];
  const pointer = { x: -10_000, y: -10_000, active: false };
  const sourceImage = new window.Image();
  sourceImage.decoding = "async";

  const maxFrameRate = 144;
  const lowPowerFrameRate = 30;
  const baselineFrameDuration = 1000 / 32;
  const refreshSamples: number[] = [];
  let samplesSinceRefreshUpdate = 0;
  let frame = 0;
  let lastAnimationFrame = 0;
  let lastRenderFrame = 0;
  let nextRenderAt = 0;
  let targetFrameRate = lowPower ? lowPowerFrameRate : 60;
  let targetFrameDuration = 1000 / targetFrameRate;
  let width = 0;
  let height = 0;
  let visualRect = visual.getBoundingClientRect();
  let imageReady = false;
  let destroyed = false;
  let assembledOnce = false;
  let assemblyStartedAt = 0;
  let sceneStartedAt = performance.now();
  let lastActivityAt = sceneStartedAt;
  let inView = visualRect.bottom > 0 && visualRect.top < window.innerHeight;

  const drawParticles = (
    now: number,
    update = true,
    elapsed = baselineFrameDuration,
  ) => {
    context.clearRect(0, 0, width, height);
    if (!particles.length) return;

    const frameScale = Math.min(3, Math.max(0.2, elapsed / baselineFrameDuration));
    const pointerRadius = lowPower ? 52 : 76;
    const pointerRadiusSquared = pointerRadius * pointerRadius;
    const assembling = assemblyStartedAt > 0 && now - assemblyStartedAt < 1150;
    const spring = lowPower ? 0.024 : assembling ? 0.042 : 0.029;
    const friction = lowPower ? 0.8 : 0.83;
    const scaledFriction = Math.pow(friction, frameScale);
    const drift = assembling ? (lowPower ? 0.08 : 0.24) : pointer.active ? 0.14 : 0;

    context.globalCompositeOperation = "source-over";
    context.beginPath();
    for (const particle of particles) {
      if (update) {
        if (pointer.active && !coarsePointer && !prefersReducedMotion) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > 0.1 && distanceSquared < pointerRadiusSquared) {
            const distance = Math.sqrt(distanceSquared);
            const falloff = 1 - distance / pointerRadius;
            const force = falloff * falloff * 2.35 * frameScale;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        const targetX =
          particle.ox + Math.sin(now * 0.00072 + particle.phase) * drift;
        const targetY =
          particle.oy + Math.cos(now * 0.00061 + particle.phase) * drift;
        particle.vx =
          (particle.vx + (targetX - particle.x) * spring * frameScale) *
          scaledFriction;
        particle.vy =
          (particle.vy + (targetY - particle.y) * spring * frameScale) *
          scaledFriction;
        particle.x += particle.vx * frameScale;
        particle.y += particle.vy * frameScale;
      }
      context.rect(particle.x, particle.y, particle.size, particle.size);
    }
    context.fillStyle = lowPower
      ? "rgba(148, 255, 178, .88)"
      : "rgba(136, 255, 171, .96)";
    context.fill();

    context.beginPath();
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.bright) continue;
      const glowSize = particle.size * 1.7;
      context.rect(
        particle.x - glowSize * 0.22,
        particle.y - glowSize * 0.22,
        glowSize,
        glowSize,
      );
    }
    context.fillStyle = "rgba(238, 255, 148, 1)";
    context.fill();
  };

  const updateRefreshRate = (now: number) => {
    if (lastAnimationFrame > 0) {
      const sample = now - lastAnimationFrame;
      if (sample >= 3 && sample <= 50) {
        refreshSamples.push(sample);
        if (refreshSamples.length > 36) refreshSamples.shift();
        samplesSinceRefreshUpdate += 1;
      }
    }
    lastAnimationFrame = now;

    if (refreshSamples.length < 18 || samplesSinceRefreshUpdate < 6) return;
    samplesSinceRefreshUpdate = 0;
    const sorted = [...refreshSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const measuredFrameRate = Math.max(
      20,
      Math.min(maxFrameRate, Math.round(1000 / median)),
    );
    targetFrameRate = lowPower
      ? Math.min(measuredFrameRate, lowPowerFrameRate)
      : measuredFrameRate;
    targetFrameDuration = 1000 / targetFrameRate;
    canvas.dataset.refreshRate = String(Math.round(1000 / median));
    canvas.dataset.targetFps = String(targetFrameRate);
  };

  canvas.dataset.targetFps = String(targetFrameRate);

  const animate = (now: number) => {
    if (destroyed) return;
    frame = 0;
    if (pointer.active && now - lastActivityAt > 140) pointer.active = false;
    updateRefreshRate(now);
    if (!nextRenderAt) nextRenderAt = now;
    if (now + 0.25 >= nextRenderAt) {
      const elapsed = lastRenderFrame
        ? Math.min(100, now - lastRenderFrame)
        : targetFrameDuration;
      lastRenderFrame = now;
      drawParticles(now, true, elapsed);
      nextRenderAt += targetFrameDuration;
      if (now - nextRenderAt > targetFrameDuration * 2) {
        nextRenderAt = now + targetFrameDuration;
      }
    }

    const canIdle =
      now - sceneStartedAt > 1500 &&
      now - lastActivityAt > 880 &&
      (!assemblyStartedAt || now - assemblyStartedAt > 1280);
    if (canIdle) {
      canvas.dataset.animationState = "idle";
      return;
    }

    canvas.dataset.animationState = "active";
    frame = window.requestAnimationFrame(animate);
  };

  const buildParticles = () => {
    if (!imageReady || !width || !height) return;

    const sampleSize = lowPower ? 190 : 240;
    const offscreen = document.createElement("canvas");
    offscreen.width = sampleSize;
    offscreen.height = sampleSize;
    const offscreenContext = offscreen.getContext("2d", {
      willReadFrequently: true,
    });
    if (!offscreenContext) return;
    offscreenContext.clearRect(0, 0, sampleSize, sampleSize);
    offscreenContext.drawImage(sourceImage, 0, 0, sampleSize, sampleSize);
    const pixels = offscreenContext.getImageData(
      0,
      0,
      sampleSize,
      sampleSize,
    ).data;

    const maxParticles = lowPower ? 460 : 1200;
    let step = lowPower ? 4 : 2;
    let samples: Array<[number, number, number]> = [];
    const collectSamples = () => {
      const next: Array<[number, number, number]> = [];
      for (let y = 0; y < sampleSize; y += step) {
        for (let x = 0; x < sampleSize; x += step) {
          const alpha = pixels[(y * sampleSize + x) * 4 + 3];
          if (alpha > 72) next.push([x, y, alpha]);
        }
      }
      return next;
    };
    samples = collectSamples();
    while (samples.length > maxParticles && step < 12) {
      step += 1;
      samples = collectSamples();
    }

    const compactLayout = width < 940;
    const logoSize = Math.min(
      width * (compactLayout ? 0.94 : 0.44),
      height * (compactLayout ? 0.5 : 0.72),
    );
    const centerX = width * (compactLayout ? 0.64 : 0.73);
    const centerY = height * (compactLayout ? 0.34 : 0.365);
    const offsetX = centerX - logoSize / 2;
    const offsetY = centerY - logoSize / 2;
    const scale = logoSize / sampleSize;
    const shouldAssemble =
      !assembledOnce && !prefersReducedMotion && !lowPower;
    if (shouldAssemble) assemblyStartedAt = performance.now();
    const scatter = prefersReducedMotion ? 0 : lowPower ? 10 : 24;

    particles.length = 0;
    samples.forEach(([sampleX, sampleY], index) => {
      const ox = offsetX + sampleX * scale;
      const oy = offsetY + sampleY * scale;
      const assemblyAngle =
        (index / Math.max(1, samples.length)) * Math.PI * 2 +
        Math.sin(index * 1.83) * 0.34;
      const assemblyRadius =
        logoSize * (0.48 + ((index * 17) % 31) / 31 * 0.34);
      particles.push({
        ox,
        oy,
        x: shouldAssemble
          ? centerX + Math.cos(assemblyAngle) * assemblyRadius
          : ox + (Math.random() - 0.5) * scatter,
        y: shouldAssemble
          ? centerY + Math.sin(assemblyAngle) * assemblyRadius * 0.72
          : oy + (Math.random() - 0.5) * scatter,
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        size: Math.max(
          lowPower ? 1.16 : 1.3,
          Math.min(lowPower ? 2.28 : 2.58, scale * (lowPower ? 0.8 : 0.92)),
        ),
        bright: index % 13 === 0,
      });
    });

    assembledOnce = true;
    sceneStartedAt = performance.now();
    lastActivityAt = sceneStartedAt;
    canvas.dataset.particleCount = String(particles.length);
    drawParticles(performance.now(), false);
  };

  const resizeCanvas = () => {
    visualRect = visual.getBoundingClientRect();
    width = visualRect.width;
    height = visualRect.height;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      lowPower ? 1 : 1.1,
    );
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    buildParticles();
  };

  const handlePointerMove = (event: globalThis.PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointer.x = event.clientX - visualRect.left;
    pointer.y = event.clientY - visualRect.top;
    pointer.active = true;
    lastActivityAt = performance.now();
    updateAnimationState();
  };
  const handlePointerLeave = () => {
    pointer.active = false;
    lastActivityAt = performance.now();
  };
  const updateAnimationState = () => {
    if (document.hidden || !inView || document.documentElement.dataset.motion === "lite") {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      lastAnimationFrame = 0;
      lastRenderFrame = 0;
      nextRenderAt = 0;
      canvas.dataset.animationState = "active";
      frame = window.requestAnimationFrame(animate);
    }
  };
  const handleVisibility = () => updateAnimationState();
  const motionObserver = new MutationObserver(updateAnimationState);
  motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });

  sourceImage.onload = () => {
    if (destroyed) return;
    imageReady = true;
    buildParticles();
  };
  sourceImage.src = "/rhodes-island-logo.webp";

  resizeCanvas();
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(visual);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateAnimationState();
  });
  visibilityObserver.observe(visual);
  if (!coarsePointer && !prefersReducedMotion) {
    visual.addEventListener("pointermove", handlePointerMove, { passive: true });
    visual.addEventListener("pointerleave", handlePointerLeave);
  }
  document.addEventListener("visibilitychange", handleVisibility);
  updateAnimationState();

  return () => {
    destroyed = true;
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    motionObserver.disconnect();
    visual.removeEventListener("pointermove", handlePointerMove);
    visual.removeEventListener("pointerleave", handlePointerLeave);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (frame) window.cancelAnimationFrame(frame);
    context.clearRect(0, 0, width, height);
    delete canvas.dataset.refreshRate;
    delete canvas.dataset.targetFps;
    delete canvas.dataset.animationState;
    delete canvas.dataset.particleCount;
    sourceImage.onload = null;
  };
}
