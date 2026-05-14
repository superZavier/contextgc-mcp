// ContextGC — Tool 统一注册中心

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParserFactory } from "../parsers/parser_factory.js";
import { BabelParser } from "../parsers/babel_parser.js";
import { RegexFallbackParser } from "../parsers/regex_fallback.js";
import { CacheManager } from "../memory/cache.js";
import { trimErrorLog } from "./log_trimmer.js";
import { readFileSafe } from "../utils/file_utils.js";
import { detectLanguage, isBabelSupported } from "../utils/language_detect.js";
import { ParseError, ParseErrorCode, formatToolError, type ToolResult } from "../utils/errors.js";
import type { ContextGCConfig } from "../config/schema.js";
import type { ParseResult, SkeletonOptions } from "../parsers/interface.js";

interface ToolDeps {
  config: ContextGCConfig;
  cache: CacheManager;
  parserFactory: ParserFactory;
}

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  const { config, cache, parserFactory } = deps;

  if (!config.enabled) return;

  // ─────────────────────────────────────────────────────
  // Tool 1: read_code_skeleton
  // ─────────────────────────────────────────────────────
  server.tool(
    "read_code_skeleton",
    "Reads a source code file and returns ONLY its structural skeleton (imports, type definitions, class declarations, function signatures with parameter types and return types). Internal logic is replaced with '/* ... [omitted by ContextGC] ... */'. Use this tool FIRST when exploring files larger than 100 lines to save 70-90% context tokens. After reviewing the skeleton, use read_function_body to expand specific functions.",
    {
      filePath: z.string().describe("Absolute path to the source code file"),
      focusFunction: z.string().optional().describe("Name of function/method to keep full body for. Use when you need to see a specific implementation."),
      focusLine: z.number().optional().describe("Line number to focus on — keeps the containing function's body intact."),
      maxOutputLines: z.number().optional().describe("Maximum number of lines in the output. Default: 500."),
    },
    async (args): Promise<ToolResult> => {
      try {
        const code = await readFileSafe(args.filePath);
        const parser = parserFactory.getParser(args.filePath);
        const options: SkeletonOptions = {
          focusFunction: args.focusFunction,
          focusLine: args.focusLine,
          maxOutputLines: args.maxOutputLines ?? config.skeleton.maxOutputLines,
          preserveTypes: config.skeleton.preserveTypes,
          preserveImports: config.skeleton.preserveImports,
          preserveExports: config.skeleton.preserveExports,
          preserveComments: config.skeleton.preserveComments,
        };

        let result: ParseResult;
        try {
          result = parser.parse(code, options);
        } catch (error) {
          if (error instanceof ParseError && (
            error.code === ParseErrorCode.SYNTAX_ERROR ||
            error.code === ParseErrorCode.UNSUPPORTED_LANGUAGE
          )) {
            // 降级到正则提取
            result = parserFactory.getFallbackParser().parse(code, options);
          } else if (error instanceof ParseError && (
            error.code === ParseErrorCode.FILE_TOO_LARGE ||
            error.code === ParseErrorCode.PARSE_TIMEOUT
          )) {
            // 降级到头部截断
            const lines = code.split("\n");
            const maxLines = options.maxOutputLines ?? 500;
            const truncated = lines.slice(0, maxLines).join("\n");
            result = {
              skeleton: truncated + `\n// ... [truncated at ${maxLines} lines — ${lines.length - maxLines} lines omitted by ContextGC]`,
              stats: {
                originalLines: lines.length,
                skeletonLines: Math.min(lines.length, maxLines) + 1,
                compressionRatio: lines.length > 0 ? Math.min(lines.length, maxLines) / lines.length : 0,
                functionsOmitted: 0,
                functionsPreserved: 0,
                parserUsed: "regex-fallback",
              },
              warnings: [`${error.code}: ${error.message}. Used truncation fallback.`],
            };
          } else {
            throw error;
          }
        }

        // 更新缓存
        const cacheKey = cache.makeKey(args.filePath, args.focusFunction);
        cache.set(cacheKey, result.skeleton, result.stats);

        const reduction = ((1 - result.stats.compressionRatio) * 100).toFixed(1);
        const statsLine = `\n// [ContextGC] ${result.stats.originalLines} → ${result.stats.skeletonLines} lines (${reduction}% reduction, parser: ${result.stats.parserUsed})`;
        const warnings = result.warnings.length > 0
          ? `\n// [ContextGC Warnings] ${result.warnings.join("; ")}`
          : "";

        return {
          content: [{ type: "text", text: result.skeleton + statsLine + warnings }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // Tool 2: read_function_body
  // ─────────────────────────────────────────────────────
  server.tool(
    "read_function_body",
    "Expands the full implementation of a specific function/method from a file. Use AFTER read_code_skeleton when you need to see a particular function's logic. This returns ONLY the requested function's complete body, not the entire file.",
    {
      filePath: z.string().describe("Absolute path to the source code file"),
      functionName: z.string().describe("Name of the function or method to expand"),
      includeContext: z.boolean().optional().describe("Include 5 lines of context before/after the function. Default: true."),
    },
    async (args): Promise<ToolResult> => {
      try {
        const code = await readFileSafe(args.filePath);
        const parser = parserFactory.getParser(args.filePath);
        const location = parser.locateFunction(code, args.functionName);

        if (!location || location.startLine === -1) {
          const alternatives = location?.alternatives ?? [];
          return {
            content: [{
              type: "text",
              text: `Function '${args.functionName}' not found in ${args.filePath}.${alternatives.length > 0 ? ` Possible alternatives: ${alternatives.join(", ")}` : ""}`,
            }],
            isError: true,
          };
        }

        const includeCtx = args.includeContext !== false;
        const lines = code.split("\n");
        const startLine = Math.max(0, location.startLine - 1 - (includeCtx ? 5 : 0));
        const endLine = Math.min(lines.length - 1, location.endLine - 1 + (includeCtx ? 5 : 0));
        const body = lines.slice(startLine, endLine + 1).join("\n");

        return {
          content: [{
            type: "text",
            text: `// ${args.filePath}:${location.startLine}-${location.endLine}\n${body}`,
          }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // Tool 3: parse_error_log
  // ─────────────────────────────────────────────────────
  server.tool(
    "parse_error_log",
    "Parses and compresses error logs / stack traces to extract only the essential error information. Filters out node_modules frames, keeps only your source code references. Use this instead of reading raw stderr output to save 90%+ tokens.",
    {
      logContent: z.string().describe("The raw error log / stderr output to compress"),
      workspaceRoot: z.string().optional().describe("Absolute path of the workspace root, used to identify business code frames."),
      maxFrames: z.number().optional().describe("Maximum number of stack frames to include. Default: 10."),
    },
    async (args): Promise<ToolResult> => {
      const result = trimErrorLog(
        args.logContent,
        args.workspaceRoot,
        args.maxFrames ?? config.logTrimmer.maxFrames
      );
      return {
        content: [{
          type: "text",
          text: result.summary + `\n// [ContextGC] ${result.stats.originalLines} → ${result.stats.summaryLines} lines`,
        }],
      };
    }
  );

  // ─────────────────────────────────────────────────────
  // Tool 4: context_gc
  // ─────────────────────────────────────────────────────
  server.tool(
    "context_gc",
    "Trigger context garbage collection. This clears cached file skeletons that are no longer needed, freeing context window space. Use this when you notice context is getting full or after completing a task branch.",
    {
      strategy: z.enum(["lru", "all", "older-than"]).optional().describe("GC strategy: 'lru' evicts least-recently-used entries, 'all' clears everything, 'older-than' clears entries older than TTL. Default: 'lru'."),
      ttlMinutes: z.number().optional().describe("Only used with 'older-than' strategy. Entries older than this many minutes will be evicted. Default: 30."),
    },
    async (args): Promise<ToolResult> => {
      const evicted = cache.gc(args.strategy ?? "lru", args.ttlMinutes);
      return {
        content: [{
          type: "text",
          text: `[ContextGC] GC complete. Evicted ${evicted} cache entries. Cache now has ${cache.size} entries.`,
        }],
      };
    }
  );
}
