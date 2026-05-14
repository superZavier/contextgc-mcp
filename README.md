# ContextGC

> 基于 AST 解析的上下文智能压缩 MCP 插件 — **节省 70-90% token**

ContextGC 利用 AST 语法树提取代码骨架（imports、类型定义、函数签名），省略实现细节。这是**唯一**支持渐进式上下文加载的 MCP 工具：骨架 → 按需展开函数 → 完整代码。

## 工作原理

```
┌──────────────────────────────────────────────────┐
│  2000 行 React 组件 (≈18,000 tokens)              │
│                                                    │
│  ┌─ read_code_skeleton ──────────────────────────┐ │
│  │  imports + 类型 + 函数签名 (≈2,000 tokens)     │ │
│  │  函数体替换为省略标记                           │ │
│  └────────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ read_function_body ──────────────────────────┐ │
│  │  按需展开指定函数实现 (≈500 tokens)             │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## 功能

- **`read_code_skeleton`** — 提取源文件结构骨架，减少 70-90% token 用量
- **`read_function_body`** — 按需展开指定函数的完整实现
- **`parse_error_log`** — 压缩错误日志，过滤 node_modules 栈帧
- **`context_gc`** — 垃圾回收缓存骨架，释放上下文窗口空间
- **MCP Prompt 注入** — 自动引导 AI 使用 ContextGC 替代原生 `read_file`
- **三级降级** — AST 解析 → 正则降级 → 截断兜底
- **LRU + TTL 缓存** — 骨架缓存随文件变更自动失效

## 快速开始

### 安装与运行

```bash
# 克隆
git clone https://github.com/YOUR_USERNAME/contextgc-mcp.git
cd contextgc-mcp

# 安装依赖
npm install

# 构建
npm run build

# 运行
node dist/index.js
```

### 配置 Claude Code

```bash
claude mcp add contextgc -- node /path/to/contextgc-mcp/dist/index.js
```

### 配置 Kilo Code / Cursor / Cline

在 MCP 设置中添加：

```json
{
  "mcpServers": {
    "contextgc": {
      "command": "node",
      "args": ["/path/to/contextgc-mcp/dist/index.js"]
    }
  }
}
```

## 工具参考

### `read_code_skeleton`

读取源文件并返回结构骨架。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | ✅ | 源文件绝对路径 |
| `focusFunction` | string | ❌ | 保留此函数的完整实现 |
| `focusLine` | number | ❌ | 保留此行所在函数的完整实现 |
| `maxOutputLines` | number | ❌ | 最大输出行数（默认 500） |

### `read_function_body`

展开指定函数的完整实现。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | ✅ | 源文件绝对路径 |
| `functionName` | string | ✅ | 要展开的函数名 |
| `includeContext` | boolean | ❌ | 包含前后 5 行上下文（默认 true） |

### `parse_error_log`

压缩错误日志，提取关键信息，过滤噪音。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `logContent` | string | ✅ | 原始错误日志 / stderr 输出 |
| `workspaceRoot` | string | ❌ | 工作区根路径，用于识别业务代码 |
| `maxFrames` | number | ❌ | 最大保留堆栈帧数（默认 10） |

### `context_gc`

清除缓存骨架，释放上下文空间。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `strategy` | `"lru"` \| `"all"` \| `"older-than"` | ❌ | GC 策略（默认 `lru`） |
| `ttlMinutes` | number | ❌ | `older-than` 策略的过期分钟数（默认 30） |

## 配置

在工作区根目录创建 `contextgc.config.json`：

```json
{
  "skeleton": {
    "preserveComments": "doc",
    "preserveTypes": true,
    "maxOutputLines": 500
  },
  "cache": {
    "maxEntries": 100,
    "ttlMs": 1800000
  },
  "logTrimmer": {
    "maxFrames": 10,
    "filterPatterns": ["node_modules", "dist", ".next"]
  }
}
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CONTEXTGC_CONFIG` | 自定义配置文件路径 | 自动搜索 |
| `CONTEXTGC_ENABLED` | 全局开关 | `true` |
| `CONTEXTGC_LOG_LEVEL` | 日志级别（`debug`/`info`/`warn`/`error`） | `warn` |

## 支持的语言

| 语言 | 解析器 | 状态 |
|------|--------|------|
| JavaScript / JSX | Babel | ✅ 完整支持 |
| TypeScript / TSX | Babel | ✅ 完整支持 |
| Python / Go / Rust / Java / C++ | 正则降级 | ⚠️ 基础支持 |
| 其他语言 | 正则降级 | ⚠️ 基础支持 |

> Tree-sitter 集成（完整多语言 AST 支持）计划在 v0.2 实现。

## 架构

```
AI 编码助手 (宿主)
        │ MCP (JSON-RPC 2.0 over stdio)
        ▼
┌─────────────────────────────────┐
│       ContextGC MCP Server       │
│  ┌───────────────────────────┐  │
│  │      MCP 协议层            │  │
│  └─────────┬─────────────────┘  │
│  ┌─────────▼─────────────────┐  │
│  │     工具编排层              │  │
│  │  骨架 | 展开函数 | 日志 | GC│  │
│  └─────────┬─────────────────┘  │
│  ┌─────────▼─────────────────┐  │
│  │     解析器抽象层            │  │
│  │  Babel | Tree-sitter | 正则 │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 监听模式运行测试
npm run test:watch

# 开发模式（自动重编译）
npm run dev
```

## Token 节省基准

| 场景 | 原始 | 压缩后 | 压缩率 |
|------|------|--------|--------|
| 2000 行 React 组件（骨架提取） | ~18,000 tok | ~2,000 tok | **89%** |
| 1000 行 npm build 报错日志 | ~8,000 tok | ~400 tok | **95%** |
| 500 行 diff 输出 | ~5,000 tok | ~1,500 tok | **70%** |
| 综合大型项目调试会话 | ~80,000 tok | ~15,000 tok | **81%** |

> 以上为理论估算值，实际压缩率取决于代码风格和文件结构。

## 与同类方案对比

| 特性 | ContextGC | lean-ctx | SigMap |
|------|-----------|----------|--------|
| **核心技术** | AST 语义骨架 | 缓存 + 压缩 | 知识图谱 |
| **渐进式加载** | ✅ 骨架 → 展开 → 完整 | ❌ 一次性压缩 | ❌ 一次性 |
| **日志压缩** | ✅ | ✅ | ❌ |
| **语义保留** | ✅ 函数签名 + 类型 | ⚠️ 文本压缩 | ✅ 图谱关系 |
| **外部依赖** | 仅 Babel | 低 | ChromaDB |
| **安装复杂度** | 低 | 低 | 中 |

## 许可证

MIT
