import test from "node:test";
import assert from "node:assert/strict";
import { createGlassField } from "../app/glass-optics.mjs";

test("glass field keeps its center neutral and bends only the bevel", () => {
  const field = createGlassField(400, 80, 22);
  const index = (Math.floor(field.mapHeight / 2) * field.mapWidth + Math.floor(field.mapWidth / 2)) * 4;
  assert.equal(field.data[index], 128);
  assert.equal(field.data[index + 1], 128);
  assert.equal(field.data[0], 128);
  assert.equal(field.data[1], 128);
  assert.ok(field.data.some((value, i) => i % 4 < 2 && value < 90));
  assert.ok(field.data.some((value, i) => i % 4 < 2 && value > 160));
});

test("wide navigation and narrow rails stay within the texture budget", () => {
  for (const [width, height, radius] of [[1480, 68, 22], [64, 420, 22], [320, 60, 20]]) {
    const field = createGlassField(width, height, radius);
    assert.ok(field.mapWidth <= 768);
    assert.ok(field.mapHeight <= 128);
    assert.ok(field.mapWidth * field.mapHeight <= 65536);
    assert.equal(field.width, width + 20);
    assert.equal(field.height, height + 20);
    assert.equal(field.data.length, field.mapWidth * field.mapHeight * 4);
    assert.ok(field.scale <= 14);
  }
});

test("refraction is symmetric across opposite edges", () => {
  const field = createGlassField(400, 80, 22);
  for (let y = 0; y < field.mapHeight; y += 3) for (let x = 0; x < field.mapWidth / 2; x += 5) {
    const a = (y * field.mapWidth + x) * 4;
    const b = (y * field.mapWidth + field.mapWidth - 1 - x) * 4;
    assert.ok(Math.abs(field.data[a] + field.data[b] - 255) <= 1);
    assert.equal(field.data[a + 1], field.data[b + 1]);
  }
});
