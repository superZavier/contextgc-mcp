// ContextGC — Token 估算工具

/**
 * 粗略估算文本的 token 数量
 * 基于经验公式：代码 1 token ≈ 3.5 字符
 */
export function estimateTokens(text: string): number {
  const codeChars = text.length;
  return Math.ceil(codeChars / 3.5);
}
