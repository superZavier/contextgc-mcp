// ContextGC — Babel 解析器 (JS/TS/JSX/TSX)

import { parse, type ParserPlugin } from "@babel/parser";
import _traverse from "@babel/traverse";
import generate from "@babel/generator";
import type { IParser, ParseResult, SkeletonOptions, FunctionLocation } from "./interface.js";
import { ParseError, ParseErrorCode } from "../utils/errors.js";

// ESM/CJS 兼容处理
const traverse = (_traverse as any).default ?? _traverse;

const BABEL_PLUGINS: ParserPlugin[] = [
  "typescript",
  "jsx",
  "decorators-legacy",
  "exportDefaultFrom",
  "dynamicImport",
  "classProperties",
  "optionalChaining",
  "nullishCoalescingOperator",
  "numericSeparator",
  "objectRestSpread",
  "asyncGenerators",
];

const OMIT_MARKER = " /* ... [omitted by ContextGC] ... */ ";

export class BabelParser implements IParser {
  supportedLanguages(): string[] {
    return ["javascript", "jsx", "typescript", "tsx"];
  }

  parse(code: string, options: SkeletonOptions): ParseResult {
    const warnings: string[] = [];
    let ast;

    try {
      ast = parse(code, {
        sourceType: "unambiguous",
        plugins: BABEL_PLUGINS,
      });
    } catch (e) {
      throw new ParseError(
        ParseErrorCode.SYNTAX_ERROR,
        `Babel parse failed: ${(e as Error).message}`,
        { originalCode: code }
      );
    }

    let functionsOmitted = 0;
    let functionsPreserved = 0;
    const allFunctionNames: string[] = [];

    // 收集 focusLine 对应的函数名
    let focusFuncFromLine: string | undefined;
    if (options.focusLine !== undefined) {
      traverse(ast, {
        FunctionDeclaration(path: any) {
          const start = path.node.loc?.start?.line;
          const end = path.node.loc?.end?.line;
          if (start !== undefined && end !== undefined && options.focusLine! >= start && options.focusLine! <= end) {
            focusFuncFromLine = path.node.id?.name;
          }
        },
        ClassMethod(path: any) {
          const start = path.node.loc?.start?.line;
          const end = path.node.loc?.end?.line;
          if (start !== undefined && end !== undefined && options.focusLine! >= start && options.focusLine! <= end) {
            focusFuncFromLine = (path.node.key as any)?.name;
          }
        },
      });
    }

    const effectiveFocusFunction = options.focusFunction ?? focusFuncFromLine;

    // 主遍历：替换非焦点函数体
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const funcName: string | undefined = path.node.id?.name;
        if (funcName) allFunctionNames.push(funcName);
        if (shouldPreserveFunction(funcName, effectiveFocusFunction)) {
          functionsPreserved++;
          return;
        }
        replaceBodyWithOmission(path.node);
        functionsOmitted++;
      },

      ClassMethod(path: any) {
        const funcName: string | undefined = (path.node.key as any)?.name;
        if (funcName) allFunctionNames.push(funcName);
        if (shouldPreserveFunction(funcName, effectiveFocusFunction)) {
          functionsPreserved++;
          return;
        }
        replaceBodyWithOmission(path.node);
        functionsOmitted++;
      },

      ClassPrivateMethod(path: any) {
        const funcName: string | undefined = (path.node.key as any)?.id?.name ?? (path.node.key as any)?.name;
        if (funcName) allFunctionNames.push(funcName);
        if (shouldPreserveFunction(funcName, effectiveFocusFunction)) {
          functionsPreserved++;
          return;
        }
        replaceBodyWithOmission(path.node);
        functionsOmitted++;
      },

