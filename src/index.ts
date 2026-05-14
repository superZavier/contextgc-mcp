#!/usr/bin/env node

// ContextGC — MCP Server 入口

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/registry.js";
import { registerPrompts } from "./prompts/context_gc_rules.js";
import { ConfigManager } from "./config/loader.js";
import { CacheManager } from "./memory/cache.js";
import { ParserFactory } from "./parsers/parser_factory.js";

async function main() {
  const config = ConfigManager.load();
  const cache = new CacheManager(config.cache);
  const parserFactory = new ParserFactory();

  const server = new McpServer({
    name: "contextgc",
    version: "0.1.0",
  });

  // 注册所有 Tools
  registerAllTools(server, { config, cache, parserFactory });

  // 注册 Prompts
  registerPrompts(server);

  // 启动 stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 日志输出到 stderr（不影响 MCP stdio 通信）
  process.stderr.write("[ContextGC] MCP Server started (v0.1.0)\n");
}

main().catch((error) => {
  process.stderr.write(`[ContextGC] Fatal error: ${error}\n`);
  process.exit(1);
});
