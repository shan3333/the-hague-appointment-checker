import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadCustomers,
  parseCustomers,
  resolveCustomersConfigPath
} from "../src/customers/CustomerConfig.js";

const valid = [
  { id: "customer-a", chatId: "chat-a", enabled: true, filter: { type: "before", date: "2026-09-01" }, expiresAt: "2026-09-07" },
  { id: "customer-b", chatId: "chat-b", enabled: false, filter: { type: "between", start: "2026-09-01", end: "2026-09-30" }, expiresAt: "2026-09-07" },
  { id: "customer-c", chatId: "chat-c", enabled: true, filter: { type: "within", value: "1m" }, expiresAt: "2026-09-07" }
];

describe("customer configuration", () => {
  it("loads and validates multiple customers from a file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-customers-"));
    const file = path.join(directory, "customers.json");
    await writeFile(file, JSON.stringify(valid), "utf8");
    const customers = await loadCustomers(file);
    expect(customers).toHaveLength(3);
    expect(customers.map(customer => customer.filter.kind)).toEqual(["before", "between", "within"]);
  });

  it("rejects duplicate IDs without exposing chat IDs", () => {
    const duplicated = [valid[0], { ...valid[0], chatId: "private-chat" }];
    expect(() => parseCustomers(duplicated)).toThrow("Duplicate customer id: customer-a");
    expect(() => parseCustomers(duplicated)).not.toThrow(/private-chat/);
  });

  it.each([
    [[{ ...valid[0], id: "" }], /id is required/],
    [[{ ...valid[0], chatId: "" }], /chatId is required/],
    [[{ ...valid[0], filter: { type: "unknown" } }], /unsupported filter type/],
    [[{ ...valid[0], filter: { type: "before", date: "not-a-date" } }], /invalid filter/],
    [[{ ...valid[0], expiresAt: "2026-02-30" }], /expiresAt/],
    [[{ ...valid[0], enabled: "yes" }], /enabled must be true or false/]
  ])("rejects malformed customer configuration", (input, expected) => {
    expect(() => parseCustomers(input)).toThrow(expected);
  });

  it("fails clearly when the customers file is missing", async () => {
    await expect(loadCustomers(path.join(tmpdir(), "missing-appointment-customers.json")))
      .rejects.toThrow("Customer configuration file not found. Create:");
  });
});

describe("mode-specific customer configuration selection", () => {
  const paths = {
    real: "/project/config/customers.json",
    simulation: "/project/config/customers.simulation.json"
  };

  it("selects customers.json for real --customers mode", () => {
    expect(resolveCustomersConfigPath("real", paths)).toBe(paths.real);
  });

  it("selects customers.simulation.json for simulation --customers mode", () => {
    expect(resolveCustomersConfigPath("simulation", paths)).toBe(paths.simulation);
  });

  it("simulation never falls back to an existing real customer file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-mode-config-"));
    const modePaths = {
      real: path.join(directory, "customers.json"),
      simulation: path.join(directory, "customers.simulation.json")
    };
    await writeFile(modePaths.real, JSON.stringify(valid), "utf8");
    const selected = resolveCustomersConfigPath("simulation", modePaths);
    await expect(loadCustomers(selected)).rejects.toThrow(`Create: ${modePaths.simulation}`);
  });

  it("real mode never falls back to an existing simulation customer file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-mode-config-"));
    const modePaths = {
      real: path.join(directory, "customers.json"),
      simulation: path.join(directory, "customers.simulation.json")
    };
    await writeFile(modePaths.simulation, JSON.stringify(valid), "utf8");
    const selected = resolveCustomersConfigPath("real", modePaths);
    await expect(loadCustomers(selected)).rejects.toThrow(`Create: ${modePaths.real}`);
  });

  it.each(["real", "simulation"] as const)("%s mode names its missing required file", async mode => {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-mode-missing-"));
    const modePaths = {
      real: path.join(directory, "customers.json"),
      simulation: path.join(directory, "customers.simulation.json")
    };
    const expected = modePaths[mode];
    await expect(loadCustomers(resolveCustomersConfigPath(mode, modePaths)))
      .rejects.toThrow(`Create: ${expected}`);
  });
});