      VariableDeclarator(path: any) {
        const init = path.node.init;
        if (!init) return;
        if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") return;

        const funcName: string | undefined = (path.node.id as any)?.name;
        if (funcName) allFunctionNames.push(funcName);
        if (shouldPreserveFunction(funcName, effectiveFocusFunction)) {
          functionsPreserved++;
          return;
        }

        if (init.body.type === "BlockStatement") {
          (init.body as any).body = [
            {
              type: "ExpressionStatement",
              expression: { type: "StringLiteral", value: OMIT_MARKER },
            },
          ];
          functionsOmitted++;
        }
      },
    });

    const result = generate(ast, { retainLines: false, comments: true });
    const maxLines = options.maxOutputLines ?? 500;
    const skeleton = truncateToMaxLines(result.code, maxLines);

    const originalLines = code.split("\n").length;
    const skeletonLines = skeleton.split("\n").length;

    return {
      skeleton,
      stats: {
        originalLines,
        skeletonLines,
        compressionRatio: originalLines > 0 ? skeletonLines / originalLines : 0,
        functionsOmitted,
        functionsPreserved,
        parserUsed: "babel",
      },
      warnings,
    };
  }

  locateFunction(code: string, functionName: string): FunctionLocation | null {
    let ast;
    try {
      ast = parse(code, { sourceType: "unambiguous", plugins: BABEL_PLUGINS });
    } catch {
      return null;
    }

    const alternatives: string[] = [];
    let found: FunctionLocation | null = null;

    traverse(ast, {
      FunctionDeclaration(path: any) {
        const name: string | undefined = path.node.id?.name;
        if (name) {
          alternatives.push(name);
          if (name === functionName && path.node.loc) {
            found = {
              name,
              startLine: path.node.loc.start.line,
              endLine: path.node.loc.end.line,
            };
          }
        }
      },
      ClassMethod(path: any) {
        const name: string | undefined = (path.node.key as any)?.name;
        if (name) {
          alternatives.push(name);
          if (name === functionName && path.node.loc) {
            found = {
              name,
              startLine: path.node.loc.start.line,
              endLine: path.node.loc.end.line,
            };
          }
        }
      },
      VariableDeclarator(path: any) {
        const init = path.node.init;
        if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
          const name: string | undefined = (path.node.id as any)?.name;
          if (name) {
            alternatives.push(name);
            if (name === functionName && init.loc) {
              found = {
                name,
                startLine: init.loc.start.line,
                endLine: init.loc.end.line,
              };
            }
          }
        }
      },
    });

    if (!found && alternatives.length > 0) {
      // 附加模糊匹配建议到返回值
      const fuzzy = alternatives.filter((a) =>
        a.toLowerCase().includes(functionName.toLowerCase())
      );
      if (fuzzy.length > 0) {
        return { name: functionName, startLine: -1, endLine: -1, alternatives: fuzzy };
      }
    }

    return found;
  }

  listFunctionNames(code: string): string[] {
    let ast;
    try {
      ast = parse(code, { sourceType: "unambiguous", plugins: BABEL_PLUGINS });
    } catch {
      return [];
    }

    const names: string[] = [];
    traverse(ast, {
      FunctionDeclaration(path: any) {
        if (path.node.id?.name) names.push(path.node.id.name);
      },
      ClassMethod(path: any) {
        const name: string | undefined = (path.node.key as any)?.name;
        if (name) names.push(name);
      },
      VariableDeclarator(path: any) {
        const init = path.node.init;
        if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
          const name: string | undefined = (path.node.id as any)?.name;
          if (name) names.push(name);
        }
      },
    });
    return names;
  }
}

function shouldPreserveFunction(
  funcName: string | undefined,
  focusFunction: string | undefined
): boolean {
  if (!funcName) return false;
  if (focusFunction && funcName === focusFunction) return true;
  return false;
}

function replaceBodyWithOmission(node: any): void {
  if (node.body?.type === "BlockStatement") {
    node.body.body = [
      {
        type: "ExpressionStatement",
        expression: { type: "StringLiteral", value: OMIT_MARKER },
      },
    ];
  }
}

function truncateToMaxLines(code: string, maxLines: number): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return lines.slice(0, maxLines).join("\n") + `\n// ... [truncated at ${maxLines} lines by ContextGC]`;
}
