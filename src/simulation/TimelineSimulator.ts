import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppointmentStatus } from "../types.js";

export type SimulatedStatus = Extract<AppointmentStatus, "AVAILABLE" | "NOT_AVAILABLE">;

export interface TimelineState {
  nextIndex: number;
  totalChecks: number;
}

export interface TimelineStateStore {
  load(): Promise<TimelineState>;
  save(state: TimelineState): Promise<void>;
  reset(): Promise<void>;
}

const initialTimelineState: TimelineState = { nextIndex: 0, totalChecks: 0 };

export class FileTimelineStateStore implements TimelineStateStore {
  constructor(private readonly file: string) {}

  async load(): Promise<TimelineState> {
    try {
      const stored = JSON.parse(await readFile(this.file, "utf8")) as Partial<TimelineState>;
      return {
        nextIndex: Number.isInteger(stored.nextIndex) && (stored.nextIndex ?? -1) >= 0 ? stored.nextIndex! : 0,
        totalChecks: Number.isInteger(stored.totalChecks) && (stored.totalChecks ?? -1) >= 0 ? stored.totalChecks! : 0
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...initialTimelineState };
      throw error;
    }
  }

  async save(state: TimelineState): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, this.file);
  }

  async reset(): Promise<void> {
    await this.save({ ...initialTimelineState });
  }
}
