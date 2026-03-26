import fs from "node:fs/promises";
import path from "node:path";
import { LoopState, LoopConfig, LoopStatus } from "./types.js";

const STATE_FILENAME = ".ralph-loop.state";

export class LoopStateManager {
  constructor(private taskDir: string) {}

  private statePath(): string {
    return path.join(this.taskDir, STATE_FILENAME);
  }

  async load(): Promise<LoopState | null> {
    try {
      const content = await fs.readFile(this.statePath(), "utf-8");
      return JSON.parse(content) as LoopState;
    } catch {
      return null;
    }
  }

  async save(state: LoopState): Promise<void> {
    const tmpPath = `${this.statePath()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    await fs.rename(tmpPath, this.statePath());
  }

  async update(updates: Partial<LoopState>): Promise<LoopState> {
    const current = await this.load();
    if (!current) {
      throw new Error("State not found");
    }
    const updated = { ...current, ...updates };
    await this.save(updated);
    return updated;
  }

  async create(taskId: string, config: LoopConfig): Promise<LoopState> {
    const state: LoopState = {
      taskId,
      round: 0,
      status: "idle",
      config,
    };
    await this.save(state);
    return state;
  }

  async setStatus(status: LoopStatus): Promise<void> {
    await this.update({ status });
  }

  async incrementRound(): Promise<number> {
    const state = await this.load();
    if (!state) throw new Error("State not found");
    const newRound = state.round + 1;
    await this.update({ round: newRound, status: "waiting" });
    return newRound;
  }

  async isComplete(): Promise<boolean> {
    const state = await this.load();
    if (!state) throw new Error("State not found");
    return state.round >= state.config.maxRounds;
  }
}
