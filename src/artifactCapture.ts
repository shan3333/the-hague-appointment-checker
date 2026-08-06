import type { AppointmentStatus } from "./types.js";

export interface ArtifactCaptureOptions {
  status: AppointmentStatus;
  screenshotMatches: boolean;
  debugArtifactsEnabled: boolean;
  availabilityScreenshotRequested: boolean;
}

export interface CapturedArtifacts {
  debugArtifactPath?: string;
  screenshotPath?: string;
}

export type ArtifactWriter = (prefix: "debug" | "appointment-found", includeHtml: boolean) => Promise<string | undefined>;

export async function captureCheckArtifacts(
  options: ArtifactCaptureOptions,
  writeArtifact: ArtifactWriter
): Promise<CapturedArtifacts> {
  const availableMatch = options.status === "AVAILABLE" && options.screenshotMatches;
  if (options.debugArtifactsEnabled) {
    const debugArtifactPath = await writeArtifact("debug", true);
    return {
      debugArtifactPath,
      screenshotPath: availableMatch ? debugArtifactPath : undefined
    };
  }
  if (availableMatch && options.availabilityScreenshotRequested) {
    return { screenshotPath: await writeArtifact("appointment-found", false) };
  }
  return {};
}
