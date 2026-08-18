import { readFile } from "node:fs/promises";
import { parseDateOnly } from "../dateFilter.js";
import {
  isAppointmentServiceId,
  type AppointmentServiceId
} from "../appointmentServices.js";
import type { AppointmentAvailability, CheckResult } from "../types.js";
import type { TimelineStateStore } from "./TimelineSimulator.js";

export interface SimulationRound {
  services: Partial<Record<AppointmentServiceId, readonly AppointmentAvailability[]>>;
}

export interface SimulationScenario {
  rounds: readonly SimulationRound[];
}

function object(value: unknown, identity: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${identity} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function parseSimulationScenario(value: unknown): SimulationScenario {
  const root = object(value, "Simulation scenario");
  if (!Array.isArray(root.rounds)) throw new Error("Simulation scenario rounds must be an array");
  if (root.rounds.length === 0) throw new Error("Simulation scenario must contain at least one round");
  return {
    rounds: root.rounds.map((rawRound, roundIndex) => {
      const round = object(rawRound, `Simulation round ${roundIndex + 1}`);
      const rawServices = object(round.services, `Simulation round ${roundIndex + 1} services`);
      const services: Partial<Record<AppointmentServiceId, readonly AppointmentAvailability[]>> = {};
      for (const [serviceId, rawDates] of Object.entries(rawServices)) {
        if (!isAppointmentServiceId(serviceId)) {
          throw new Error(`Simulation round ${roundIndex + 1} has unsupported service "${serviceId}"`);
        }
        if (!Array.isArray(rawDates)) {
          throw new Error(`Simulation round ${roundIndex + 1} service "${serviceId}" dates must be an array`);
        }
        const dates = rawDates.map((rawDate, dateIndex): AppointmentAvailability => {
          const item = typeof rawDate === "string" ? { date: rawDate } : object(rawDate, `Simulation round ${roundIndex + 1} service "${serviceId}" availability ${dateIndex}`);
          if (typeof item.date !== "string" || !parseDateOnly(item.date)) {
            throw new Error(`Simulation round ${roundIndex + 1} service "${serviceId}" has invalid date at index ${dateIndex}`);
          }
          if ("location" in item && item.location !== undefined && (typeof item.location !== "string" || !item.location.trim())) {
            throw new Error(`Simulation round ${roundIndex + 1} service "${serviceId}" has invalid location at index ${dateIndex}`);
          }
          return { date: item.date, ...(typeof item.location === "string" ? { location: item.location.trim() } : {}) };
        });
        services[serviceId] = dates.filter((item, index, all) => all.findIndex(candidate => candidate.date === item.date && candidate.location === item.location) === index)
          .sort((a, b) => a.date.localeCompare(b.date) || (a.location ?? "").localeCompare(b.location ?? ""));
      }
      return { services };
    })
  };
}

export async function loadSimulationScenario(file: string): Promise<SimulationScenario> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Simulation scenario file not found: ${file}`);
    }
    throw error;
  }
  try {
    return parseSimulationScenario(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Simulation scenario is not valid JSON: ${file}`);
    throw error;
  }
}

export interface SimulationRoundSession {
  roundNumber: number;
  getAvailability(serviceId: AppointmentServiceId): CheckResult;
  complete(): Promise<void>;
}

export class ScenarioSimulator {
  constructor(
    private readonly scenario: SimulationScenario,
    private readonly repeat: boolean,
    private readonly store: TimelineStateStore
  ) {}

  async beginRound(): Promise<SimulationRoundSession> {
    const state = await this.store.load();
    const roundIndex = Math.min(state.nextIndex, this.scenario.rounds.length - 1);
    const round = this.scenario.rounds[roundIndex]!;
    let completed = false;
    return {
      roundNumber: state.totalChecks + 1,
      getAvailability: serviceId => {
        // Omitted services are explicitly treated as unavailable.
        const availabilities = [...(round.services[serviceId] ?? [])];
        const appointmentDates = [...new Set(availabilities.map(item => item.date))].sort();
        return {
          status: appointmentDates.length > 0 ? "AVAILABLE" : "NOT_AVAILABLE",
          reason: `Simulation scenario round ${roundIndex + 1}`,
          appointmentDates,
          availabilities
        };
      },
      complete: async () => {
        if (completed) return;
        completed = true;
        const nextIndex = this.repeat
          ? (roundIndex + 1) % this.scenario.rounds.length
          : Math.min(roundIndex + 1, this.scenario.rounds.length - 1);
        await this.store.save({ nextIndex, totalChecks: state.totalChecks + 1 });
      }
    };
  }
}
