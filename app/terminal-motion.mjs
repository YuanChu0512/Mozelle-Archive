// Critical damping and cyclic cell mapping adapted from RhineLabUI (MIT).
// Copyright (c) 2026 LBEILC. See THIRD_PARTY_NOTICES.md.
export const wrap = (value, count) => count > 0 ? ((value % count) + count) % count : 0;
export const nearestOccurrence = (value, center, period) => period > 0
  ? value + Math.floor((center - value + period / 2) / period) * period : center;

export function dampSpring(state, target, rate, dt) {
  const delta = state.value - target;
  const impulse = state.velocity + rate * delta;
  const decay = Math.exp(-rate * Math.max(0, dt));
  state.value = target + (delta + impulse * dt) * decay;
  state.velocity = (state.velocity - rate * impulse * dt) * decay;
}

export function selectionWave(distance, age) {
  if (age < 0 || age > 2.5) return 0;
  const front = distance - age * 7.5;
  const enter = Math.min(1, age / .22);
  return .48 * enter * enter * Math.exp(-age * 1.5) * Math.cos(front * .6) * Math.exp(-front * front / 19);
}
