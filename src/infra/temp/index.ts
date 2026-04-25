/** Phase 15 — temp lifecycle barrel. */
export {
  buildTempName,
  trackTemp,
  untrackTemp,
  writeTempFile,
  createTempDir,
  scheduleCleanup,
  cleanupTemp,
  cleanupAllTemps,
  getActiveTempCount,
  setTimerFn,
  resetTimerFn,
  __resetTrackingForTests,
} from "./tempManager";
export type { TimerFn } from "./tempManager";
