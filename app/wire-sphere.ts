import { nextFrameDeadline } from "./motion-math.mjs";

export function mountWireSphere(visual: HTMLElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  if (!context) return;

  type Vector3 = { x: number; y: number; z: number; phase: number };
  type Edge = { a: number; b: number; accent: boolean };
  type ProjectedPoint = {
    x: number;
    y: number;
    z: number;
    depth: number;
    index: number;
  };
  type ProjectedEdge = {
    start: ProjectedPoint;
    end: ProjectedPoint;
    depth: number;
    accent: boolean;
    index: number;
    opacity: number;
  };

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const prefersReducedMotion = document.documentElement.dataset.motion === "lite";
  const lowPower =
    document.documentElement.dataset.motion === "lite" || coarsePointer;
  const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
  const highMotionPerformance =
    !lowPower &&
    (deviceNavigator.hardwareConcurrency || 4) >= 8 &&
    (deviceNavigator.deviceMemory || 4) >= 8;
  const nodeCount = prefersReducedMotion ? 20 : lowPower ? 26 : 44;
  const chordCount = prefersReducedMotion ? 6 : lowPower ? 12 : 26;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.max(minimum, Math.min(maximum, value));
  const normalize = (point: Pick<Vector3, "x" | "y" | "z">) => {
    const length = Math.hypot(point.x, point.y, point.z) || 1;
    return {
      x: point.x / length,
      y: point.y / length,
      z: point.z / length,
    };
  };
  const nodes: Vector3[] = Array.from({ length: nodeCount }, (_, index) => {
    const y = 1 - ((index + 0.5) / nodeCount) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index + Math.sin(index * 2.17) * 0.055;
    const irregularity = 1 + Math.sin(index * 4.13) * 0.026;
    const normalized = normalize({
      x: Math.cos(angle) * radius * irregularity,
      y: y * (1 + Math.cos(index * 2.73) * 0.02),
      z: Math.sin(angle) * radius * irregularity,
    });
    return {
      ...normalized,
      phase: index * 1.731 + (index % 5) * 0.47,
    };
  });

  const createRandom = (seed: number) => {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
  };

  const edgeKey = (a: number, b: number) =>
    `${Math.min(a, b)}-${Math.max(a, b)}`;

  const createSurfaceEdges = (): Edge[] => {
    const edges: Edge[] = [];
    const seen = new Set<string>();
    const neighbourCount = lowPower ? 3 : 4;
    nodes.forEach((node, index) => {
      const neighbours = nodes
        .map((candidate, candidateIndex) => ({
          index: candidateIndex,
          distance:
            (node.x - candidate.x) ** 2 +
            (node.y - candidate.y) ** 2 +
            (node.z - candidate.z) ** 2,
        }))
        .filter((candidate) => candidate.index !== index)
        .sort((first, second) => first.distance - second.distance)
        .slice(0, neighbourCount);
      neighbours.forEach((neighbour) => {
        const key = edgeKey(index, neighbour.index);
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({
          a: index,
          b: neighbour.index,
          accent: edges.length % 9 === 0,
        });
      });
    });
    return edges;
  };

  const surfaceEdges = createSurfaceEdges();
  const surfaceEdgeKeys = new Set(
    surfaceEdges.map((edge) => edgeKey(edge.a, edge.b)),
  );

  const createFaces = () => {
    const adjacency = Array.from(
      { length: nodeCount },
      () => new Set<number>(),
    );
    surfaceEdges.forEach((edge) => {
      adjacency[edge.a].add(edge.b);
      adjacency[edge.b].add(edge.a);
    });
    const faces: Array<[number, number, number]> = [];
    const faceLimit = lowPower ? 10 : 24;
    for (let a = 0; a < nodeCount && faces.length < faceLimit; a += 1) {
      const neighbours = [...adjacency[a]].filter((value) => value > a);
      for (let first = 0; first < neighbours.length; first += 1) {
        for (
          let second = first + 1;
          second < neighbours.length;
          second += 1
        ) {
          const b = neighbours[first];
          const c = neighbours[second];
          if (adjacency[b].has(c)) faces.push([a, b, c]);
          if (faces.length >= faceLimit) break;
        }
        if (faces.length >= faceLimit) break;
      }
    }
    return faces;
  };

  const faces = createFaces();

  const createChords = (seed: number): Edge[] => {
    const random = createRandom(seed);
    const edges: Edge[] = [];
    const seen = new Set<string>();
    let attempts = 0;
    while (edges.length < chordCount && attempts < chordCount * 90) {
      attempts += 1;
      const a = Math.floor(random() * nodeCount);
      const b = Math.floor(random() * nodeCount);
      if (a === b) continue;
      const key = edgeKey(a, b);
      if (seen.has(key) || surfaceEdgeKeys.has(key)) continue;
      const first = nodes[a];
      const second = nodes[b];
      const dot = first.x * second.x + first.y * second.y + first.z * second.z;
      if (dot < -0.72 || dot > 0.34) continue;
      seen.add(key);
      edges.push({ a, b, accent: edges.length % 5 === 0 });
    }
    for (let index = 0; edges.length < chordCount; index += 1) {
      edges.push({
        a: index % nodeCount,
        b: (index * 7 + Math.floor(nodeCount * 0.41)) % nodeCount,
        accent: index % 5 === 0,
      });
    }
    return edges;
  };

  let topologySeed = 41;
  let previousChords = createChords(topologySeed);
  topologySeed += 37;
  let nextChords = createChords(topologySeed);
  let topologyStartedAt = performance.now();
  let frame = 0;
  let nextRenderAt = 0;
  let renderCost = 0;
  let costSamples = 0;
  const preferredInterval = prefersReducedMotion
    ? Number.POSITIVE_INFINITY
    : lowPower
      ? 1000 / 30
      : highMotionPerformance
        ? 1000 / 144
        : 1000 / 72;
  let frameInterval = preferredInterval;
  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;
  let sphereRadius = 0;
  let volumeGradient: CanvasGradient | null = null;
  let destroyed = false;
  let focusPulse = 0;
  let cosYaw = 1, sinYaw = 0, cosPitch = 1, sinPitch = 0, cosRoll = 1, sinRoll = 0;
  const initialBounds = visual.getBoundingClientRect();
  let inView =
    initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;

  const rotatePoint = (
    point: Pick<Vector3, "x" | "y" | "z">,
  ) => {
    const xAfterYaw = point.x * cosYaw + point.z * sinYaw;
    const zAfterYaw = -point.x * sinYaw + point.z * cosYaw;

    const yAfterPitch = point.y * cosPitch - zAfterYaw * sinPitch;
    const zAfterPitch = point.y * sinPitch + zAfterYaw * cosPitch;

    return {
      x: xAfterYaw * cosRoll - yAfterPitch * sinRoll,
      y: xAfterYaw * sinRoll + yAfterPitch * cosRoll,
      z: zAfterPitch,
    };
  };

  const projectPoint = (
    point: Pick<Vector3, "x" | "y" | "z">,
    index: number,
  ): ProjectedPoint => {
    const cameraDistance = 3.05;
    const perspective = cameraDistance / (cameraDistance - point.z);
    return {
      x: centerX + point.x * sphereRadius * perspective,
      y: centerY + point.y * sphereRadius * perspective,
      z: point.z,
      depth: clamp((point.z + 1) * 0.5),
      index,
    };
  };

  const convexHull = (points: ProjectedPoint[]) => {
    if (points.length <= 3) return [...points];
    const sorted = [...points].sort((first, second) =>
      first.x === second.x ? first.y - second.y : first.x - second.x,
    );
    const cross = (
      origin: ProjectedPoint,
      first: ProjectedPoint,
      second: ProjectedPoint,
    ) =>
      (first.x - origin.x) * (second.y - origin.y) -
      (first.y - origin.y) * (second.x - origin.x);
    const lower: ProjectedPoint[] = [];
    sorted.forEach((point) => {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
      ) {
        lower.pop();
      }
      lower.push(point);
    });
    const upper: ProjectedPoint[] = [];
    [...sorted].reverse().forEach((point) => {
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
      ) {
        upper.pop();
      }
      upper.push(point);
    });
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  const drawEdge = (edge: ProjectedEdge, kind: "surface" | "chord") => {
    const depthCurve = edge.depth * edge.depth;
    const isSurface = kind === "surface";
    const baseAlpha = isSurface
      ? 0.085 + depthCurve * (edge.accent ? 0.8 : 0.6)
      : 0.075 + depthCurve * (edge.accent ? 0.58 : 0.4);
    const focusBoost =
      0.9 + edge.depth * 0.12 + focusPulse * edge.depth * 0.05;
    const alpha = baseAlpha * focusBoost * edge.opacity;
    context.beginPath();
    context.moveTo(edge.start.x, edge.start.y);
    context.lineTo(edge.end.x, edge.end.y);
    context.lineWidth = isSurface
      ? 0.42 + edge.depth * 1.22 + focusPulse * edge.depth * 0.12 + (edge.accent ? 0.42 : 0)
      : 0.36 + edge.depth * 0.72 + focusPulse * edge.depth * 0.08 + (edge.accent ? 0.24 : 0);
    context.strokeStyle = edge.accent
      ? `rgba(205, 255, 82, ${clamp(alpha, 0, 0.94)})`
      : `rgba(84, 239, 132, ${clamp(alpha, 0, 0.78)})`;
    context.stroke();
  };

  const drawSphere = (now: number) => {
    context.clearRect(0, 0, width, height);
    if (!width || !height) return;
    focusPulse = lowPower ? 0 : 0.5 + Math.sin(now * 0.00058) * 0.5;

    const topologyDuration = lowPower ? 4300 : 2900;
    let topologyProgress = (now - topologyStartedAt) / topologyDuration;
    if (topologyProgress >= 1) {
      previousChords = nextChords;
      topologySeed += 37;
      nextChords = createChords(topologySeed);
      topologyStartedAt = now;
      topologyProgress = 0;
    }
    const morph =
      0.5 - Math.cos(Math.max(0, Math.min(1, topologyProgress)) * Math.PI) * 0.5;
    const chordBlendProgress = clamp((morph - 0.2) / 0.6);
    const chordBlend =
      chordBlendProgress * chordBlendProgress * (3 - 2 * chordBlendProgress);

    const yaw = now * 0.00022;
    const pitch = 0.2 + Math.sin(now * 0.00015) * 0.18;
    const roll = -0.1 + Math.cos(now * 0.00011) * 0.14;
    cosYaw = Math.cos(yaw); sinYaw = Math.sin(yaw);
    cosPitch = Math.cos(pitch); sinPitch = Math.sin(pitch);
    cosRoll = Math.cos(roll); sinRoll = Math.sin(roll);
    const driftAmount = lowPower ? 0.008 : 0.018;
    const rotatedNodes = nodes.map((node) => {
      const firstDrift = Math.sin(now * 0.00042 + node.phase) * driftAmount;
      const secondDrift =
        Math.cos(now * 0.00031 + node.phase * 1.37) * driftAmount * 0.72;
      const deformed = normalize({
        x: node.x + node.y * firstDrift - node.z * secondDrift,
        y: node.y - node.x * firstDrift * 0.7 + node.z * secondDrift,
        z: node.z + node.x * secondDrift - node.y * firstDrift * 0.35,
      });
      return rotatePoint(deformed);
    });
    const projectedNodes = rotatedNodes.map((point, index) =>
      projectPoint(point, index),
    );

    const hull = convexHull(projectedNodes);
    if (hull.length > 2) {
      context.beginPath();
      context.moveTo(hull[0].x, hull[0].y);
      hull.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      context.fillStyle = volumeGradient ?? "rgba(30, 121, 63, 0.06)";
      context.fill();
    }

    const projectedFaces = faces
      .map((face) => ({
        points: face.map((index) => projectedNodes[index]),
        depth:
          face.reduce((sum, index) => sum + projectedNodes[index].depth, 0) /
          face.length,
      }))
      .sort((first, second) => first.depth - second.depth);
    projectedFaces.forEach((face) => {
      context.beginPath();
      context.moveTo(face.points[0].x, face.points[0].y);
      context.lineTo(face.points[1].x, face.points[1].y);
      context.lineTo(face.points[2].x, face.points[2].y);
      context.closePath();
      context.fillStyle = `rgba(94, 255, 145, ${0.006 + face.depth ** 3 * 0.045})`;
      context.fill();
    });

    const projectChordSet = (
      chords: Edge[],
      opacity: number,
      indexOffset: number,
    ): ProjectedEdge[] => {
      if (opacity <= 0.002) return [];
      return chords.map((edge, index) => ({
        start: projectedNodes[edge.a],
        end: projectedNodes[edge.b],
        depth:
          (projectedNodes[edge.a].depth + projectedNodes[edge.b].depth) * 0.5,
        accent: edge.accent,
        index: indexOffset + index,
        opacity,
      }));
    };
    const dynamicChords = [
      ...projectChordSet(previousChords, 1 - chordBlend, 0),
      ...projectChordSet(nextChords, chordBlend, previousChords.length),
    ];
    dynamicChords.sort((first, second) => first.depth - second.depth);

    const projectedSurface = surfaceEdges
      .map((edge, index) => ({
        start: projectedNodes[edge.a],
        end: projectedNodes[edge.b],
        depth:
          (projectedNodes[edge.a].depth + projectedNodes[edge.b].depth) * 0.5,
        accent: edge.accent,
        index,
        opacity: 1,
      }))
      .sort((first, second) => first.depth - second.depth);

    context.globalCompositeOperation = "source-over";
    dynamicChords.forEach((edge) => drawEdge(edge, "chord"));
    projectedSurface.forEach((edge) => drawEdge(edge, "surface"));

    if (!prefersReducedMotion) {
      const flowSpeed = lowPower ? 0.00008 : 0.00017;
      const flowLayers = lowPower
        ? [
            { length: 1, alpha: 0.2, width: 1.18 },
            { length: 0.58, alpha: 0.42, width: 1.06 },
            { length: 0.22, alpha: 0.82, width: 0.94 },
          ]
        : [
            { length: 1, alpha: 0.16, width: 1.28 },
            { length: 0.78, alpha: 0.23, width: 1.19 },
            { length: 0.56, alpha: 0.34, width: 1.1 },
            { length: 0.34, alpha: 0.5, width: 1.01 },
            { length: 0.15, alpha: 0.84, width: 0.92 },
          ];
      const drawFlowGroup = (front: boolean, accent: boolean) => {
        const baseWidth = front
          ? accent ? 2.15 : 1.42
          : accent ? 1 : 0.72;
        const baseAlpha = accent
          ? front ? 0.68 : 0.2
          : front ? 0.48 : 0.13;
        const color = accent ? "226, 255, 105" : "140, 255, 178";
        flowLayers.forEach((layer) => {
          context.beginPath();
          projectedSurface.forEach((edge) => {
            if ((edge.depth >= 0.5) !== front || edge.accent !== accent) return;
            const travel = (now * flowSpeed + edge.index * 0.137) % 1;
            const flowLength = (lowPower
              ? 0.2 + edge.depth * 0.12
              : 0.27 + edge.depth * 0.18) * layer.length;
            const reversed = edge.index % 2 === 1;
            const head = reversed ? 1 - travel : travel;
            const tail = clamp(
              head + (reversed ? flowLength : -flowLength),
              0,
              1,
            );
            const startX = edge.start.x + (edge.end.x - edge.start.x) * tail;
            const startY = edge.start.y + (edge.end.y - edge.start.y) * tail;
            const endX = edge.start.x + (edge.end.x - edge.start.x) * head;
            const endY = edge.start.y + (edge.end.y - edge.start.y) * head;
            context.moveTo(startX, startY);
            context.lineTo(endX, endY);
          });
          context.lineCap = "round";
          context.lineWidth = baseWidth * layer.width;
          context.strokeStyle = `rgba(${color}, ${baseAlpha * layer.alpha})`;
          context.stroke();
        });
      };
      context.save();
      context.globalCompositeOperation = lowPower ? "source-over" : "screen";
      drawFlowGroup(false, false);
      drawFlowGroup(false, true);
      drawFlowGroup(true, false);
      drawFlowGroup(true, true);
      context.restore();
    }

    context.beginPath();
    if (hull.length > 1) {
      context.moveTo(hull[0].x, hull[0].y);
      hull.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      context.lineWidth = 0.95;
      context.strokeStyle = "rgba(171, 255, 100, 0.34)";
      context.stroke();
    }

    [...projectedNodes]
      .sort((first, second) => first.depth - second.depth)
      .forEach((node) => {
        const radius =
          0.58 + node.depth * 1.85 + focusPulse * node.depth * 0.18;
        context.beginPath();
        context.arc(node.x, node.y, radius, 0, Math.PI * 2);
        context.fillStyle =
          node.index % 9 === 0
            ? `rgba(215, 255, 90, ${0.18 + node.depth * 0.78})`
            : `rgba(119, 255, 156, ${0.1 + node.depth * 0.7})`;
        context.fill();
      });

    if (!lowPower && !prefersReducedMotion) {
      dynamicChords.forEach((edge) => {
        if (edge.index % 5 !== 0) return;
        const travel = (now * 0.0002 + edge.index * 0.173) % 1;
        const x = edge.start.x + (edge.end.x - edge.start.x) * travel;
        const y = edge.start.y + (edge.end.y - edge.start.y) * travel;
        context.beginPath();
        context.arc(x, y, 0.9 + edge.depth * 1.15, 0, Math.PI * 2);
        context.fillStyle = `rgba(224, 255, 117, ${(0.25 + edge.depth * 0.62) * edge.opacity})`;
        context.fill();
      });
    }
  };

  const animate = (now: number) => {
    if (destroyed) return;
    if (!nextRenderAt || now + .25 >= nextRenderAt) {
      const started = performance.now();
      drawSphere(now);
      renderCost += (performance.now() - started - renderCost) * .08;
      costSamples += 1;
      // Budget based on this renderer's cost, not the monitor's frame interval.
      // Recover quality too: a brief unrelated long task must not lock 30 fps.
      if (costSamples >= 90) {
        frameInterval = renderCost > 5 ? 1000 / 48
          : renderCost > 2.8 ? Math.max(preferredInterval, 1000 / 72)
            : preferredInterval;
        canvas.dataset.targetFps = String(Math.round(1000 / frameInterval));
        canvas.dataset.renderCost = renderCost.toFixed(2);
        costSamples = 0;
      }
      nextRenderAt = nextFrameDeadline(now, nextRenderAt, frameInterval);
    }
    frame = window.requestAnimationFrame(animate);
  };

  const resizeCanvas = () => {
    const bounds = visual.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const compactLayout = width < 720;
    centerX = width * (compactLayout ? 0.5 : 0.59);
    centerY = height * (compactLayout ? 0.48 : 0.44);
    sphereRadius = Math.min(
      width * (compactLayout ? 0.38 : 0.36),
      height * (compactLayout ? 0.31 : 0.39),
    );
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      1,
    );
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    volumeGradient = context.createRadialGradient(
      centerX - sphereRadius * 0.18,
      centerY - sphereRadius * 0.2,
      sphereRadius * 0.08,
      centerX,
      centerY,
      sphereRadius * 1.08,
    );
    volumeGradient.addColorStop(0, "rgba(132, 255, 158, 0.095)");
    volumeGradient.addColorStop(0.58, "rgba(50, 173, 91, 0.047)");
    volumeGradient.addColorStop(1, "rgba(9, 58, 30, 0.006)");
    drawSphere(performance.now());
  };

  const updateAnimationState = () => {
    if (document.hidden || !inView || document.documentElement.dataset.motion === "lite" || visual.closest<HTMLElement>(".site-shell")?.dataset.overlayOpen === "true") {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      canvas.dataset.animationState = "paused";
    } else if (!frame) {
      nextRenderAt = 0;
      canvas.dataset.animationState = "active";
      frame = window.requestAnimationFrame(animate);
    }
  };
  const handleVisibility = () => updateAnimationState();
  const motionObserver = new MutationObserver(updateAnimationState);
  motionObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["data-motion", "data-overlay-open"] });

  resizeCanvas();
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(visual);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateAnimationState();
  });
  visibilityObserver.observe(visual);
  document.addEventListener("visibilitychange", handleVisibility);
  updateAnimationState();

  return () => {
    destroyed = true;
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    motionObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    if (frame) window.cancelAnimationFrame(frame);
    context.clearRect(0, 0, width, height);
    delete canvas.dataset.targetFps;
    delete canvas.dataset.renderCost;
    delete canvas.dataset.animationState;
  };
}
