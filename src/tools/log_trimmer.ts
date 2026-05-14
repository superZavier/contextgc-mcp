// ContextGC — 日志精简工具

export interface LogTrimResult {
  summary: string;
  stats: { originalLines: number; summaryLines: number };
}

export function trimErrorLog(
  log: string,
  workspaceRoot?: string,
  maxFrames: number = 10
): LogTrimResult {
  const lines = log.split("\n");
  const originalLines = lines.length;

  // 1. 提取错误类型和消息
  const errorPattern = /^(\w*Error|\w*Exception|FATAL|PANIC)[:\s]+(.*)$/;
  const errorMatches: Array<{ type: string; message: string; line: number }> = [];
  lines.forEach((line, i) => {
    const match = line.match(errorPattern);
    if (match) errorMatches.push({ type: match[1], message: match[2], line: i });
  });

  // 2. 提取堆栈帧，过滤噪音
  const framePattern = /^\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/;
  const alternativeFramePattern = /^\s+at\s+(.+?)$/;
  const nodeModulesPattern = /node_modules/;
  const workspacePattern = workspaceRoot
    ? new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : /\/src\//;

  const businessFrames: string[] = [];
  let totalFrames = 0;

  for (const line of lines) {
    const match = line.match(framePattern);
    if (match) {
      totalFrames++;
      const [, func, file] = match;
      if (!nodeModulesPattern.test(file)) {
        businessFrames.push(line.trim());
      }
      continue;
    }
    const altMatch = line.match(alternativeFramePattern);
    if (altMatch) {
      totalFrames++;
      businessFrames.push(line.trim());
    }
  }

  // 3. 组装摘要
  const parts: string[] = [];

  if (errorMatches.length > 0) {
    const primary = errorMatches[0];
    parts.push(`[${primary.type}] ${primary.message}`);
    if (errorMatches.length > 1) {
      const secondary = errorMatches[1];
      parts.push(`Caused by: [${secondary.type}] ${secondary.message}`);
    }
  }

  if (businessFrames.length > 0) {
    parts.push("\nRelevant stack frames:");
    businessFrames.slice(0, maxFrames).forEach((f) => parts.push(`  ${f}`));
  }

  // 4. 添加尾部摘要
  const omittedFrames = totalFrames - Math.min(businessFrames.length, maxFrames);
  if (omittedFrames > 0) {
    parts.push(`  ... ${omittedFrames} frames omitted`);
  }

  // 如果没有提取到任何有用信息，返回截断的原始日志
  if (parts.length === 0) {
    const maxLogLines = 50;
    const truncated = lines.slice(0, maxLogLines).join("\n");
    return {
      summary: truncated + (lines.length > maxLogLines ? `\n... [${lines.length - maxLogLines} more lines omitted by ContextGC]` : ""),
      stats: { originalLines, summaryLines: Math.min(lines.length, maxLogLines) },
    };
  }

  const summary = parts.join("\n");
  return {
    summary,
    stats: {
      originalLines,
      summaryLines: summary.split("\n").length,
    },
  };
}
