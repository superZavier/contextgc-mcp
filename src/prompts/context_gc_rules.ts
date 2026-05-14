// ContextGC — MCP Prompt 注入

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "context_gc_rules",
    "Token optimization rules for ContextGC. Apply these rules to minimize context usage.",
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `[ContextGC Rules - CRITICAL]
You have ContextGC installed for token optimization. Follow these rules STRICTLY:

1. NEVER use the built-in read_file for source code files larger than 100 lines.
   Instead, use 'read_code_skeleton' first. It returns the file's structure
   (imports, types, function signatures) with 70-90% fewer tokens.

2. After reviewing a skeleton, if you need to see a specific function's implementation,
   use 'read_function_body' with the function name. This returns only that function,
   not the entire file.

3. When a terminal command fails with error output, NEVER read the raw output directly.
   Use 'parse_error_log' to get a compressed summary with only relevant stack frames.

4. When context is getting full (approaching limit), use 'context_gc' to clear
   cached data that is no longer needed.

These rules exist to prevent context window overflow and reduce API costs.`,
          },
        },
      ],
    })
  );
}
