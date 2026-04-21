/**
 * String escaping helpers for safely interpolating values into PowerShell
 * single-quoted string literals.
 *
 * Rationale: today many call sites inline user-controlled paths with a
 * hand-written `.replace(/'/g, "''")`. Centralizing prevents drift and
 * makes it easier to audit the set of places where untrusted input crosses
 * into a PS script.
 *
 * Scaffolding only — Phase 4 migrates call sites to these helpers.
 */

/**
 * Escape a string for use inside a PowerShell SINGLE-QUOTED literal:
 *
 *   `'${psSingleQuote(value)}'`
 *
 * In PS single-quoted strings, the only character that needs escaping is the
 * single quote itself, which is doubled (`'` -> `''`). No variable or
 * sub-expression expansion occurs, so this is the safest interpolation form.
 *
 * Also strips NUL which PowerShell cannot represent in a string literal,
 * and normalizes any stray line separators that could break the quoting.
 */
export function psSingleQuote(value: string): string {
  if (value == null) return "";
  return String(value)
    .split("\u0000") // strip NUL (split/join avoids no-control-regex lint)
    .join("")
    .replace(/\r\n/g, "\n") // normalize CRLF before re-expansion
    .replace(/'/g, "''"); // double single quotes
}

/**
 * Escape a filesystem path for use inside a PowerShell single-quoted literal.
 * Thin wrapper over `psSingleQuote` — kept separate to make audit grep easy
 * (all path interpolations should use this).
 */
export function psPath(path: string): string {
  return psSingleQuote(path);
}

/**
 * Encode a PS script as a UTF-16LE base64 blob suitable for the
 * `-EncodedCommand` flag. Avoids writing anything to disk and dodges
 * quoting issues entirely — at the cost of being harder to debug.
 *
 * The runner does not use this by default (temp-file path gives better
 * error messages and is what the existing call sites assume). Exposed for
 * future use by Phase 4 and for scripts that must not touch the filesystem.
 */
export function encodePSCommand(script: string): string {
  const utf16le = Buffer.from(script, "utf16le");
  return utf16le.toString("base64");
}
