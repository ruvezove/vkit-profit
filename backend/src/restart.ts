import { spawn } from "node:child_process";
import { getSetting, setSetting } from "./db";

let restartTimer: ReturnType<typeof setTimeout> | undefined;
const maximumTimerDelay = 2_147_483_647;

function armRestart(at: Date) {
  const remaining = at.getTime() - Date.now();
  if (remaining > maximumTimerDelay) {
    restartTimer = setTimeout(() => armRestart(at), maximumTimerDelay);
    restartTimer.unref();
    return;
  }
  restartTimer = setTimeout(() => {
    setSetting("scheduled_restart_at", "");
    const child = spawn("oxmgr", ["restart", "vkit-profit"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }, Math.max(0, remaining));
  restartTimer.unref();
}

export function scheduleRestart(at: Date) {
  if (restartTimer) clearTimeout(restartTimer);
  setSetting("scheduled_restart_at", at.toISOString());
  armRestart(at);
}

export function restoreScheduledRestart() {
  const value = getSetting("scheduled_restart_at");
  if (!value) return;
  const at = new Date(value);
  if (Number.isFinite(at.getTime())) scheduleRestart(at);
}

