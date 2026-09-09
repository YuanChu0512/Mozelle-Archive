import test from "node:test";
import assert from "node:assert/strict";
import { activeSectionIndex, dampingFactor, nextFrameDeadline } from "../app/motion-math.mjs";

test("frame deadlines preserve rate across 60, 120, 144 and 240 Hz displays", () => {
  for (const refresh of [60, 120, 144, 240]) {
    for (const target of [30, 48, 72, 144]) {
      let due = 0;
      let count = 0;
      for (let i = 1; i <= refresh * 10; i += 1) {
        const now = i * 1000 / refresh;
        if (!due || now + .25 >= due) {
          count += 1;
          due = nextFrameDeadline(now, due, 1000 / target);
        }
      }
      assert.ok(Math.abs(count - Math.min(refresh, target) * 10) <= 2, `${refresh} Hz / ${target} fps: ${count}`);
    }
  }
});

test("frame deadlines reset after background suspension without catch-up bursts", () => {
  assert.equal(nextFrameDeadline(10_000, 100, 10), 10_010);
});

test("damping converges equally at 30 and 144 Hz", () => {
  const simulate = (fps) => {
    let value = 0;
    for (let i = 0; i < fps; i += 1) value += (1 - value) * dampingFactor(8, 1000 / fps);
    return value;
  };
  assert.ok(Math.abs(simulate(30) - simulate(144)) < 1e-10);
});

test("section detection is symmetric while scrolling up and down", () => {
  const offsets = [0, 700, 2400];
  const positions = [0, 699, 700, 701, 2399, 2400, 4000];
  const expected = [0, 0, 1, 1, 1, 2, 2];
  assert.deepEqual(positions.map((position) => activeSectionIndex(offsets, position)), expected);
  assert.deepEqual([...positions].reverse().map((position) => activeSectionIndex(offsets, position)), [...expected].reverse());
  assert.equal(activeSectionIndex(offsets, 0, true), 2);
});
