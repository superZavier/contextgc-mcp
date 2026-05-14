// ContextGC — 解析器工厂：按语言自动选择最佳解析器

import type { IParser } from "./interface.js";
import { BabelParser } from "./babel_parser.js";
import { RegexFallbackParser } from "./regex_fallback.js";
import { detectLanguage, isBabelSupported } from "../utils/language_detect.js";

export class ParserFactory {
  private babelParser: BabelParser;
  private fallbackParser: RegexFallbackParser;

  constructor() {
    this.babelParser = new BabelParser();
    this.fallbackParser = new RegexFallbackParser();
  }

  getParser(filePath: string): IParser {
    const lang = detectLanguage(filePath);
    if (isBabelSupported(lang)) {
      return this.babelParser;
    }
    return this.fallbackParser;
  }

  getBabelParser(): BabelParser {
    return this.babelParser;
  }

  getFallbackParser(): RegexFallbackParser {
    return this.fallbackParser;
  }
}
