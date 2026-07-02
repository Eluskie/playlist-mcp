import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function mpvBinary() {
  if (process.env.MPV_PATH) return process.env.MPV_PATH;
  if (process.platform === "win32") {
    const known = "C:\\Program Files\\MPV Player\\mpv.exe";
    if (existsSync(known)) return known;
  }
  return "mpv";
}

const IPC_PATH =
  process.platform === "win32"
    ? "\\\\.\\pipe\\playlist-mcp-mpv"
    : "/tmp/playlist-mcp-mpv.sock";

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(IPC_PATH);
    sock.once("connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

let requestId = 0;

/** Send one command to mpv over IPC and return its response data. */
export async function sendCommand(command) {
  const sock = await connect();
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    let buffer = "";
    sock.on("data", (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.request_id === id) {
          sock.end();
          if (msg.error && msg.error !== "success") {
            reject(new Error(`mpv error: ${msg.error}`));
          } else {
            resolve(msg.data);
          }
          return;
        }
      }
    });
    sock.on("error", reject);
    sock.write(JSON.stringify({ command, request_id: id }) + "\n");
    setTimeout(() => {
      sock.destroy();
      reject(new Error("mpv IPC timeout"));
    }, 5000).unref();
  });
}

export async function isRunning() {
  try {
    await sendCommand(["get_property", "pid"]);
    return true;
  } catch {
    return false;
  }
}

/** Start a headless mpv playing the given playlist URL (replaces any current one). */
export async function startPlaylist(url) {
  if (await isRunning()) {
    await sendCommand(["loadlist", url, "replace"]);
    await sendCommand(["set_property", "pause", false]);
    return;
  }
  const child = spawn(
    mpvBinary(),
    [
      "--no-video",
      "--really-quiet",
      `--input-ipc-server=${IPC_PATH}`,
      url,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  // Wait for the IPC socket to come up.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isRunning()) return;
  }
  throw new Error(
    "Could not start mpv. Is it installed and on your PATH? (https://mpv.io)"
  );
}

async function requireRunning() {
  if (!(await isRunning())) {
    throw new Error("Nothing is playing. Start a playlist first.");
  }
}

export const next = async () => {
  await requireRunning();
  return sendCommand(["playlist-next", "force"]);
};
export const prev = async () => {
  await requireRunning();
  return sendCommand(["playlist-prev"]);
};
export const togglePause = () => sendCommand(["cycle", "pause"]);
export const stop = () => sendCommand(["quit"]);

async function getProp(name) {
  try {
    return await sendCommand(["get_property", name]);
  } catch {
    return null;
  }
}

function fmtTime(s) {
  if (s == null) return "?:??";
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Human-readable status of the current track. */
export async function status() {
  if (!(await isRunning())) return "Nothing is playing.";
  const [title, pos, count, time, duration, paused] = await Promise.all([
    getProp("media-title"),
    getProp("playlist-pos-1"),
    getProp("playlist-count"),
    getProp("time-pos"),
    getProp("duration"),
    getProp("pause"),
  ]);
  const icon = paused ? "⏸" : "▶";
  return `${icon} ${pos ?? "?"}/${count ?? "?"}  ${title ?? "unknown"}  ${fmtTime(time)}/${fmtTime(duration)}`;
}
