import { describe, expect, it, vi } from "vitest";
import { NotificationService, type NotificationProviderSet } from "../src/notifications/NotificationService.js";
import type { NotificationProvider } from "../src/notifications/NotificationProvider.js";
import { MacNotifier } from "../src/notifications/MacNotifier.js";

class MacStub implements NotificationProvider {
  notify = vi.fn<NotificationProvider["notify"]>().mockResolvedValue(undefined);
}

class WindowsStub implements NotificationProvider {
  notify = vi.fn<NotificationProvider["notify"]>().mockResolvedValue(undefined);
}

class LinuxStub implements NotificationProvider {
  notify = vi.fn<NotificationProvider["notify"]>().mockResolvedValue(undefined);
}

function providers(): NotificationProviderSet {
  return {
    darwin: new MacStub(),
    win32: new WindowsStub(),
    linux: new LinuxStub()
  };
}

describe("NotificationService provider selection", () => {
  it.each([
    ["darwin", "MacStub"],
    ["win32", "WindowsStub"],
    ["linux", "LinuxStub"]
  ] as const)("selects %s automatically", (platform, expected) => {
    const service = new NotificationService({ platform, providers: providers() });
    expect(service.providerName).toBe(expected);
  });

  it("delegates the platform-neutral notify API", async () => {
    const injected = providers();
    const service = new NotificationService({ platform: "darwin", providers: injected });
    await service.notify("Title", "Message");
    expect(injected.darwin.notify).toHaveBeenCalledWith("Title", "Message");
    expect(injected.win32.notify).not.toHaveBeenCalled();
    expect(injected.linux.notify).not.toHaveBeenCalled();
  });

  it("keeps future provider names explicit but unimplemented", () => {
    expect(() => new NotificationService({ provider: "telegram" })).toThrow(/not implemented/);
  });
});

describe("MacNotifier", () => {
  it("uses osascript arguments and safely escapes AppleScript strings", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const provider = new MacNotifier(true, run);
    await provider.notify('Title "quoted"', 'Line one\nMessage "quoted"');

    expect(run).toHaveBeenCalledTimes(1);
    const [executable, args] = run.mock.calls[0] as [string, string[]];
    expect(executable).toBe("osascript");
    expect(args[0]).toBe("-e");
    expect(args[1]).toContain('sound name "Glass"');
    expect(args[1]).toContain('Title \\"quoted\\"');
    expect(args[1]).toContain('Message \\"quoted\\"');
  });
});
