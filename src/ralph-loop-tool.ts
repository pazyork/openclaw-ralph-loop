import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../api.js";
import { ContextInjector } from "./context-injector.js";
import { LockManager } from "./lock.js";
import { LoopStateManager } from "./state.js";
import type { LoopConfig } from "./types.js";

type RalphLoopPluginConfig = {
  defaultMinRounds?: number;
  defaultMaxRounds?: number;
  pushInterval?: number;
  tickIntervalMs?: number;
};

// Active loops registry (in-memory)
const activeLoops = new Map<string, NodeJS.Timeout>();

function getLoopsBaseDir(): string {
  return path.join(os.homedir(), ".openclaw", "loops");
}

function getTaskDir(taskId: string): string {
  return path.join(getLoopsBaseDir(), taskId);
}

export function createRalphLoopTool(api: OpenClawPluginApi) {
  return {
    name: "ralph-loop",
    label: "RALPH-LOOP",
    description:
      "Manage long-running tasks with round-based context isolation. Use start to begin a loop, stop to halt it, or status to check progress.",

    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("start"),
        Type.Literal("stop"),
        Type.Literal("status"),
        Type.Literal("progress"),
      ], {
        description: "Action to perform",
      }),
      taskId: Type.Optional(Type.String({ description: "Task ID (required for stop/status/progress)" })),
      taskDescription: Type.Optional(Type.String({ description: "Task description (for start)" })),
      minRounds: Type.Optional(Type.Number({ description: "Minimum rounds (default: 3)" })),
      maxRounds: Type.Optional(Type.Number({ description: "Maximum rounds (default: 10)" })),
      pushEvery: Type.Optional(
        Type.Number({ description: "Push progress every N rounds (default: 1)" }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const action = params.action as string;
      const pluginConfig = (api.pluginConfig ?? {}) as RalphLoopPluginConfig;

      switch (action) {
        case "start":
          return handleStart(api, params, pluginConfig);
        case "stop":
          return handleStop(api, params);
        case "status":
          return handleStatus(api, params);
        case "progress":
          return handleProgress(api, params);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}

async function handleStart(
  api: OpenClawPluginApi,
  params: Record<string, unknown>,
  pluginConfig: RalphLoopPluginConfig,
) {
  const taskDescription = params.taskDescription as string;
  if (!taskDescription) {
    throw new Error("taskDescription is required for start action");
  }

  const minRounds = (params.minRounds as number) ?? pluginConfig.defaultMinRounds ?? 3;
  const maxRounds = (params.maxRounds as number) ?? pluginConfig.defaultMaxRounds ?? 10;
  const pushEvery = (params.pushEvery as number) ?? pluginConfig.pushInterval ?? 1;
  const tickIntervalMs = pluginConfig.tickIntervalMs ?? 5000;

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const taskDir = getTaskDir(taskId);

  // Create task directory
  await fs.mkdir(taskDir, { recursive: true });
  await fs.mkdir(path.join(taskDir, "output"), { recursive: true });
  await fs.mkdir(path.join(taskDir, "rules"), { recursive: true });

  // Create default config
  const config: LoopConfig = { minRounds, maxRounds, pushEvery };
  await fs.writeFile(
    path.join(taskDir, "ralph-loop.config"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );

  // Initialize state
  const stateManager = new LoopStateManager(taskDir);
  await stateManager.create(taskId, config);

  // Create default rules
  await fs.writeFile(
    path.join(taskDir, "rules", "default.md"),
    "# Default Rules\n\nExecute the assigned task.",
    "utf-8",
  );
  await fs.writeFile(
    path.join(taskDir, "rules", "even.md"),
    "# Even Round Rules - Divergent\n\nThis round is for creative thinking and exploration.",
    "utf-8",
  );
  await fs.writeFile(
    path.join(taskDir, "rules", "odd.md"),
    "# Odd Round Rules - Critical\n\nThis round is for critical analysis and reflection.",
    "utf-8",
  );

  // Create initial RULE.md
  await fs.writeFile(
    path.join(taskDir, "RULE.md"),
    `# Constitution

## Task
${taskDescription}

## Constraints
(To be filled through guided dialogue)

## Rule Index
- Default: rules/default.md
- Even Rounds: rules/even.md
- Odd Rounds: rules/odd.md
`,
    "utf-8",
  );

  // Start the loop
  startLoop(api, taskId, taskDir, tickIntervalMs);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId,
          taskDir,
          message: `RALPH-LOOP started. Task ID: ${taskId}`,
        }),
      },
    ],
  };
}

async function handleStop(api: OpenClawPluginApi, params: Record<string, unknown>) {
  const taskId = params.taskId as string;
  if (!taskId) {
    throw new Error("taskId is required for stop action");
  }

  const interval = activeLoops.get(taskId);
  if (interval) {
    clearInterval(interval);
    activeLoops.delete(taskId);
  }

  const taskDir = getTaskDir(taskId);
  const stateManager = new LoopStateManager(taskDir);
  const state = await stateManager.load();

  if (state) {
    await stateManager.update({ status: "stopped" });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId,
          message: `RALPH-LOOP stopped for task ${taskId}`,
        }),
      },
    ],
  };
}

