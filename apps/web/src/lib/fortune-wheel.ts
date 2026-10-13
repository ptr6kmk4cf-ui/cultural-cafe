/** How many names fit on the wheel before they become unreadable. */
export const WHEEL_LIMIT = 10;

export type WheelPerson = {
  id: string;
  name: string;
  city: string;
  country: string;
  bio: string;
  languageLabel: string;
  languages?: string[];
  interests?: string[];
  age?: number;
  portraitUrl?: string | null;
  guest?: boolean;
  online?: boolean;
};

/** A random subset when the café is larger than the wheel. A short list stays in order. */
export function wheelBoard<T>(people: readonly T[], limit: number, random: () => number): T[] {
  const copy = [...people];
  const size = Math.max(0, Math.min(limit, copy.length));
  if (copy.length > size) {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j]!;
      copy[j] = swap!;
    }
  }
  return copy.slice(0, size);
}

/**
 * Clockwise degrees that park slice `index` under a pointer fixed at the top.
 * Slice 0 starts at 12 o'clock and runs clockwise. `jitter` is 0–1 inside the slice.
 */
export function spinRotation(index: number, count: number, turns: number, jitter = 0.5) {
  const slice = 360 / count;
  const spot = Math.min(0.85, Math.max(0.15, jitter));
  return turns * 360 - (index + spot) * slice;
}

/** Which slice is under the top pointer after a clockwise rotation. */
export function sliceUnderPointer(rotation: number, count: number) {
  const slice = 360 / count;
  const atTop = ((-rotation % 360) + 360) % 360;
  return Math.floor(atTop / slice) % count;
}
