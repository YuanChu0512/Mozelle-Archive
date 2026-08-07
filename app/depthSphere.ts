type Point3 = { x: number; y: number; z: number };
type ProjectedPoint = Point3 & { px: number; py: number; depth: number };
type Face = [number, number, number];
type MeshEdge = { a: number; b: number; accent: boolean };
type Chord = { a: number; b: number; accent: boolean };
type RenderSegment = {
  start: Point3;
  end: Point3;
  depth: number;
  accent: boolean;
  silhouette: boolean;
};

type DepthSphereOptions = {
  visual: HTMLDivElement;
  canvas: HTMLCanvasElement;
};

const TAU = Math.PI * 2;
const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const length = (point: Point3) => Math.hypot(point.x, point.y, point.z);
const normalize = (point: Point3): Point3 => {
  const divisor = length(point) || 1;
  return {
    x: point.x / divisor,
    y: point.y / divisor,
    z: point.z / divisor,
  };
};
const subtract = (first: Point3, second: Point3): Point3 => ({
  x: first.x - second.x,
  y: first.y - second.y,
  z: first.z - second.z,
});
const cross = (first: Point3, second: Point3): Point3 => ({
  x: first.y * second.z - first.z * second.y,
  y: first.z * second.x - first.x * second.z,
  z: first.x * second.y - first.y * second.x,
});
const dot = (first: Point3, second: Point3) =>
  first.x * second.x + first.y * second.y + first.z * second.z;
const mixPoint = (first: Point3, second: Point3, progress: number): Point3 => ({
  x: first.x + (second.x - first.x) * progress,
  y: first.y + (second.y - first.y) * progress,
  z: first.z + (second.z - first.z) * progress,
});
const scalePoint = (point: Point3, scale: number): Point3 => ({
  x: point.x * scale,
  y: point.y * scale,
  z: point.z * scale,
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

const buildIcosahedron = (subdivide: boolean) => {
  const golden = (1 + Math.sqrt(5)) / 2;
  let vertices: Point3[] = [
    { x: -1, y: golden, z: 0 },
    { x: 1, y: golden, z: 0 },
    { x: -1, y: -golden, z: 0 },
    { x: 1, y: -golden, z: 0 },
    { x: 0, y: -1, z: golden },
    { x: 0, y: 1, z: golden },
    { x: 0, y: -1, z: -golden },
    { x: 0, y: 1, z: -golden },
    { x: golden, y: 0, z: -1 },
    { x: golden, y: 0, z: 1 },
    { x: -golden, y: 0, z: -1 },
    { x: -golden, y: 0, z: 1 },
  ].map(normalize);
  let faces: Face[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  if (subdivide) {
    const midpointCache = new Map<string, number>();
    const midpoint = (first: number, second: number) => {
      const key = `${Math.min(first, second)}-${Math.max(first, second)}`;
      const cached = midpointCache.get(key);
      if (cached !== undefined) return cached;
      const point = normalize(mixPoint(vertices[first], vertices[second], 0.5));
      const index = vertices.length;
      vertices.push(point);
      midpointCache.set(key, index);
      return index;
    };
    const subdivided: Face[] = [];
    faces.forEach(([a, b, c]) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      subdivided.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    });
    faces = subdivided;
  }

  vertices = vertices.map((vertex, index) =>
    scalePoint(vertex, 1 + Math.sin(index * 12.873 + 0.8) * 0.028),
  );

  const seen = new Set<string>();
  const edges: MeshEdge[] = [];
  faces.forEach((face) => {
    const pairs: Array<[number, number]> = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ];
    pairs.forEach(([a, b]) => {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ a, b, accent: edges.length % 13 === 0 });
    });
  });

  return { vertices, faces, edges, edgeKeys: seen };
};

