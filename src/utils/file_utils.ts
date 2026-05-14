// ContextGC — 文件操作工具

import fs from "node:fs";
import { ParseError, ParseErrorCode } from "./errors.js";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export async function readFileSafe(filePath: string): Promise<string> {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new ParseError(ParseErrorCode.FILE_NOT_FOUND, `Not a file: ${filePath}`, { filePath });
    }
    if (stat.size > MAX_FILE_SIZE) {
      throw new ParseError(ParseErrorCode.FILE_TOO_LARGE, `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB > 1MB): ${filePath}`, { filePath });
    }
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error instanceof ParseError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ParseError(ParseErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}`, { filePath });
    }
    throw new ParseError(ParseErrorCode.ENCODING_ERROR, `Failed to read file: ${filePath}`, { filePath });
  }
}

export function getFileMtime(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}
