import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";

// MCP Server 端到端验收测试
// 通过真实的 stdio JSON-RPC 通信验证完整功能

let serverProcess: ChildProcess;
let requestId = 0;

function sendRequest(method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const rl = createInterface({ input: serverProcess.stdout! });
    rl.on("line", (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === id) {
          rl.close();
          resolve(response);
        }
      } catch {
        // 忽略非 JSON 行
      }
    });

    setTimeout(() => {
      rl.close();
      reject(new Error(`Request timeout for ${method}`));
    }, 10000);

    serverProcess.stdin!.write(message + "\n");
  });
}

function sendNotification(method: string, params: Record<string, unknown> = {}): void {
  const message = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
  });
  serverProcess.stdin!.write(message + "\n");
}

describe("MCP Server Integration Tests", () => {
  beforeAll(() => {
    const serverPath = path.resolve(__dirname, "../../dist/index.js");
    serverProcess = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CONTEXTGC_LOG_LEVEL: "silent" },
    });

    serverProcess.stderr!.on("data", (data: Buffer) => {
      // 日志输出到 stderr，忽略
    });

    // 发送 initialize 请求
    return sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }).then(() => {
      // 发送 initialized 通知
      sendNotification("notifications/initialized");
    });
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it("should list available tools", async () => {
    const response = await sendRequest("tools/list");
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("read_code_skeleton");
    expect(toolNames).toContain("read_function_body");
    expect(toolNames).toContain("parse_error_log");
    expect(toolNames).toContain("context_gc");
  });

  it("should list available prompts", async () => {
    const response = await sendRequest("prompts/list");
    expect(response.result).toBeDefined();
    expect(response.result.prompts).toBeDefined();
    const promptNames = response.result.prompts.map((p: any) => p.name);
    expect(promptNames).toContain("context_gc_rules");
  });

  it("should return prompt content", async () => {
    const response = await sendRequest("prompts/get", {
      name: "context_gc_rules",
    });
    expect(response.result).toBeDefined();
    expect(response.result.messages).toBeDefined();
    expect(response.result.messages.length).toBeGreaterThan(0);
    expect(response.result.messages[0].content.text).toContain("ContextGC Rules");
  });

  it("should extract code skeleton via read_code_skeleton tool", async () => {
    const testFilePath = path.resolve(__dirname, "../../src/index.ts");
    const response = await sendRequest("tools/call", {
      name: "read_code_skeleton",
      arguments: { filePath: testFilePath },
    });
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe("text");
    expect(response.result.content[0].text).toContain("[ContextGC]");
    expect(response.result.content[0].text).toContain("reduction");
  });

  it("should expand function body via read_function_body tool", async () => {
    const testFilePath = path.resolve(__dirname, "../../src/index.ts");
    const response = await sendRequest("tools/call", {
      name: "read_function_body",
      arguments: { filePath: testFilePath, functionName: "main" },
    });
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe("text");
    // Should contain the function implementation
    expect(response.result.content[0].text).toContain("main");
  });

  it("should compress error logs via parse_error_log tool", async () => {
    const errorLog = `Error: Build failed
    at BuildEngine.run (/project/node_modules/webpack/lib/BuildEngine.js:123:45)
    at compile (/project/src/build.ts:55:20)
    at run (/project/node_modules/webpack/lib/compiler.js:89:23)
    at Module._compile (node:internal/modules/cjs/loader:1105:14)`;

    const response = await sendRequest("tools/call", {
      name: "parse_error_log",
      arguments: { logContent: errorLog, workspaceRoot: "/project/src" },
    });
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toContain("Build failed");
    expect(response.result.content[0].text).toContain("[ContextGC]");
  });

  it("should run GC via context_gc tool", async () => {
    const response = await sendRequest("tools/call", {
      name: "context_gc",
      arguments: { strategy: "all" },
    });
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toContain("GC complete");
  });

  it("should handle non-existent file gracefully", async () => {
    const response = await sendRequest("tools/call", {
      name: "read_code_skeleton",
      arguments: { filePath: "/nonexistent/file.ts" },
    });
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toContain("Error");
  });
});
