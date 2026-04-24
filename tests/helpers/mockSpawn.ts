/**
 * mockSpawn — factory for mocking `child_process.spawn`.
 *
 * The runner in `src/infra/powershell/runner.ts` and the zip adapters
 * in `src/infra/zip/inspectZip.ts` / `src/features/shape-picker/libraryZip.ts`
 * all interact with `spawn()` via the same shape: a ChildProcess-like
 * EventEmitter with `stdout`, `stderr`, `stdin`, `kill()`, plus `close`
 * / `error` events.
 *
 * `createMockSpawn({...})` returns:
 *   - `spawn`: drop-in replacement suitable for `vi.mock("child_process")`
 *   - `calls`: array of every invocation (command, args, options)
 *   - `nextChild(fn)`: queue a child descriptor used by the next spawn
 *   - `allChildren`: every mock child emitted, in order
 *
 * Default child behavior: emit stdout, stderr, exit code 0 on nextTick.
 */
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { vi } from "vitest";

export type MockChildConfig = {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  /** Process exit code. Default 0. */
  exitCode?: number;
  /** If set, emits `error` instead of `close`. */
  errorCode?: string | NodeJS.ErrnoException;
  /** If true, child never closes on its own (lets tests drive kill/timeout). */
  hang?: boolean;
  /** Override signal argument forwarded to the `close` event. Default null. */
  signal?: NodeJS.Signals | null;
  /** Milliseconds before emitting `close`. Default 0 (nextTick). */
  delayMs?: number;
};

export type MockSpawnCall = {
  command: string;
  args: readonly string[];
  options: unknown;
};

export type MockChild = EventEmitter & {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  config: MockChildConfig;
  /** Trigger the `close` event manually (useful for hang=true cases). */
  finish: (exit?: number, signal?: NodeJS.Signals | null) => void;
};

function makeChild(config: MockChildConfig): MockChild {
  const child = new EventEmitter() as MockChild;

  const stdoutBuf = config.stdout ? Buffer.from(config.stdout) : undefined;
  const stderrBuf = config.stderr ? Buffer.from(config.stderr) : undefined;

  child.stdout = Readable.from(stdoutBuf ? [stdoutBuf] : []);
  child.stderr = Readable.from(stderrBuf ? [stderrBuf] : []);

  // Writable stdin that just discards data so callers can .end() safely.
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });

  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  child.config = config;

  child.finish = (exit?: number, signal: NodeJS.Signals | null = null) => {
    child.emit("close", exit ?? config.exitCode ?? 0, signal ?? config.signal ?? null);
  };

  if (!config.hang) {
    const run = () => {
      if (config.errorCode) {
        const err =
          typeof config.errorCode === "string"
            ? Object.assign(new Error(config.errorCode), { code: config.errorCode })
            : config.errorCode;
        child.emit("error", err);
        return;
      }
      child.emit("close", config.exitCode ?? 0, config.signal ?? null);
    };
    if (config.delayMs && config.delayMs > 0) {
      setTimeout(run, config.delayMs);
    } else {
      // `setImmediate` is preferred over `process.nextTick` because
      // nextTicks drain in a single burst *before* microtasks, which
      // means callers that `await` between spawns would never get a
      // chance to register listeners on the second child. `setImmediate`
      // yields to microtasks between callbacks, matching the real
      // spawn-fork latency closely enough for tests.
      setImmediate(run);
    }
  }

  return child;
}

export type MockSpawnController = {
  spawn: ReturnType<typeof vi.fn>;
  calls: MockSpawnCall[];
  allChildren: MockChild[];
  /** Queue the config for the *next* spawn invocation only. */
  nextChild: (config: MockChildConfig) => void;
  /** Reset calls, queue, and children. */
  reset: () => void;
};

/**
 * Build a spawn controller. `defaultChild` is used when no child is
 * queued via `nextChild`. Pass `defaultChild=null` to require explicit
 * queueing (useful for strict tests).
 */
export function createMockSpawn(defaultChild: MockChildConfig | null = { exitCode: 0 }): MockSpawnController {
  const calls: MockSpawnCall[] = [];
  const allChildren: MockChild[] = [];
  const queue: MockChildConfig[] = [];

  const spawn = vi.fn((command: string, args: readonly string[] = [], options: unknown = {}) => {
    calls.push({ command, args, options });
    const config = queue.shift() ?? defaultChild;
    if (!config) {
      throw new Error(`mockSpawn: no child queued for '${command}' (call #${calls.length})`);
    }
    const child = makeChild(config);
    allChildren.push(child);
    return child;
  });

  return {
    spawn,
    calls,
    allChildren,
    nextChild(config) {
      queue.push(config);
    },
    reset() {
      calls.length = 0;
      allChildren.length = 0;
      queue.length = 0;
      spawn.mockClear();
    },
  };
}
