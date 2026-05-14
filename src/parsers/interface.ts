// ContextGC — 解析器抽象接口

export interface SkeletonOptions {
  focusFunction?: string;
  focusLine?: number;
  maxOutputLines?: number;
  preserveTypes?: boolean;
  preserveImports?: boolean;
  preserveExports?: boolean;
  preserveComments?: "none" | "doc" | "all";
}

export interface CompressionStats {
  originalLines: number;
  skeletonLines: number;
  compressionRatio: number; // 0-1, lower is better
  functionsOmitted: number;
  functionsPreserved: number;
  parserUsed: "babel" | "regex-fallback";
}

export interface ParseResult {
  skeleton: string;
  stats: CompressionStats;
  warnings: string[];
}

export interface FunctionLocation {
  name: string;
  startLine: number;
  endLine: number;
  alternatives?: string[];
}

export interface IParser {
  parse(code: string, options: SkeletonOptions): ParseResult;
  locateFunction(code: string, functionName: string): FunctionLocation | null;
  supportedLanguages(): string[];
}
