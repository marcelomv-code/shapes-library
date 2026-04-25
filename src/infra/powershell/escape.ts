/**
 * String escaping helpers for safely interpolating values into PowerShell
 * single-quoted string literals.
 *
 * Centralizing these avoids the drift we see today, where every call site
 * hand-rolls `.replace(/'/g, "''")` with no tests or audit trail. Grep for
 * `psSingleQuote` / `psPath` to list every crossing of untrusted input
 * into a PS script.
 *
 * Scaffolding only -- Phase 4 migrates call sites.
 */

/**
 * Escape a string for use inside a PowerShell SINGLE-QUOTED literal:
 *
 *   `'${psSingleQuote(value)}'`
 *
 * Why single-quoted: inside `'...'` PowerShell performs NO variable or
 * sub-expression expansion. The only character that needs escaping is
 * the single quote itself, which is doubled (`'` -> `''`).
 *
 * Also strips NUL (`U+0000`), which PS cannot represent in a string
 * literal and which could truncate output when the string is piped
 * through C APIs. Other whitespace (newlines, tabs) passes through
 * literally, which is safe inside single quotes.
 */
export function psSingleQuote(value: string): string {
  if (value == null) return "";
  return String(value)
    .split("\u0000") // strip NUL (split/join avoids no-control-regex lint)
    .join("")
    .replace(/'/g, "''");
}

/**
 * Escape a filesystem path for use inside a PowerShell single-quoted literal.
 * Thin alias over `psSingleQuote` -- kept separate so an audit grep for
 * `psPath(` lists every PS <-> filesystem boundary in the codebase.
 */
export function psPath(path: string): string {
  return psSingleQuote(path);
}

/**
 * Encode a PS script as a UTF-16LE base64 blob for the `-EncodedCommand`
 * flag. Avoids writing anything to disk and sidesteps PS 5.1's default
 * .ps1 encoding (Windows-1252) at the cost of harder-to-debug errors and
 * a ~8 KiB command-line size limit.
 *
 * The default runner uses the `-File` path, not this. Exported for future
 * callers (Phase 4+) that need no-disk execution.
 */
export function encodePSCommand(script: string): string {
  const utf16le = Buffer.from(script, "utf16le");
  return utf16le.toString("base64");
}
