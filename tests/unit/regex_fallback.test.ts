import { describe, it, expect } from "vitest";
import { RegexFallbackParser } from "../../src/parsers/regex_fallback.js";

describe("RegexFallbackParser", () => {
  const parser = new RegexFallbackParser();

  it("should support all languages (wildcard)", () => {
    expect(parser.supportedLanguages()).toContain("*");
  });

  it("should extract skeleton from JS code", () => {
    const code = `import fs from 'fs';\n\nfunction foo() {\n  console.log('hello');\n}\n\nfunction bar() {\n  return 42;\n}\n`;
    const result = parser.parse(code, {});
    expect(result.skeleton).toContain("import fs");
    expect(result.skeleton).toContain("[omitted by ContextGC]");
    expect(result.stats.parserUsed).toBe("regex-fallback");
  });

  it("should preserve focusFunction", () => {
    const code = `function foo() {\n  console.log('hello');\n}\n\nfunction bar() {\n  return 42;\n}\n`;
    const result = parser.parse(code, { focusFunction: "bar" });
    expect(result.skeleton).toContain("return 42");
  });

  it("should locate a function", () => {
    const code = `function hello() {\n  return 'world';\n}\n`;
    const loc = parser.locateFunction(code, "hello");
    expect(loc).not.toBeNull();
    expect(loc!.name).toBe("hello");
    expect(loc!.startLine).toBe(1);
  });

  it("should return null for missing function", () => {
    const code = `function hello() {}\n`;
    const loc = parser.locateFunction(code, "missing");
    expect(loc).toBeNull();
  });
});
