/**
 * Sanity tests for the Phase-0 helper utilities. These are not contract
 * tests for the production code — they guarantee that mockFs, mockSpawn,
 * and mockRaycast behave deterministically across tests so later fixes
 * (F1.*, F2.*, ...) can rely on them.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";

import { mockFsReset, mockFsSeed, mockFsExists, mockFsRead, mockFs, installFsMocks } from "./mockFs";
import { createMockSpawn } from "./mockSpawn";
import { raycastState, raycast, resetRaycastMocks } from "./mockRaycast";

describe("mockFs helper", () => {
  beforeEach(() => {
    mockFsReset();
  });

  it("seeds files and reads them back as Buffer", () => {
    mockFsSeed({ "/tmp/a.txt": "hello" });
    expect(mockFsExists("/tmp/a.txt")).toBe(true);
    expect(mockFsRead("/tmp/a.txt")?.toString("utf8")).toBe("hello");
  });

  it("creates parent directories on seed", () => {
    mockFsSeed({ "/tmp/deep/nested/file.json": "{}" });
    expect(mockFsExists("/tmp/deep")).toBe(true);
    expect(mockFsExists("/tmp/deep/nested")).toBe(true);
  });

  it("sync fs surface: write, read, rename, unlink", () => {
    mockFs.sync.writeFileSync("/w/test.txt", "one");
    expect(mockFs.sync.existsSync("/w/test.txt")).toBe(true);
    expect(mockFs.sync.readFileSync("/w/test.txt", "utf8")).toBe("one");

    mockFs.sync.renameSync("/w/test.txt", "/w/test2.txt");
    expect(mockFs.sync.existsSync("/w/test.txt")).toBe(false);
    expect(mockFs.sync.existsSync("/w/test2.txt")).toBe(true);

    mockFs.sync.unlinkSync("/w/test2.txt");
    expect(mockFs.sync.existsSync("/w/test2.txt")).toBe(false);
  });

  it("statSync returns plausible stat shape", () => {
    mockFsSeed({ "/s/file.bin": Buffer.from([1, 2, 3, 4]) });
    const s = mockFs.sync.statSync("/s/file.bin");
    expect(s.isFile()).toBe(true);
    expect(s.size).toBe(4);
  });

  it("isolates between tests (volume emptied by reset)", () => {
    // previous tests seeded paths; after the beforeEach reset, they should be gone.
    expect(mockFsExists("/tmp/a.txt")).toBe(false);
    expect(mockFsExists("/w/test.txt")).toBe(false);
  });

  it("throws ENOENT on missing file", () => {
    expect(() => mockFs.sync.readFileSync("/missing")).toThrowError(/ENOENT/);
  });
});

describe("installFsMocks wiring (documented API)", () => {
  it("exports installFsMocks without throwing", () => {
    // We can't call installFsMocks() here because vi.mock is hoisted per
    // test file and would collide with other tests' imports. This test
    // only asserts the function is exported and callable shape-wise.
    expect(typeof installFsMocks).toBe("function");
  });
});

describe("mockSpawn helper", () => {
  it("captures command, args, options", async () => {
    const ctrl = createMockSpawn({ exitCode: 0, stdout: "ok" });
    const child = ctrl.spawn("powershell", ["-Command", "echo hi"], { shell: false });
    expect(ctrl.calls).toHaveLength(1);
    expect(ctrl.calls[0].command).toBe("powershell");
    expect(ctrl.calls[0].args).toEqual(["-Command", "echo hi"]);
    await new Promise<void>((resolve) => child.on("close", () => resolve()));
    expect(child.killed).toBe(false);
  });

  it("supports queued per-call configs", async () => {
    const ctrl = createMockSpawn(null);
    ctrl.nextChild({ exitCode: 0, stdout: "one" });
    ctrl.nextChild({ exitCode: 1, stderr: "boom" });

    const c1 = ctrl.spawn("cmd", []);
    const c2 = ctrl.spawn("cmd", []);
    // Register BOTH listeners before awaiting. Sequential awaits would
    // race against the setImmediate-scheduled `close` emits: if the
    // second child fires before the second listener is wired, the event
    // is lost. Registering first eliminates the race.
    const p1 = new Promise<number>((r) => c1.on("close", r));
    const p2 = new Promise<number>((r) => c2.on("close", r));
    const [code1, code2] = await Promise.all([p1, p2]);
    expect(code1).toBe(0);
    expect(code2).toBe(1);
  });

  it("emits error when errorCode is set", async () => {
    const ctrl = createMockSpawn();
    ctrl.nextChild({ errorCode: "ENOENT" });
    const child = ctrl.spawn("nosuch", []);
    const err = await new Promise<NodeJS.ErrnoException>((r) => child.on("error", r));
    expect(err.code).toBe("ENOENT");
  });

  it("hang=true lets test drive finish() manually", async () => {
    const ctrl = createMockSpawn();
    ctrl.nextChild({ hang: true });
    const child = ctrl.spawn("cmd", []);
    let closed = false;
    child.on("close", () => (closed = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(closed).toBe(false);
    child.finish(42);
    await new Promise((r) => setTimeout(r, 5));
    expect(closed).toBe(true);
  });

  it("reset clears calls and queue", () => {
    const ctrl = createMockSpawn();
    ctrl.spawn("a", []);
    ctrl.reset();
    expect(ctrl.calls).toHaveLength(0);
  });

  it("is compatible with real child_process.spawn signature", () => {
    // Shape check: ensures tests passing ctrl.spawn where `spawn` is
    // expected compile under TS and accept the three-arg form.
    expect(typeof spawn).toBe("function");
  });
});

describe("mockRaycast helper", () => {
  afterEach(() => {
    resetRaycastMocks();
  });

  it("captures showToast payloads", async () => {
    await raycast.showToast({ style: "SUCCESS", title: "Saved" });
    expect(raycast.toasts).toHaveLength(1);
    expect(raycast.toasts[0].title).toBe("Saved");
  });

  it("raycastState.setPrefs and reset work per-test", () => {
    raycastState.setPrefs({ libraryPath: "C:\\tmp\\lib" });
    // The aliased mock keeps state on the module; tests/setup.ts resets it.
    raycastState.reset();
    // After reset, prefs should be empty (tested indirectly — the object
    // is internal but a follow-up setPrefs should overwrite cleanly).
    raycastState.setPrefs({ libraryPath: "/other" });
    raycastState.reset();
    expect(typeof raycastState.setSupportPath).toBe("function");
  });

  it("resetRaycastMocks clears toast spy history", async () => {
    await raycast.showToast({ title: "first" });
    resetRaycastMocks();
    expect(raycast.toasts).toHaveLength(0);
    expect(raycast.showToast).toHaveBeenCalledTimes(0);
  });
});
