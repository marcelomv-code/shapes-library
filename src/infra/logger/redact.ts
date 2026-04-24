/**
 * Phase 14 — pure PII redaction helpers.
 *
 * Zero I/O, zero side effects. The logger module composes these to sanitize
 * every message before it reaches `console.*`. Keeping the rules in a pure
 * module lets us fuzz them from tests and re-use them when we ship structured
 * log shipping (Phase 15+).
 *
 * The patterns are deliberately conservative: we err on the side of replacing
 * too much rather than leaking user-identifying substrings. Every rule is
 * idempotent — running `redact` twice produces the same output as running it
 * once, which matters because nested adapters sometimes log already-sanitized
 * strings that the outer layer re-wraps.
 */

/**
 * Sentinel inserted in place of a redacted span. A stable string lets tests
 * assert against an exact shape and makes log-greppers' lives easier.
 */
export const REDACTED = "<REDACTED>";

/**
 * Regex rules applied in order. Each rule documents _why_ it exists, because
 * these get tuned over time and "just a tweak" has a bad track record.
 */
const RULES: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp; readonly replace: string }> = [
  // Windows user home: C:\Users\<name>\...  →  C:\Users\<REDACTED>\...
  // Case-insensitive drive letter, any drive A-Z. The trailing `\\` anchors the
  // match so we don't eat the whole path — we only redact the NAME segment.
  {
    name: "windows-home",
    pattern: /([A-Za-z]):\\Users\\[^\\/\s"'<>|:]+/g,
    replace: `$1:\\Users\\${REDACTED}`,
  },
  // Windows user home using forward slashes (node path.posix, some tools
  // normalize): C:/Users/<name>/... → C:/Users/<REDACTED>/...
  {
    name: "windows-home-fwd",
    pattern: /([A-Za-z]):\/Users\/[^\\/\s"'<>|:]+/g,
    replace: `$1:/Users/${REDACTED}`,
  },
  // macOS user home: /Users/<name>/... → /Users/<REDACTED>/...
  // Tight character class prevents eating the rest of the path; we stop at the
  // next slash or whitespace.
  {
    name: "mac-home",
    pattern: /\/Users\/[^\\/\s"'<>|:]+/g,
    replace: `/Users/${REDACTED}`,
  },
  // Linux user home: /home/<name>/... → /home/<REDACTED>/...
  {
    name: "linux-home",
    pattern: /\/home\/[^\\/\s"'<>|:]+/g,
    replace: `/home/${REDACTED}`,
  },
  // OneDrive business paths contain "OneDrive - <Org Name>" which leaks the
  // employer. Replace the segment after "OneDrive - " up to the next `\` or `/`.
  {
    name: "onedrive-org",
    pattern: /OneDrive - [^\\/\r\n]+/g,
    replace: `OneDrive - ${REDACTED}`,
  },
  // Email addresses. Intentionally keep the domain intact so ops can still
  // triage "tenant's Gmail vs corporate O365" without learning _who_. If you
  // prefer full redaction, change the replacement to REDACTED.
  {
    name: "email",
    pattern: /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    replace: `${REDACTED}@$1`,
  },
  // Long hex/base64 tokens (32+ chars). Catches access tokens, SAS keys, etc.
  // Keep the length threshold high so ordinary hex-like IDs don't match.
  {
    name: "long-token",
    pattern: /\b[A-Za-z0-9+/=_-]{32,}\b/g,
    replace: REDACTED,
  },
];

/**
 * Redact PII from a string. Rules are applied in declaration order; result is
 * idempotent because the replacement strings contain the literal `REDACTED`
 * sentinel which no rule subsequently re-matches.
 */
export function redactString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replace);
  }
  return out;
}

/**
 * Recursively redact PII from any value. Primitives pass through unchanged
 * unless they're strings. Objects and arrays are cloned shallowly with their
 * string properties redacted. Circular references short-circuit after one
 * hop (logged objects rarely cycle; a WeakSet guard keeps us safe anyway).
 *
 * Errors are special-cased: we preserve the class name and redact the
 * `message`/`stack` fields. Functions, symbols, and bigints are passed through
 * verbatim because they're never PII vectors in our usage.
 */
export function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (value instanceof Error) {
    // Copy onto a plain object so downstream `console.error` pretty-prints it.
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(v, seen);
  }
  return out;
}

/**
 * Redact an args array as passed to `console.log(...args)`. Strings are
 * redacted in place; non-string values go through `redactValue`. The returned
 * array is a shallow copy so callers can pass it to `console.log` without
 * worrying about aliasing.
 */
export function redactArgs(args: readonly unknown[]): unknown[] {
  return args.map((a) => (typeof a === "string" ? redactString(a) : redactValue(a)));
}
