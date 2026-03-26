import fs from "node:fs/promises";
import path from "node:path";
import { LockFile } from "./types.js";

const LOCK_FILENAME = ".ralph-loop.lock";
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class LockManager {
  constructor(private taskDir: string) {}

  private lockPath(): string {
    return path.join(this.taskDir, LOCK_FILENAME);
  }

  async acquire(round: number): Promise<boolean> {
    const lockPath = this.lockPath();

    // Check if lock exists and is stale
    const existing = await this.getLock();
    if (existing) {
      const lockAge = Date.now() - new Date(existing.startedAt).getTime();
      if (lockAge < LOCK_TIMEOUT_MS) {
        // Lock is valid, another round is running
        return false;
      }
      // Lock is stale, force release
      await this.release();
    }

    const lock: LockFile = {
      pid: process.pid,
      round,
      startedAt: new Date().toISOString(),
    };

    const tmpPath = `${lockPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(lock, null, 2), "utf-8");
    try {
      await fs.rename(tmpPath, lockPath);
      return true;
    } catch {
      // Another process got the lock first
      return false;
    }
  }

  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockPath());
    } catch {
      // Ignore if lock doesn't exist
    }
  }

  async getLock(): Promise<LockFile | null> {
    try {
      const content = await fs.readFile(this.lockPath(), "utf-8");
      return JSON.parse(content) as LockFile;
    } catch {
      return null;
    }
  }

  async isLocked(): Promise<boolean> {
    const lock = await this.getLock();
    if (!lock) return false;
    const lockAge = Date.now() - new Date(lock.startedAt).getTime();
    return lockAge < LOCK_TIMEOUT_MS;
  }
}
