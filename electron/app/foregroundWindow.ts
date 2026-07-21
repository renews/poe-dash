import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FOREGROUND_OUTPUT_SEPARATOR = "|||POE_DASH|||";

const MACOS_FOREGROUND_SCRIPT = `tell application "System Events"
  set frontProcess to first application process whose frontmost is true
  set processName to name of frontProcess
  set windowName to ""
  try
    set windowName to name of front window of frontProcess
  end try
  return processName & "${FOREGROUND_OUTPUT_SEPARATOR}" & windowName
end tell`;

const WINDOWS_FOREGROUND_SCRIPT = `Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PoeDashForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
'@
$handle = [PoeDashForegroundWindow]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 512
[void][PoeDashForegroundWindow]::GetWindowText($handle, $title, $title.Capacity)
[uint32]$foregroundProcessId = 0
[void][PoeDashForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$foregroundProcessId)
$processName = (Get-Process -Id $foregroundProcessId -ErrorAction Stop).ProcessName
$processName + '${FOREGROUND_OUTPUT_SEPARATOR}' + $title.ToString()`;

export interface ForegroundWindowInfo {
  processName: string;
  title: string;
}

function parseForegroundOutput(output: string): ForegroundWindowInfo {
  const [processName = "", ...titleParts] = output
    .trim()
    .split(FOREGROUND_OUTPUT_SEPARATOR);
  return {
    processName: processName.trim(),
    title: titleParts.join(FOREGROUND_OUTPUT_SEPARATOR).trim(),
  };
}

export function getLivePriceCheckPlatformIssue(
  platform: NodeJS.Platform = process.platform,
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    platform === "linux" &&
    (environment.XDG_SESSION_TYPE?.toLowerCase() === "wayland" ||
      Boolean(environment.WAYLAND_DISPLAY))
  ) {
    return "Live price check requires an X11 session on Linux. Manual paste is still available.";
  }

  return undefined;
}

export async function getForegroundWindowInfo(
  platform: NodeJS.Platform = process.platform,
): Promise<ForegroundWindowInfo> {
  if (platform === "darwin") {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      MACOS_FOREGROUND_SCRIPT,
    ]);
    return parseForegroundOutput(stdout);
  }

  if (platform === "win32") {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      WINDOWS_FOREGROUND_SCRIPT,
    ]);
    return parseForegroundOutput(stdout);
  }

  if (platform === "linux") {
    const { stdout: windowIdOutput } = await execFileAsync("xdotool", [
      "getactivewindow",
    ]);
    const windowId = windowIdOutput.trim();
    const [{ stdout: title }, { stdout: processIdOutput }] = await Promise.all([
      execFileAsync("xdotool", ["getwindowname", windowId]),
      execFileAsync("xdotool", ["getwindowpid", windowId]),
    ]);
    const { stdout: processName } = await execFileAsync("ps", [
      "-p",
      processIdOutput.trim(),
      "-o",
      "comm=",
    ]);
    return { processName: processName.trim(), title: title.trim() };
  }

  return { processName: "", title: "" };
}
