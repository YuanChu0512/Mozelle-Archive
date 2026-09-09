import test from "node:test";
import assert from "node:assert/strict";
import { dampSpring, nearestOccurrence, selectionWave, wrap } from "../app/terminal-motion.mjs";

test("cyclic record and lane mapping works in both directions", () => {
  assert.equal(wrap(-1, 5), 4);
  assert.equal(wrap(5, 5), 0);
  assert.equal(nearestOccurrence(0, 8, 9), 9);
  assert.equal(nearestOccurrence(8, 0, 9), -1);
  assert.equal(wrap(nearestOccurrence(2, 104, 3), 3), 2);
});

test("critical spring response agrees at 30 and 144 Hz", () => {
  const run = (fps) => {
    const state = { value: 0, velocity: 0 };
    for (let i = 0; i < fps; i++) dampSpring(state, 5, 8, 1 / fps);
    return state;
  };
  const slow = run(30), fast = run(144);
  assert.ok(Math.abs(slow.value - fast.value) < 1e-10);
  assert.ok(Math.abs(slow.velocity - fast.velocity) < 1e-10);
});

test("reversal keeps current position and velocity instead of restarting a tween", () => {
  const state = { value: 0, velocity: 0 };
  for (let i = 0; i < 12; i++) dampSpring(state, 5, 8, 1 / 60);
  const before = { ...state };
  dampSpring(state, -2, 8, 1 / 144);
  assert.ok(Math.abs(state.value - before.value) < .25);
  assert.ok(Number.isFinite(state.velocity));
  for (let i = 0; i < 144 * 3; i++) dampSpring(state, -2, 8, 1 / 144);
  assert.ok(Math.abs(state.value + 2) < 1e-6);
});

test("selection wave ends so an idle scene can stop rendering", () => {
  assert.equal(selectionWave(3, -1), 0);
  assert.equal(selectionWave(3, 3), 0);
  for (let age = 0; age <= 2.5; age += .02) assert.ok(Number.isFinite(selectionWave(3, age)));
});
