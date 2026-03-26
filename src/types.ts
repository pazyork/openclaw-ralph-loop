// Types for RALPH-LOOP plugin

export type LoopStatus = "idle" | "waiting" | "running" | "done" | "stopped";

export interface LoopConfig {
  minRounds: number;
  maxRounds: number;
  pushEvery: number;
}

export interface LoopState {
  taskId: string;
  round: number;
  status: LoopStatus;
  config: LoopConfig;
}

export interface LockFile {
  pid: number;
  round: number;
  startedAt: string;
}

export interface RuleIndex {
  default: string;
  [key: string]: string;
}
