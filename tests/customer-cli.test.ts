import { describe, expect, it } from "vitest";
import { parseCustomerCliOptions } from "../src/customers/CustomerCli.js";

describe("multi-customer CLI activation", () => {
  it("enables customer mode explicitly", () => {
    expect(parseCustomerCliOptions(["--customers"])).toEqual({ customersMode: true, dateFilter: undefined });
  });

  it("preserves existing single-user CLI filtering", () => {
    expect(parseCustomerCliOptions(["--within", "1m"])).toMatchObject({
      customersMode: false,
      dateFilter: { kind: "within", source: "1m" }
    });
  });

  it("rejects customer mode combined with a CLI date filter", () => {
    expect(() => parseCustomerCliOptions(["--customers", "--before", "2026-09-01"]))
      .toThrow("--customers cannot be combined");
  });
});
