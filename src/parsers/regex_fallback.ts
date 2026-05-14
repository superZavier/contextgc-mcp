// ContextGC — 正则降级解析器（当 AST 解析不可用时使用）

import type { IParser, ParseResult, SkeletonOptions, FunctionLocation } from "./interface.js";

const KEEP_PATTERNS = [
  /^\s*import\s/,           // import 语句
  /^\s*from\s/,            // from ... import
  /^\s*export\s/,          // export 语句
  /^\s*(public|private|protected)?\s*(class|interface|type|enum)\s/,  // 类型声明
  /^\s*(async\s+)?function\s/,        // 函数声明
  /^\s*(const|let|var)\s+\w+\s*[:=]/,  // 变量声明（含类型）
  /^\s*(def|func|fn|pub\s+fn)\s/,      // Python/Go/Rust 函数
  /^\s*@/,                           // 装饰器/注解
  /^\s*#/,                           // 预处理指令
];

export class RegexFallbackParser implements IParser {
  supportedLanguages(): string[] {
    return ["*"]; // 通配，支持所有语言
  }

  parse(code: string, options: SkeletonOptions): ParseResult {
    const lines = code.split("\n");
    const skeletonLines: string[] = [];
    let functionsOmitted = 0;
    const warnings = ["Regex fallback used — skeleton may be imprecise"];

    let insideBlock = false;
    let braceDepth = 0;
    let currentFuncName: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (insideBlock) {
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;
        if (braceDepth <= 0) {
          insideBlock = false;
          skeletonLines.push("    /* ... [omitted by ContextGC] ... */");
          skeletonLines.push("}");
        }
        continue;
      }

      const shouldKeep = KEEP_PATTERNS.some((p) => p.test(line));
      if (shouldKeep) {
        // 检查是否是 focusFunction
        const funcMatch = line.match(/(?:function|def|fn|func)\s+(\w+)/);
        currentFuncName = funcMatch?.[1];

        if (currentFuncName && options.focusFunction && currentFuncName === options.focusFunction) {
          // 保留焦点函数的完整内容
          skeletonLines.push(line);
          // 收集整个函数体
          let depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          let j = i + 1;
          while (j < lines.length && depth > 0) {
            skeletonLines.push(lines[j]);
            depth += (lines[j].match(/{/g) || []).length;
            depth -= (lines[j].match(/}/g) || []).length;
            j++;
          }
          i = j - 1;
          continue;
        }

        skeletonLines.push(line);
        // 如果该行有 { 且没有闭合，进入块跳过模式
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        if (opens > closes) {
          insideBlock = true;
          braceDepth = opens - closes;
          functionsOmitted++;
        }
      }
    }

    const maxLines = options.maxOutputLines ?? 500;
    let skeleton = skeletonLines.join("\n");
    if (skeletonLines.length > maxLines) {
      skeleton = skeletonLines.slice(0, maxLines).join("\n") + `\n// ... [truncated at ${maxLines} lines by ContextGC]`;
    }

    return {
      skeleton,
      stats: {
        originalLines: lines.length,
        skeletonLines: Math.min(skeletonLines.length, maxLines),
        compressionRatio: lines.length > 0 ? Math.min(skeletonLines.length, maxLines) / lines.length : 0,
        functionsOmitted,
        functionsPreserved: 0,
        parserUsed: "regex-fallback",
      },
      warnings,
    };
  }

  locateFunction(code: string, functionName: string): FunctionLocation | null {
    const lines = code.split("\n");
    const alternatives: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/(?:function|def|fn|func)\s+(\w+)/);
      if (match) {
        alternatives.push(match[1]);
        if (match[1] === functionName) {
          // 尝试找到函数结束行
          let braceDepth = (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
          let endLine = i;
          for (let j = i + 1; j < lines.length && braceDepth > 0; j++) {
            braceDepth += (lines[j].match(/{/g) || []).length;
            braceDepth -= (lines[j].match(/}/g) || []).length;
            endLine = j;
          }
          return { name: functionName, startLine: i + 1, endLine: endLine + 1 };
        }
      }
    }

    // 模糊匹配
    const fuzzy = alternatives.filter((a) =>
      a.toLowerCase().includes(functionName.toLowerCase())
    );
    if (fuzzy.length > 0) {
      return { name: functionName, startLine: -1, endLine: -1, alternatives: fuzzy };
    }

    return null;
  }
}
