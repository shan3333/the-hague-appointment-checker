import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../src/retry.js";

describe("retry behaviour", () => {
  it("allows at most two retries and backs off", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("one")).mockRejectedValueOnce(new Error("two")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRetry(operation, 2, 100, sleep)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("stops and rethrows after the configured retries are exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("still unavailable"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRetry(operation, 2, 100, sleep)).rejects.toThrow("still unavailable");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