async function handleStatus(api: OpenClawPluginApi, params: Record<string, unknown>) {
  const taskId = params.taskId as string;
  if (!taskId) {
    throw new Error("taskId is required for status action");
  }

  const taskDir = getTaskDir(taskId);
  const stateManager = new LoopStateManager(taskDir);
  const state = await stateManager.load();

  if (!state) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            taskId,
            message: `Task ${taskId} not found`,
          }),
        },
      ],
    };
  }

  const lockManager = new LockManager(taskDir);
  const isLocked = await lockManager.isLocked();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId,
          round: state.round,
          status: state.status,
          config: state.config,
          isRunning: isLocked,
        }),
      },
    ],
  };
}

async function handleProgress(api: OpenClawPluginApi, params: Record<string, unknown>) {
  const taskId = params.taskId as string;
  if (!taskId) {
    throw new Error("taskId is required for progress action");
  }

  const taskDir = getTaskDir(taskId);
  const progressFile = path.join(taskDir, ".ralph-loop.progress");

  try {
    const content = await fs.readFile(progressFile, "utf-8");
    const progress = JSON.parse(content);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            taskId,
            ...progress,
          }),
        },
      ],
    };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            taskId,
            message: "No progress information available",
          }),
        },
      ],
    };
  }
}

function startLoop(
  api: OpenClawPluginApi,
  taskId: string,
  taskDir: string,
  tickIntervalMs: number,
) {
  const stateManager = new LoopStateManager(taskDir);
  const lockManager = new LockManager(taskDir);
  const contextInjector = new ContextInjector(taskDir);

  const interval = setInterval(async () => {
    try {
      const state = await stateManager.load();
      if (!state || state.status === "done" || state.status === "stopped") {
        clearInterval(interval);
        activeLoops.delete(taskId);
        return;
      }

      // Check if already running
      if (await lockManager.isLocked()) {
        return;
      }

      // Increment round and acquire lock
      const newRound = await stateManager.incrementRound();
      const acquired = await lockManager.acquire(newRound);

      if (!acquired) {
        // Another process got the lock, revert round increment
        await stateManager.update({ round: newRound - 1 });
        return;
      }

      // Update status to running
      await stateManager.update({ status: "running" });
      await notifyProgress(api, taskId, newRound, `RALPH-LOOP starting round ${newRound}...`);

      try {
        // Build context and run agent
        const frameworkPrompt = await contextInjector.buildFrameworkPrompt({
          taskDir,
          currentRound: newRound,
          maxRounds: state.config.maxRounds,
          ruleFiles: {
            default: "rules/default.md",
            even: "rules/even.md",
            odd: "rules/odd.md",
          },
        });

        // Run the agent for this round
        await runRound(api, taskId, taskDir, newRound, frameworkPrompt);

        // Check if done
        if (newRound >= state.config.maxRounds) {
          await stateManager.update({ status: "done" });
          clearInterval(interval);
          activeLoops.delete(taskId);
          await notifyProgress(api, taskId, newRound, "RALPH-LOOP completed all rounds");
        } else {
          // Push progress if needed
          if (newRound % state.config.pushEvery === 0) {
            await notifyProgress(api, taskId, newRound, `RALPH-LOOP completed round ${newRound}`);
          }
          // Reset to waiting for next round
          await stateManager.update({ status: "waiting" });
        }
      } catch (roundError) {
        api.logger.error(`[ralph-loop] Round ${newRound} failed: ${roundError}`);
        await stateManager.update({ status: "waiting" });
        await notifyProgress(api, taskId, newRound, `RALPH-LOOP round ${newRound} encountered an error`);
      } finally {
        // Release lock
        await lockManager.release();
      }
    } catch (error) {
      api.logger.error(`[ralph-loop] Loop error for ${taskId}: ${error}`);
      // Don't clear the interval on error, let it retry
    }
  }, tickIntervalMs);

  activeLoops.set(taskId, interval);
}

async function runRound(
  api: OpenClawPluginApi,
  taskId: string,
  taskDir: string,
  round: number,
  frameworkPrompt: string,
) {
  const sessionId = `ralph-loop-${taskId}-round-${round}`;
  const sessionFile = path.join(taskDir, `.ralph-loop.session-${round}.json`);

  try {
    const result = await api.runtime.agent.runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir: taskDir,
      config: api.config,
      prompt: frameworkPrompt,
      timeoutMs: 30 * 60 * 1000, // 30 minutes per round
      runId: `ralph-loop-${Date.now()}`,
      disableTools: false,
    });

    return result;
  } catch (error) {
    api.logger.error(`[ralph-loop] Round ${round} failed: ${error}`);
    throw error;
  }
}

async function notifyProgress(
  api: OpenClawPluginApi,
  taskId: string,
  round: number,
  message: string,
) {
  // Write progress to a file that can be queried
  const taskDir = getTaskDir(taskId);
  const progressFile = path.join(taskDir, ".ralph-loop.progress");

  try {
    const progress = {
      taskId,
      round,
      message,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(progressFile, JSON.stringify(progress, null, 2), "utf-8");
    api.logger.info(`[ralph-loop] ${message}`);
  } catch (error) {
    api.logger.error(`[ralph-loop] Failed to write progress: ${error}`);
  }
}