const sphericalMix = (firstInput: Point3, secondInput: Point3, progress: number) => {
  const first = normalize(firstInput);
  const second = normalize(secondInput);
  const cosine = clamp(dot(first, second), -1, 1);
  if (cosine < -0.94) {
    const guide = Math.abs(first.x) < 0.75
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
    const perpendicular = normalize(cross(first, guide));
    return normalize({
      x: first.x * Math.cos(Math.PI * progress) + perpendicular.x * Math.sin(Math.PI * progress),
      y: first.y * Math.cos(Math.PI * progress) + perpendicular.y * Math.sin(Math.PI * progress),
      z: first.z * Math.cos(Math.PI * progress) + perpendicular.z * Math.sin(Math.PI * progress),
    });
  }
  const angle = Math.acos(cosine);
  if (angle < 0.001) return first;
  const sine = Math.sin(angle);
  const firstWeight = Math.sin((1 - progress) * angle) / sine;
  const secondWeight = Math.sin(progress * angle) / sine;
  return normalize({
    x: first.x * firstWeight + second.x * secondWeight,
    y: first.y * firstWeight + second.y * secondWeight,
    z: first.z * firstWeight + second.z * secondWeight,
  });
};

export function mountDepthSphere({ visual, canvas }: DepthSphereOptions) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => undefined;

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const prefersReducedMotion = document.documentElement.dataset.motion === "lite";
  const lowPower =
    document.documentElement.dataset.motion === "lite" || coarsePointer;
  const geometry = buildIcosahedron(!lowPower && !prefersReducedMotion);
  const innerGeometry = buildIcosahedron(false);
  const chordCount = prefersReducedMotion ? 6 : lowPower ? 10 : 22;
  const chordSteps = lowPower ? 4 : 7;

  const makeChords = (seed: number): Chord[] => {
    const random = createRandom(seed);
    const chords: Chord[] = [];
    const seen = new Set<string>();
    let attempts = 0;
    while (chords.length < chordCount && attempts < chordCount * 100) {
      attempts += 1;
      const a = Math.floor(random() * geometry.vertices.length);
      const b = Math.floor(random() * geometry.vertices.length);
      if (a === b) continue;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key) || geometry.edgeKeys.has(key)) continue;
      const distance = dot(
        normalize(geometry.vertices[a]),
        normalize(geometry.vertices[b]),
      );
      if (distance > 0.28 || distance < -0.82) continue;
      seen.add(key);
      chords.push({ a, b, accent: chords.length % 5 === 0 });
    }
    return chords;
  };

  let topologySeed = 51;
  let previousChords = makeChords(topologySeed);
  topologySeed += 29;
  let nextChords = makeChords(topologySeed);
  let topologyStartedAt = performance.now();
  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;
  let sphereRadius = 0;
  let frame = 0;
  let lastFrame = 0;
  let lastRaf = 0;
  let slowFrames = 0;
  let destroyed = false;
  let frameInterval = prefersReducedMotion
    ? Number.POSITIVE_INFINITY
    : lowPower
      ? 1000 / 18
      : 1000 / 40;
  let coreGradient: CanvasGradient | null = null;
  let haloGradient: CanvasGradient | null = null;
  let specularGradient: CanvasGradient | null = null;
  let shadeGradient: CanvasGradient | null = null;

  const rotatePoint = (point: Point3, yaw: number, pitch: number, roll: number) => {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const yawX = point.x * cosYaw + point.z * sinYaw;
    const yawZ = -point.x * sinYaw + point.z * cosYaw;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const pitchY = point.y * cosPitch - yawZ * sinPitch;
    const pitchZ = point.y * sinPitch + yawZ * cosPitch;
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    return {
      x: yawX * cosRoll - pitchY * sinRoll,
      y: yawX * sinRoll + pitchY * cosRoll,
      z: pitchZ,
    };
  };

  const project = (point: Point3): ProjectedPoint => {
    const cameraDistance = 2.55;
    const perspective = cameraDistance / (cameraDistance - point.z);
    return {
      ...point,
      px: centerX + point.x * sphereRadius * perspective,
      py: centerY + point.y * sphereRadius * perspective,
      depth: clamp((point.z + 1.12) / 2.24),
    };
  };

  const splitAtViewPlane = (
    start: Point3,
    end: Point3,
    accent: boolean,
    silhouette = false,
  ) => {
    const result = { back: [] as RenderSegment[], front: [] as RenderSegment[] };
    const add = (first: Point3, second: Point3) => {
      const segment: RenderSegment = {
        start: first,
        end: second,
        depth: clamp(((first.z + second.z) * 0.5 + 1.12) / 2.24),
        accent,
        silhouette,
      };
      if ((first.z + second.z) * 0.5 >= 0) result.front.push(segment);
      else result.back.push(segment);
    };
    if ((start.z >= 0 && end.z >= 0) || (start.z < 0 && end.z < 0)) {
      add(start, end);
      return result;
    }
    const progress = clamp(-start.z / (end.z - start.z));
    const intersection = mixPoint(start, end, progress);
    add(start, intersection);
    add(intersection, end);
    return result;
  };

  const drawSegment = (
    segment: RenderSegment,
    layer: "back" | "front",
    kind: "surface" | "chord",
  ) => {
    const start = project(segment.start);
    const end = project(segment.end);
    const front = layer === "front";
    const depthCurve = segment.depth * segment.depth;
    const surface = kind === "surface";
    const alpha = front
      ? (surface ? 0.36 : 0.25) + depthCurve * (surface ? 0.56 : 0.44)
      : (surface ? 0.045 : 0.028) + depthCurve * 0.075;
    context.beginPath();
    context.moveTo(start.px, start.py);
    context.lineTo(end.px, end.py);
    context.lineWidth = front
      ? (surface ? 0.72 : 0.5) + segment.depth * (surface ? 0.92 : 0.62) +
        (segment.accent ? 0.32 : 0) + (segment.silhouette ? 0.42 : 0)
      : surface ? 0.46 : 0.36;
    if (front) {
      context.strokeStyle = segment.accent || segment.silhouette
        ? `rgba(207, 255, 82, ${clamp(alpha + 0.12, 0, 0.94)})`
        : `rgba(87, 243, 137, ${clamp(alpha, 0, 0.82)})`;
    } else {
      context.strokeStyle = segment.accent
        ? `rgba(128, 184, 72, ${alpha})`
        : `rgba(45, 128, 76, ${alpha})`;
    }
    context.stroke();
  };

  const drawSphere = (now: number) => {
    context.clearRect(0, 0, width, height);
    if (!width || !height) return;

    const topologyDuration = lowPower ? 4200 : 2750;
    let topologyProgress = (now - topologyStartedAt) / topologyDuration;
    if (topologyProgress >= 1) {
      previousChords = nextChords;
      topologySeed += 29;
      nextChords = makeChords(topologySeed);
      topologyStartedAt = now;
      topologyProgress = 0;
    }
    const morph =
      0.5 - Math.cos(clamp(topologyProgress) * Math.PI) * 0.5;

    // The sphere is an autonomous instrument rather than a cursor follower.
    // A pair of slightly different angular cycles keeps the volume alive while
    // avoiding pointer listeners and their extra work on every mouse event.
    const yaw = now * 0.00019;
    const pitch = 0.28 + Math.sin(now * 0.00014) * 0.17;
    const roll = -0.12 + Math.cos(now * 0.0001) * 0.12;

    const rotatedVertices = geometry.vertices.map((vertex, index) => {
      const breathing = 1 +
        Math.sin(now * 0.00046 + index * 1.731) * (lowPower ? 0.006 : 0.014);
      return rotatePoint(scalePoint(vertex, breathing), yaw, pitch, roll);
    });
    const projectedVertices = rotatedVertices.map(project);
    const innerYaw = -now * 0.00027;
    const innerPitch = 0.62 + Math.cos(now * 0.00017) * 0.18;
    const innerRoll = now * 0.00012 - 0.24;
    const innerVertices = innerGeometry.vertices.map((vertex, index) => {
      const pulse = 0.57 + Math.sin(now * 0.00058 + index * 1.29) * 0.012;
      return rotatePoint(
        scalePoint(vertex, pulse),
        innerYaw,
        innerPitch,
        innerRoll,
      );
    });

    const faceData = geometry.faces
      .map((face) => {
        const first = rotatedVertices[face[0]];
        const second = rotatedVertices[face[1]];
        const third = rotatedVertices[face[2]];
        let normal = normalize(
          cross(subtract(second, first), subtract(third, first)),
        );
        const center = scalePoint({
          x: first.x + second.x + third.x,
          y: first.y + second.y + third.y,
          z: first.z + second.z + third.z,
        }, 1 / 3);
        if (dot(normal, center) < 0) normal = scalePoint(normal, -1);
        const lightDirection = normalize({ x: -0.45, y: -0.65, z: 1 });
        return {
          face,
          center,
          facing: normal.z,
          light: Math.max(0, dot(normal, lightDirection)),
        };
      })
      .sort((first, second) => first.center.z - second.center.z);

    const backSurface: RenderSegment[] = [];
    const frontSurface: RenderSegment[] = [];
    geometry.edges.forEach((edge) => {
      const start = rotatedVertices[edge.a];
      const end = rotatedVertices[edge.b];
      const silhouette = start.z * end.z <= 0 ||
        Math.abs((start.z + end.z) * 0.5) < 0.09;
      const split = splitAtViewPlane(start, end, edge.accent, silhouette);
      backSurface.push(...split.back);
      frontSurface.push(...split.front);
    });

    const backChords: RenderSegment[] = [];
    const frontChords: RenderSegment[] = [];
    previousChords.forEach((previous, index) => {
      const next = nextChords[index % nextChords.length];
      const startOnSphere = sphericalMix(
        geometry.vertices[previous.a],
        geometry.vertices[next.a],
        morph,
      );
      const endOnSphere = sphericalMix(
        geometry.vertices[previous.b],
        geometry.vertices[next.b],
        morph,
      );
      const start = rotatePoint(startOnSphere, yaw, pitch, roll);
      const end = rotatePoint(endOnSphere, yaw, pitch, roll);
      for (let step = 0; step < chordSteps; step += 1) {
        const first = mixPoint(start, end, step / chordSteps);
        const second = mixPoint(start, end, (step + 1) / chordSteps);
        const split = splitAtViewPlane(
          first,
          second,
          previous.accent || next.accent,
        );
        backChords.push(...split.back);
        frontChords.push(...split.front);
      }
    });

    backSurface.sort((first, second) => first.depth - second.depth);
    backChords.sort((first, second) => first.depth - second.depth);
    frontChords.sort((first, second) => first.depth - second.depth);
    frontSurface.sort((first, second) => first.depth - second.depth);

    if (haloGradient) {
      context.beginPath();
      context.arc(centerX, centerY, sphereRadius * 1.19, 0, TAU);
      context.fillStyle = haloGradient;
      context.fill();
    }

    faceData.forEach((face) => {
      if (face.facing >= 0) return;
      const [first, second, third] = face.face.map(
        (index) => projectedVertices[index],
      );
      context.beginPath();
      context.moveTo(first.px, first.py);
      context.lineTo(second.px, second.py);
      context.lineTo(third.px, third.py);
      context.closePath();
      context.fillStyle = "rgba(26, 82, 47, 0.022)";
      context.fill();
    });
    backChords.forEach((segment) => drawSegment(segment, "back", "chord"));
    backSurface.forEach((segment) => drawSegment(segment, "back", "surface"));

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, sphereRadius * 1.085, 0, TAU);
    context.clip();
    context.fillStyle = coreGradient ?? "rgba(3, 28, 14, 0.58)";
    context.fillRect(
      centerX - sphereRadius * 1.08,
      centerY - sphereRadius * 1.08,
      sphereRadius * 2.16,
      sphereRadius * 2.16,
    );
    if (specularGradient) {
      context.fillStyle = specularGradient;
      context.fillRect(
        centerX - sphereRadius,
        centerY - sphereRadius,
        sphereRadius * 2,
        sphereRadius * 2,
      );
    }
    if (shadeGradient) {
      context.fillStyle = shadeGradient;
      context.fillRect(
        centerX - sphereRadius,
        centerY - sphereRadius,
        sphereRadius * 2,
        sphereRadius * 2,
      );
    }
    context.restore();

    const innerSegments = innerGeometry.edges
      .map((edge) => {
        const start = innerVertices[edge.a];
        const end = innerVertices[edge.b];
        return {
          start,
          end,
          depth: clamp(((start.z + end.z) * 0.5 + 1.12) / 2.24),
          accent: edge.accent,
        };
      })
      .sort((first, second) => first.depth - second.depth);
    innerSegments.forEach((segment) => {
      const start = project(segment.start);
      const end = project(segment.end);
      context.beginPath();
      context.moveTo(start.px, start.py);
      context.lineTo(end.px, end.py);
      context.lineWidth = 0.42 + segment.depth * 0.48;
      context.strokeStyle = segment.accent
        ? `rgba(207, 255, 96, ${0.3 + segment.depth * 0.42})`
        : `rgba(76, 238, 166, ${0.22 + segment.depth * 0.36})`;
      context.stroke();
    });
    for (let index = 0; index < 12; index += 2) {
      const inner = innerVertices[index];
      const outer = rotatedVertices[index];
      const start = project(inner);
      const end = project(outer);
      const depth = clamp(((inner.z + outer.z) * 0.5 + 1.12) / 2.24);
      context.beginPath();
      context.moveTo(start.px, start.py);
      context.lineTo(end.px, end.py);
      context.lineWidth = 0.42 + depth * 0.38;
      context.strokeStyle = `rgba(105, 242, 170, ${0.18 + depth * 0.34})`;
      context.stroke();
    }
    innerVertices.forEach((vertex, index) => {
      if (vertex.z < -0.36) return;
      const point = project(vertex);
      context.beginPath();
      context.arc(point.px, point.py, 0.55 + point.depth * 0.55, 0, TAU);
      context.fillStyle = index % 5 === 0
        ? `rgba(218, 255, 103, ${0.34 + point.depth * 0.42})`
        : `rgba(113, 244, 151, ${0.22 + point.depth * 0.34})`;
      context.fill();
    });

    context.save();
    context.globalCompositeOperation = lowPower ? "source-over" : "screen";
    faceData.forEach((face) => {
      if (face.facing <= 0.015) return;
      const [first, second, third] = face.face.map(
        (index) => projectedVertices[index],
      );
      const alpha = 0.17 + face.facing * 0.25 + face.light * 0.2;
      context.beginPath();
      context.moveTo(first.px, first.py);
      context.lineTo(second.px, second.py);
      context.lineTo(third.px, third.py);
      context.closePath();
      context.fillStyle = face.light > 0.55
        ? `rgba(126, 239, 139, ${alpha})`
        : `rgba(38, 157, 80, ${alpha * 0.92})`;
      context.fill();
    });
    context.restore();

    frontChords.forEach((segment) => drawSegment(segment, "front", "chord"));
    frontSurface.forEach((segment) => drawSegment(segment, "front", "surface"));

    context.beginPath();
    context.arc(
      centerX,
      centerY,
      sphereRadius * 1.085,
      Math.PI * 0.72,
      Math.PI * 1.64,
    );
    context.lineWidth = 1.15;
    context.strokeStyle = "rgba(132, 255, 151, 0.3)";
    context.stroke();
    context.beginPath();
    context.arc(
      centerX,
      centerY,
      sphereRadius * 1.085,
      Math.PI * 1.74,
      Math.PI * 2.12,
    );
    context.lineWidth = 0.7;
    context.strokeStyle = "rgba(205, 255, 91, 0.18)";
    context.stroke();

    rotatedVertices.forEach((vertex, index) => {
      if (vertex.z < 0.035) return;
      const point = projectedVertices[index];
      const radius = 0.5 + point.depth * 1.15 + (index % 11 === 0 ? 0.35 : 0);
      context.beginPath();
      context.arc(point.px, point.py, radius, 0, TAU);
      context.fillStyle = index % 11 === 0
        ? `rgba(220, 255, 100, ${0.48 + point.depth * 0.45})`
        : `rgba(123, 255, 156, ${0.3 + point.depth * 0.5})`;
      context.fill();
    });

    if (!lowPower && !prefersReducedMotion && frontChords.length) {
      for (let index = 0; index < frontChords.length; index += 13) {
        const segment = frontChords[index];
        const travel = (now * 0.00024 + index * 0.071) % 1;
        const position = mixPoint(segment.start, segment.end, travel);
        const point = project(position);
        context.beginPath();
        context.arc(point.px, point.py, 1.15 + point.depth * 0.7, 0, TAU);
        context.fillStyle = `rgba(226, 255, 116, ${0.48 + point.depth * 0.42})`;
        context.fill();
      }
    }
  };

  const animate = (now: number) => {
    if (destroyed) return;
    if (lastRaf) {
      const duration = now - lastRaf;
      slowFrames = duration > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (!lowPower && slowFrames > 28) frameInterval = 1000 / 26;
    }
    lastRaf = now;
    if (now - lastFrame >= frameInterval) {
      lastFrame = now;
      drawSphere(now);
    }
    frame = window.requestAnimationFrame(animate);
  };

  const resize = () => {
    const bounds = visual.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const compact = width < 720;
    centerX = width * (compact ? 0.5 : 0.48);
    centerY = height * (compact ? 0.47 : 0.44);
    sphereRadius = Math.min(
      width * (compact ? 0.31 : 0.29),
      height * (compact ? 0.27 : 0.33),
    );
    const pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.15);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    coreGradient = context.createRadialGradient(
      centerX - sphereRadius * 0.18,
      centerY - sphereRadius * 0.22,
      sphereRadius * 0.06,
      centerX,
      centerY,
      sphereRadius * 1.085,
    );
    coreGradient.addColorStop(0, "rgba(16, 82, 43, 0.86)");
    coreGradient.addColorStop(0.5, "rgba(8, 53, 28, 0.8)");
    coreGradient.addColorStop(0.8, "rgba(12, 76, 39, 0.66)");
    coreGradient.addColorStop(1, "rgba(57, 194, 99, 0.2)");

    haloGradient = context.createRadialGradient(
      centerX,
      centerY,
      sphereRadius * 0.54,
      centerX,
      centerY,
      sphereRadius * 1.19,
    );
    haloGradient.addColorStop(0, "rgba(67, 245, 119, 0.025)");
    haloGradient.addColorStop(0.72, "rgba(74, 238, 123, 0.055)");
    haloGradient.addColorStop(1, "rgba(74, 238, 123, 0)");

    specularGradient = context.createRadialGradient(
      centerX - sphereRadius * 0.38,
      centerY - sphereRadius * 0.42,
      0,
      centerX - sphereRadius * 0.24,
      centerY - sphereRadius * 0.28,
      sphereRadius * 0.62,
    );
    specularGradient.addColorStop(0, "rgba(179, 255, 179, 0.38)");
    specularGradient.addColorStop(1, "rgba(65, 196, 98, 0)");

    shadeGradient = context.createRadialGradient(
      centerX + sphereRadius * 0.42,
      centerY + sphereRadius * 0.4,
      0,
      centerX + sphereRadius * 0.24,
      centerY + sphereRadius * 0.24,
      sphereRadius * 0.88,
    );
    shadeGradient.addColorStop(0, "rgba(0, 10, 5, 0.32)");
    shadeGradient.addColorStop(0.7, "rgba(0, 12, 6, 0.1)");
    shadeGradient.addColorStop(1, "rgba(0, 12, 6, 0)");
    drawSphere(performance.now());
  };

  const handleVisibility = () => {
    if (document.hidden) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame && !prefersReducedMotion) {
      lastRaf = 0;
      frame = window.requestAnimationFrame(animate);
    }
  };

  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(visual);
  document.addEventListener("visibilitychange", handleVisibility);
  if (!prefersReducedMotion) frame = window.requestAnimationFrame(animate);

  return () => {
    destroyed = true;
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    if (frame) window.cancelAnimationFrame(frame);
    context.clearRect(0, 0, width, height);
  };
}
