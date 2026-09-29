/** Session-only clocks. Neither reading participates in generation or identity. */
export type PracticeTime = Readonly<{ monotonicMs: number; wallTimeMs: number }>;
export type PracticeClock = Readonly<{ read(): PracticeTime }>;

export function createPracticeClock(monotonicNow: () => number, wallNow: () => number): PracticeClock {
  return { read: () => ({ monotonicMs: monotonicNow(), wallTimeMs: wallNow() }) };
}

// Read only at presentation and Submit, never during render or chemistry.
export const browserPracticeClock = createPracticeClock(() => performance.now(), () => Date.now());

export function validatePracticeTime(time: PracticeTime): PracticeTime {
  if (!Number.isFinite(time.monotonicMs) || !Number.isFinite(time.wallTimeMs)) {
    throw new RangeError("Practice clock readings must be finite.");
  }
  return { ...time };
}

/** Elapsed presentation-to-Submit time, including time while the tab is hidden.
 * Feedback and generation time are excluded. Wall-clock adjustments do not
 * affect the duration. No pause or active-attention tracking is performed.
 */
export function practiceResponseTimeMs(start: PracticeTime, submitted: PracticeTime): number {
  validatePracticeTime(start);
  validatePracticeTime(submitted);
  const duration = submitted.monotonicMs - start.monotonicMs;
  if (duration < 0 || !Number.isFinite(duration)) throw new RangeError("Practice monotonic clock moved backwards.");
  return duration;
}
