// ContextGC — 配置 Schema 定义

export interface ContextGCConfig {
  parser: {
    maxFileSizeBytes: number;
    parseTimeoutMs: number;
  };
  skeleton: {
    preserveComments: "none" | "doc" | "all";
    preserveTypes: boolean;
    preserveImports: boolean;
    preserveExports: boolean;
    maxOutputLines: number;
  };
  cache: {
    maxEntries: number;
    maxTotalBytes: number;
    ttlMs: number;
  };
  logTrimmer: {
    maxFrames: number;
    filterPatterns: string[];
  };
  enabled: boolean;
  logLevel: string;
}

export const DEFAULT_CONFIG: ContextGCConfig = {
  parser: {
    maxFileSizeBytes: 1024 * 1024, // 1MB
    parseTimeoutMs: 5000,
  },
  skeleton: {
    preserveComments: "doc",
    preserveTypes: true,
    preserveImports: true,
    preserveExports: true,
    maxOutputLines: 500,
  },
  cache: {
    maxEntries: 100,
    maxTotalBytes: 10 * 1024 * 1024, // 10MB
    ttlMs: 30 * 60 * 1000, // 30min
  },
  logTrimmer: {
    maxFrames: 10,
    filterPatterns: ["node_modules", ".next", ".cache", "dist", "build"],
  },
  enabled: true,
  logLevel: "warn",
};
