import { spawn } from "node:child_process";
import { getSetting, setSetting } from "./db";

let restartTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleRestart(at: Date) {
  if (restartTimer) clearTimeout(restartTimer);
  setSetting("scheduled_restart_at", at.toISOString());
  const delay = Math.max(0, at.getTime() - Date.now());
  restartTimer = setTimeout(() => {
    setSetting("scheduled_restart_at", "");
    const child = spawn("oxmgr", ["restart", "vkit-profit"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }, Math.min(delay, 2_147_483_647));
  restartTimer.unref();
}

export function restoreScheduledRestart() {
  const value = getSetting("scheduled_restart_at");
  if (!value) return;
  const at = new Date(value);
  if (Number.isFinite(at.getTime())) scheduleRestart(at);
}

