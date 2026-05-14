// ContextGC — 统一错误类型定义

export enum ParseErrorCode {
  SYNTAX_ERROR = "SYNTAX_ERROR",
  UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  PARSE_TIMEOUT = "PARSE_TIMEOUT",
  ENCODING_ERROR = "ENCODING_ERROR",
}

export class ParseError extends Error {
  constructor(
    public readonly code: ParseErrorCode,
    message: string,
    public readonly details?: { originalCode?: string; language?: string; filePath?: string }
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function formatToolError(error: unknown): ToolResult {
  if (error instanceof ParseError) {
    return {
      content: [{
        type: "text",
        text: `[ContextGC Error] ${error.code}: ${error.message}${error.details?.filePath ? ` (file: ${error.details.filePath})` : ""}`,
      }],
      isError: true,
    };
  }
  return {
    content: [{
      type: "text",
      text: `[ContextGC Unexpected Error] ${error instanceof Error ? error.message : String(error)}`,
    }],
    isError: true,
  };
}
