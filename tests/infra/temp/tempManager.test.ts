import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
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
} from "../../../src/infra/temp";

// Capture any paths we touch so an AfterEach pass can scrub them even
// if the assertion they belonged to failed mid-test.
const scrubPaths: string[] = [];

function scrub(path: string): string {
  scrubPaths.push(path);
  return path;
}

beforeEach(() => {
  __resetTrackingForTests();
  resetTimerFn();
});

afterEach(() => {
  for (const path of scrubPaths.splice(0)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("buildTempName", () => {
  it("produces a path under tmpdir with the requested extension", () => {
    const path = buildTempName("unit", "pptx");
    expect(path.startsWith(tmpdir())).toBe(true);
    expect(path.endsWith(".pptx")).toBe(true);
    expect(path).toMatch(/unit_\d+-\d+\.pptx$/);
  });

  it("omits the extension dot when no extension is requested", () => {
    const path = buildTempName("libimp");
    expect(path).toMatch(/libimp_\d+-\d+$/);
    expect(path.endsWith(".")).toBe(false);
  });

  it("sanitises unsafe prefix characters", () => {
    const path = buildTempName("a b/c\\d.e", "txt");
    expect(path).toMatch(/a_b_c_d_e_\d+-\d+\.txt$/);
  });

  it("falls back to 'tmp' when the prefix is entirely unsafe", () => {
    const path = buildTempName("///", "txt");
    expect(path).toMatch(/tmp_\d+-\d+\.txt$/);
  });

  it("strips leading dots from the extension", () => {
    const path = buildTempName("x", "...pptx");
    expect(path.endsWith(".pptx")).toBe(true);
  });

  it("returns distinct paths even when called in the same millisecond", () => {
    const a = buildTempName("dupe", "bin");
    const b = buildTempName("dupe", "bin");
    expect(a).not.toBe(b);
  });

  it("does NOT touch disk", () => {
    const path = buildTempName("ghost", "bin");
    expect(existsSync(path)).toBe(false);
  });
});

describe("trackTemp / untrackTemp / getActiveTempCount", () => {
  it("tracks + untracks idempotently", () => {
    trackTemp("/some/path");
    trackTemp("/some/path"); // duplicate add does nothing
    expect(getActiveTempCount()).toBe(1);
    untrackTemp("/some/path");
    expect(getActiveTempCount()).toBe(0);
  });
});

describe("writeTempFile", () => {
  it("writes the buffer content to disk and tracks the path", () => {
    const path = scrub(writeTempFile("wrt", "bin", Buffer.from("hello", "utf-8")));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe("hello");
    expect(getActiveTempCount()).toBe(1);
  });

  it("accepts string payloads too", () => {
    const path = scrub(writeTempFile("wrt", "txt", "plain"));
    expect(readFileSync(path, "utf-8")).toBe("plain");
  });
});

describe("createTempDir", () => {
  it("creates an empty directory and tracks it", () => {
    const dir = scrub(createTempDir("dir"));
    expect(existsSync(dir)).toBe(true);
    expect(getActiveTempCount()).toBe(1);
  });
});

describe("cleanupTemp", () => {
  it("removes a tracked file and drops tracking", () => {
    const path = scrub(writeTempFile("rm", "bin", "x"));
    cleanupTemp(path);
    expect(existsSync(path)).toBe(false);
    expect(getActiveTempCount()).toBe(0);
  });

  it("removes a tracked directory and its contents recursively", () => {
    const dir = scrub(createTempDir("rmdir"));
    writeFileSync(join(dir, "inner.txt"), "x");
    cleanupTemp(dir);
    expect(existsSync(dir)).toBe(false);
    expect(getActiveTempCount()).toBe(0);
  });

  it("is a no-op (and untracks) when the path is already gone", () => {
    const path = buildTempName("absent", "bin");
    trackTemp(path);
    expect(() => cleanupTemp(path)).not.toThrow();
    expect(getActiveTempCount()).toBe(0);
  });

  it("swallows statSync / rmSync failures without throwing", () => {
    // `statSync` on a path whose parent is readable but target is a
    // magic socket-like name would throw on some platforms. The easier
    // cross-platform regression is a "file removed between existsSync
    // and rmSync" race — which we simulate by mkdir-then-rm.
    const dir = mkdtempSync(join(tmpdir(), "race-"));
    const missing = join(dir, "childThatVanishes");
    writeFileSync(missing, "x");
    // Manually nuke it before cleanupTemp runs.
    rmSync(missing);
    trackTemp(missing);
    expect(() => cleanupTemp(missing)).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("cleanupAllTemps", () => {
  it("cleans up every tracked entry in one pass", () => {
    const a = scrub(writeTempFile("all", "bin", "1"));
    const b = scrub(writeTempFile("all", "bin", "2"));
    const c = scrub(createTempDir("all"));
    expect(getActiveTempCount()).toBe(3);
    cleanupAllTemps();
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
    expect(existsSync(c)).toBe(false);
    expect(getActiveTempCount()).toBe(0);
  });

  it("continues past errors and drains the rest", () => {
    const good = scrub(writeTempFile("all", "bin", "g"));
    const absent = buildTempName("all", "bin");
    trackTemp(absent);
    cleanupAllTemps();
    expect(existsSync(good)).toBe(false);
    expect(getActiveTempCount()).toBe(0);
  });
});

describe("scheduleCleanup", () => {
  it("defers cleanup to the injected timer and does not touch disk until fired", () => {
    const path = scrub(writeTempFile("sch", "bin", "x"));
    let pending: (() => void) | null = null;
    setTimerFn((cb, delayMs) => {
      expect(delayMs).toBe(250);
      pending = cb;
      return 0;
    });
    scheduleCleanup(path, 250);
    expect(existsSync(path)).toBe(true); // timer has not fired yet
    expect(pending).not.toBeNull();
    pending?.();
    expect(existsSync(path)).toBe(false);
  });

  it("setTimerFn returns the previous timer for afterEach restoration", () => {
    const a: typeof setTimeout = () => 0 as unknown as ReturnType<typeof setTimeout>;
    const previous = setTimerFn(a);
    expect(typeof previous).toBe("function");
    // restore default to avoid poisoning later tests
    setTimerFn(previous);
  });
});
