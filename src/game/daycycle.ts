export const DAY_LEN = 300;
export const DAY_START = 0.16;

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v: number) {
  return v * v * (3 - 2 * v);
}

export interface DayPhase {
  t: number;
  a: number;
  elev: number;
  daylight: number;
  night: number;
}

export function dayPhase(elapsed: number): DayPhase {
  const t = (DAY_START + elapsed / DAY_LEN) % 1;
  const a = t * Math.PI * 2;
  const elev = Math.sin(a);
  const daylight = smooth(clamp01((elev + 0.1) / 0.32));
  return { t, a, elev, daylight, night: 1 - daylight };
}

export function rainAmount(elapsed: number): number {
  const cycle = 170;
  const t = (elapsed % cycle) / cycle;
  const in0 = 0.34;
  const in1 = 0.4;
  const out0 = 0.62;
  const out1 = 0.68;
  if (t < in0 || t > out1) return 0;
  if (t < in1) return smooth((t - in0) / (in1 - in0));
  if (t > out0) return smooth((out1 - t) / (out1 - out0));
  return 1;
}
