import { describe, it, expect } from "vitest";
import { BabelParser } from "../../src/parsers/babel_parser.js";
import type { SkeletonOptions } from "../../src/parsers/interface.js";

const SAMPLE_CODE = `import React, { useState, useEffect } from "react";
import { DataService } from "../services/DataService";
import type { User, UserProfile } from "../types";

interface DashboardProps {
  userId: string;
  onLogout: () => void;
}

interface DashboardState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export function useUserData(userId: string) {
  const [state, setState] = useState({ user: null, isLoading: true, error: null });

  useEffect(() => {
    const service = new DataService();
    service.getUser(userId).then((user) => {
      setState({ user, isLoading: false, error: null });
    }).catch((err) => {
      setState({ user: null, isLoading: false, error: err.message });
    });
  }, [userId]);

  return state;
}

export function formatUserName(user: User): string {
  if (user.firstName && user.lastName) {
    return user.firstName + " " + user.lastName;
  }
  return user.email;
}

export function validateUserSettings(settings: any): boolean {
  if (!settings) return false;
  if (typeof settings.theme !== "string") return false;
  if (typeof settings.notifications !== "boolean") return false;
  return true;
}

export class DashboardComponent extends React.Component<DashboardProps, DashboardState> {
  constructor(props: DashboardProps) {
    super(props);
    this.state = { user: null, isLoading: true, error: null };
  }

  componentDidMount() {
    this.fetchUserData();
  }

  componentDidUpdate(prevProps: DashboardProps) {
    if (prevProps.userId !== this.props.userId) {
      this.fetchUserData();
    }
  }

  private async fetchUserData() {
    try {
      const service = new DataService();
      const user = await service.getUser(this.props.userId);
      this.setState({ user, isLoading: false, error: null });
    } catch (err) {
      this.setState({ user: null, isLoading: false, error: (err as Error).message });
    }
  }

  handleLogout() {
    this.props.onLogout();
  }

  render() {
    const { user, isLoading, error } = this.state;
    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;
    return <div>{formatUserName(user!)}</div>;
  }
}

export default DashboardComponent;
`;

describe("BabelParser", () => {
  const parser = new BabelParser();

  it("should support JS/TS/JSX/TSX languages", () => {
    const langs = parser.supportedLanguages();
    expect(langs).toContain("javascript");
    expect(langs).toContain("typescript");
    expect(langs).toContain("jsx");
    expect(langs).toContain("tsx");
  });

  it("should extract skeleton and reduce lines", () => {
    const result = parser.parse(SAMPLE_CODE, {});
    expect(result.stats.originalLines).toBeGreaterThan(0);
    expect(result.stats.skeletonLines).toBeLessThan(result.stats.originalLines);
    expect(result.stats.compressionRatio).toBeLessThan(1);
    expect(result.stats.parserUsed).toBe("babel");
  });

  it("should preserve import statements", () => {
    const result = parser.parse(SAMPLE_CODE, { preserveImports: true });
    expect(result.skeleton).toContain("import React");
    expect(result.skeleton).toContain("import { DataService }");
  });

  it("should replace function bodies with omission markers", () => {
    const result = parser.parse(SAMPLE_CODE, {});
    expect(result.skeleton).toContain("[omitted by ContextGC]");
    // Should NOT contain the full function body logic
    expect(result.skeleton).not.toContain("service.getUser(userId)");
  });

  it("should preserve focusFunction body", () => {
    const result = parser.parse(SAMPLE_CODE, { focusFunction: "formatUserName" });
    expect(result.stats.functionsPreserved).toBeGreaterThanOrEqual(1);
    // The focusFunction body should be intact
    expect(result.skeleton).toContain("user.firstName");
    expect(result.skeleton).toContain("user.lastName");
  });

  it("should preserve focusLine's containing function", () => {
    // formatUserName starts at line 21 in the sample (1-indexed)
    const result = parser.parse(SAMPLE_CODE, { focusLine: 22 });
    // focusLine should preserve the containing function's body
    expect(result.stats.functionsPreserved).toBeGreaterThanOrEqual(1);
  });

  it("should locate a function", () => {
    const loc = parser.locateFunction(SAMPLE_CODE, "formatUserName");
    expect(loc).not.toBeNull();
    expect(loc!.name).toBe("formatUserName");
    expect(loc!.startLine).toBeGreaterThan(0);
    expect(loc!.endLine).toBeGreaterThanOrEqual(loc!.startLine);
  });

  it("should return null for non-existent function", () => {
    const loc = parser.locateFunction(SAMPLE_CODE, "nonExistent");
    expect(loc).toBeNull();
  });

  it("should list function names", () => {
    const names = parser.listFunctionNames(SAMPLE_CODE);
    expect(names).toContain("useUserData");
    expect(names).toContain("formatUserName");
    expect(names).toContain("validateUserSettings");
    // Class methods are also listed
    expect(names).toContain("componentDidMount");
    expect(names).toContain("fetchUserData");
  });

  it("should handle syntax errors gracefully", () => {
    const brokenCode = `function foo( {`;
    expect(() => parser.parse(brokenCode, {})).toThrow();
  });

  it("should handle arrow function variable declarations", () => {
    const arrowCode = `const fn = () => { return 42; };\nconst add = (a: number, b: number): number => { return a + b; };\n`;
    const result = parser.parse(arrowCode, {});
    expect(result.skeleton).toContain("[omitted by ContextGC]");
  });

  it("should respect maxOutputLines", () => {
    const longCode = Array(100).fill("").map((_, i) => `function fn${i}() { return ${i}; }`).join("\n");
    const result = parser.parse(longCode, { maxOutputLines: 10 });
    expect(result.stats.skeletonLines).toBeLessThanOrEqual(12); // 10 + truncation notice
  });
});
