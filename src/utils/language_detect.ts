// ContextGC — 语言检测工具

import path from "node:path";

const EXTENSION_MAP: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".lua": "lua",
  ".scala": "scala",
  ".sql": "sql",
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? "unknown";
}

/** Babel 解析器支持的语言列表 */
const BABEL_LANGUAGES = new Set(["javascript", "jsx", "typescript", "tsx", "mjs"]);

export function isBabelSupported(language: string): boolean {
  return BABEL_LANGUAGES.has(language);
}
