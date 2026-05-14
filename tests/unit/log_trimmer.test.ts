import { describe, it, expect } from "vitest";
import { trimErrorLog } from "../../src/tools/log_trimmer.js";

const SAMPLE_ERROR_LOG = `> project@1.0.0 build
> tsc

src/components/App.tsx(42,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils/helpers.ts(10,3): error TS2304: Cannot find name 'userData'.

npm ERR! code ELIFECYCLE
npm ERR! errno 2
npm ERR! project@1.0.0 build: \`tsc\`
npm ERR! Exit status 2

Error: Build failed
    at BuildEngine.run (/home/user/project/node_modules/webpack/lib/BuildEngine.js:123:45)
    at Object.compile (/home/user/project/node_modules/webpack/lib/compiler.js:89:23)
    at processChild (/home/user/project/node_modules/webpack/lib/worker.js:45:12)
    at process.emit (node:events:390:28)
    at process._tickCallback (internal/process/next_tick:68:7)
    at Module._compile (node:internal/modules/cjs/loader:1105:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1159:10)
    at doBuild (/home/user/project/src/build.ts:55:20)
    at buildProject (/home/user/project/src/cli.ts:102:15)
`;

describe("trimErrorLog", () => {
  it("should extract error messages", () => {
    const result = trimErrorLog(SAMPLE_ERROR_LOG);
    expect(result.summary).toContain("Build failed");
  });

  it("should reduce line count significantly", () => {
    const result = trimErrorLog(SAMPLE_ERROR_LOG);
    expect(result.stats.summaryLines).toBeLessThan(result.stats.originalLines);
  });

  it("should filter out node_modules frames", () => {
    const result = trimErrorLog(SAMPLE_ERROR_LOG);
    // Should NOT contain node_modules paths in stack frames
    expect(result.summary).not.toContain("node_modules/webpack");
  });

  it("should keep business code frames", () => {
    const result = trimErrorLog(SAMPLE_ERROR_LOG, "/home/user/project/src");
    // Business code frames should be present
    expect(result.summary).toContain("src/build.ts");
  });

  it("should respect maxFrames", () => {
    const longLog = Array(50).fill("").map((_, i) => `    at func${i} (/src/file${i}.ts:${i}:1)`).join("\n");
    const result = trimErrorLog(longLog, undefined, 5);
    // Should not exceed maxFrames + overhead lines
    expect(result.stats.summaryLines).toBeLessThan(20);
  });

  it("should handle empty log", () => {
    const result = trimErrorLog("");
    expect(result.summary).toBeDefined();
    expect(result.stats.originalLines).toBe(1);
  });
});
