import { describe, expect, it, vi } from "vitest";
import { captureCheckArtifacts } from "../src/artifactCapture.js";

describe("debug artifact capture", () => {
  it("captures debug screenshot and HTML once and reuses its path for availability", async () => {
    const write = vi.fn().mockResolvedValue("screenshots/debug.png");
    await expect(captureCheckArtifacts({
      status: "AVAILABLE",
      screenshotMatches: true,
      debugArtifactsEnabled: true,
      availabilityScreenshotRequested: false
    }, write)).resolves.toEqual({
      debugArtifactPath: "screenshots/debug.png",
      screenshotPath: "screenshots/debug.png"
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("debug", true);
  });

  it("captures artifacts before the caller performs cleanup", async () => {
    const events: string[] = [];
    const artifacts = await captureCheckArtifacts({
      status: "NOT_AVAILABLE",
      screenshotMatches: false,
      debugArtifactsEnabled: true,
      availabilityScreenshotRequested: false
    }, async () => { events.push("capture"); return "screenshots/debug.png"; });
    events.push("cleanup");
    expect(artifacts.debugArtifactPath).toBe("screenshots/debug.png");
    expect(events).toEqual(["capture", "cleanup"]);
  });

  it("never requests a second availability screenshot after debug capture", async () => {
    let pageOpen = true;
    const write = vi.fn(async () => {
      expect(pageOpen).toBe(true);
      return "screenshots/debug.png";
    });
    await captureCheckArtifacts({
      status: "AVAILABLE",
      screenshotMatches: true,
      debugArtifactsEnabled: true,
      availabilityScreenshotRequested: true
    }, write);
    pageOpen = false;
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("uses the dedicated availability screenshot outside debug mode", async () => {
    const write = vi.fn().mockResolvedValue("screenshots/appointment-found.png");
    const result = await captureCheckArtifacts({
      status: "AVAILABLE",
      screenshotMatches: true,
      debugArtifactsEnabled: false,
      availabilityScreenshotRequested: true
    }, write);
    expect(result.screenshotPath).toBe("screenshots/appointment-found.png");
    expect(write).toHaveBeenCalledWith("appointment-found", false);
  });
});
