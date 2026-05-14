// ContextGC — 配置加载器

import fs from "node:fs";
import path from "node:path";
import type { ContextGCConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "./schema.js";

function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal) && tgtVal && typeof tgtVal === "object" && !Array.isArray(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

export class ConfigManager {
  static load(): ContextGCConfig {
    const configPaths = [
      process.env.CONTEXTGC_CONFIG,
      path.join(process.cwd(), "contextgc.config.json"),
      path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".contextgc", "config.json"),
    ].filter(Boolean) as string[];

    let merged = { ...DEFAULT_CONFIG };

    for (const configPath of configPaths) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        const userConfig = JSON.parse(content);
        merged = deepMerge(merged, userConfig);
        break; // 使用第一个找到的配置文件
      } catch {
        // 文件不存在或格式错误，跳过
      }
    }

    // 环境变量覆盖
    if (process.env.CONTEXTGC_LOG_LEVEL) {
      merged.logLevel = process.env.CONTEXTGC_LOG_LEVEL;
    }
    if (process.env.CONTEXTGC_ENABLED === "false") {
      merged.enabled = false;
    }

    return merged;
  }
}
