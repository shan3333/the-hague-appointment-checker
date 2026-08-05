import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openInDefaultBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") await execFileAsync("open", [url]);
  else if (process.platform === "win32") await execFileAsync("explorer.exe", [url]);
  else await execFileAsync("xdg-open", [url]);
}
