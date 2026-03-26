import fs from "node:fs/promises";
import path from "node:path";
import type { RuleIndex } from "./types.js";

export interface FrameworkContext {
  taskDir: string;
  currentRound: number;
  maxRounds: number;
  ruleFiles: RuleIndex;
}

export class ContextInjector {
  constructor(private taskDir: string) {}

  async buildFrameworkPrompt(params: FrameworkContext): Promise<string> {
    const { taskDir, currentRound, maxRounds, ruleFiles } = params;

    // Load rule file for current round
    const ruleKey = currentRound % 2 === 0 ? "even" : "odd";
    const defaultRule = ruleFiles[ruleKey] || ruleFiles["default"] || "rules/default.md";
    const ruleFilePath = path.join(taskDir, defaultRule);

    let ruleContent = "";
    try {
      ruleContent = await fs.readFile(ruleFilePath, "utf-8");
    } catch {
      ruleContent = "(No specific rule file found)";
    }

    // Load constitution
    const constitutionPath = path.join(taskDir, "RULE.md");
    let constitutionContent = "";
    try {
      constitutionContent = await fs.readFile(constitutionPath, "utf-8");
    } catch {
      constitutionContent = "(No constitution found)";
    }

    return `## Framework Agreement

**Working Directory**: ${taskDir}
**Current Round**: ${currentRound} of ${maxRounds}

**Required Reading**:
- \`RULE.md\` — Constitution
- \`${defaultRule}\` — Round-specific rules

**Deliverables Directory**: \`output/\` (any operations allowed)

**Prohibited Operations**:
- Modify \`RULE.md\`, \`ralph-loop.config\`, or \`.ralph-loop.*\` files

**Constitution**:
${constitutionContent}

**Round Rules**:
${ruleContent}`;
  }

  async getRequiredFiles(): Promise<string[]> {
    return ["RULE.md", "ralph-loop.config"];
  }
}
