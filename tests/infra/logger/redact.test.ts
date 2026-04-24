import { describe, it, expect } from "vitest";
import { redactString, redactValue, redactArgs, REDACTED } from "../../../src/infra/logger/redact";

describe("redactString — per-rule coverage", () => {
  it("redacts Windows user home with backslashes", () => {
    const input = "C:\\Users\\m.vieira\\OneDrive - Accenture\\Desenvolvimentos\\Shapes-libreary-v3";
    const out = redactString(input);
    expect(out).toContain(`C:\\Users\\${REDACTED}\\`);
    expect(out).not.toContain("m.vieira");
    // OneDrive org rule should also fire on the same string.
    expect(out).toContain(`OneDrive - ${REDACTED}`);
    expect(out).not.toContain("Accenture");
  });

  it("redacts Windows user home across any drive letter", () => {
    const out = redactString("D:\\Users\\bob\\notes.txt");
    expect(out).toBe(`D:\\Users\\${REDACTED}\\notes.txt`);
  });

  it("redacts Windows user home written with forward slashes", () => {
    const out = redactString("c:/Users/alice/tmp/file.log");
    expect(out).toBe(`c:/Users/${REDACTED}/tmp/file.log`);
  });

  it("redacts macOS /Users home", () => {
    const out = redactString("open /Users/marcelo/Documents/report.pdf please");
    expect(out).toBe(`open /Users/${REDACTED}/Documents/report.pdf please`);
  });

  it("redacts Linux /home path", () => {
    const out = redactString("copied to /home/marcelo/src/app");
    expect(out).toBe(`copied to /home/${REDACTED}/src/app`);
  });

  it("redacts OneDrive org segment up to the next slash", () => {
    const out = redactString("/mnt/OneDrive - Acme Corp/projects");
    expect(out).toBe(`/mnt/OneDrive - ${REDACTED}/projects`);
  });

  it("redacts email local-part but keeps the domain intact", () => {
    const out = redactString("ping marcelomatosvieira@gmail.com about this");
    expect(out).toBe(`ping ${REDACTED}@gmail.com about this`);
  });

  it("redacts long tokens (32+ chars)", () => {
    const token = "a".repeat(40);
    const out = redactString(`Bearer ${token} end`);
    expect(out).toBe(`Bearer ${REDACTED} end`);
  });

  it("leaves short hex-like IDs alone", () => {
    const out = redactString("id=abc123 short");
    expect(out).toBe("id=abc123 short");
  });

  it("passes empty string through", () => {
    expect(redactString("")).toBe("");
  });

  it("is idempotent (running twice equals running once)", () => {
    const input = "C:\\Users\\alice\\file on OneDrive - Corp with marcelo@gmail.com";
    const once = redactString(input);
    const twice = redactString(once);
    expect(twice).toBe(once);
  });
});

describe("redactValue — recursive redaction", () => {
  it("returns primitives other than strings untouched", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
    expect(redactValue(undefined)).toBe(undefined);
  });

  it("redacts strings inside objects recursively", () => {
    const input = { path: "/Users/alice/a", nested: { email: "bob@acme.com" } };
    const out = redactValue(input) as { path: string; nested: { email: string } };
    expect(out.path).toBe(`/Users/${REDACTED}/a`);
    expect(out.nested.email).toBe(`${REDACTED}@acme.com`);
  });

  it("redacts strings inside arrays", () => {
    const out = redactValue(["/home/x", "plain"]) as string[];
    expect(out[0]).toBe(`/home/${REDACTED}`);
    expect(out[1]).toBe("plain");
  });

  it("special-cases Error with name/message/stack redacted", () => {
    const err = new Error("failed at /Users/alice/path");
    err.stack = "Error: failed at /Users/alice/path\n    at /home/alice/app.ts";
    const out = redactValue(err) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe(`failed at /Users/${REDACTED}/path`);
    expect(out.stack).toContain(`/Users/${REDACTED}/path`);
    expect(out.stack).toContain(`/home/${REDACTED}/app.ts`);
  });

  it("short-circuits circular references", () => {
    const a: Record<string, unknown> = { name: "outer" };
    a.self = a;
    const out = redactValue(a) as { name: string; self: unknown };
    expect(out.name).toBe("outer");
    expect(out.self).toBe("[Circular]");
  });

  it("does not mutate the input object", () => {
    const input = { p: "/Users/alice/x" };
    const copy = { ...input };
    redactValue(input);
    expect(input).toEqual(copy);
  });
});

describe("redactArgs — console-style arg list", () => {
  it("returns a shallow copy (different array identity)", () => {
    const input: unknown[] = ["x"];
    const out = redactArgs(input);
    expect(out).not.toBe(input);
  });

  it("redacts string args and walks object args", () => {
    const err = new Error("boom at C:\\Users\\alice\\file");
    const out = redactArgs(["[Export] running on /Users/alice", err, 7]);
    expect(out[0]).toBe(`[Export] running on /Users/${REDACTED}`);
    expect((out[1] as { message: string }).message).toBe(`boom at C:\\Users\\${REDACTED}\\file`);
    expect(out[2]).toBe(7);
  });

  it("passes through non-string, non-object primitives unchanged", () => {
    const out = redactArgs([1, true, null, undefined]);
    expect(out).toEqual([1, true, null, undefined]);
  });
});
