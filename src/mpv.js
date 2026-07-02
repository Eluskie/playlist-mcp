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

let ownedProcess = null;

export function ownsPlayer() {
  return ownedProcess != null && ownedProcess.exitCode == null;
}

/** Kill mpv and clear ownership (graceful quit over IPC, then force-kill if needed). */
export async function shutdown() {
  if (await isRunning()) {
    try {
      await sendCommand(["quit"]);
    } catch {
      // socket may already be gone
    }
  }
  if (ownedProcess && ownedProcess.exitCode == null) {
    ownedProcess.kill();
  }
  ownedProcess = null;
}

/** Ensure mpv dies when this Node process exits (REPL session). */
export function bindSessionLifecycle() {
  const cleanup = () => {
    if (ownedProcess && ownedProcess.exitCode == null) {
      ownedProcess.kill();
    }
  };
  process.once("exit", cleanup);
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

/** Start a headless mpv playing the given playlist URL (replaces any current one). */
export async function startPlaylist(url, { attached = false } = {}) {
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
    { detached: !attached, stdio: "ignore" }
  );
  if (attached) {
    ownedProcess = child;
    child.on("exit", () => {
      if (ownedProcess === child) ownedProcess = null;
    });
  } else {
    child.unref();
  }
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
export const togglePause = async () => {
  await requireRunning();
  return sendCommand(["cycle", "pause"]);
};
export const setPaused = async (paused) => {
  await requireRunning();
  return sendCommand(["set_property", "pause", paused]);
};
export const stop = () => shutdown();

/** Unpause playback. If nothing is running, calls restartFn (e.g. start default playlist). */
export async function resumePlayback({ restart } = {}) {
  if (!(await isRunning())) {
    if (restart) {
      await restart();
      return;
    }
    throw new Error("Nothing is playing. Start a playlist first.");
  }
  await setPaused(false);
}

/** Jump to a track by 1-based index (user-facing: 1, 2, 3…). */
export const playTrack = async (oneBasedIndex) => {
  await requireRunning();
  const info = await playbackInfo();
  if (!info?.count) throw new Error("Playlist not loaded yet.");
  if (oneBasedIndex < 1 || oneBasedIndex > info.count) {
    throw new Error(`Pick a track between 1 and ${info.count}.`);
  }
  return sendCommand(["set_property", "playlist-pos", oneBasedIndex - 1]);
};

async function getProp(name) {
  try {
    return await sendCommand(["get_property", name]);
  } catch {
    return null;
  }
}

function asNumber(value) {
  if (value == null || value === false) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function titleFromFilename(filename) {
  if (filename == null || filename === "") return null;
  const base = String(filename).replace(/\\/g, "/").split("/").pop()?.split("?")[0] ?? "";
  if (!base || base.endsWith(".m3u")) return null;
  const decoded = decodeURIComponent(base);
  return decoded.replace(/\.(mp3|m4a|flac|ogg|wav|opus)$/i, "") || decoded;
}

function resolveTitle(title, filename) {
  if (typeof title === "string") {
    const trimmed = title.trim();
    if (trimmed && !trimmed.endsWith(".m3u")) return trimmed;
  }
  return titleFromFilename(filename) ?? "Loading…";
}

function isPlaybackReady(info) {
  return (
    info != null &&
    info.title !== "Loading…" &&
    !info.title.endsWith(".m3u") &&
    info.duration != null &&
    info.duration > 0
  );
}

async function readPlaybackInfo() {
  const [title, filename, pos, count, time, duration, paused] = await Promise.all([
    getProp("media-title"),
    getProp("filename"),
    getProp("playlist-pos-1"),
    getProp("playlist-count"),
    getProp("time-pos"),
    getProp("duration"),
    getProp("pause"),
  ]);

  let trackDuration = asNumber(duration);
  if (trackDuration == null || trackDuration <= 0) {
    trackDuration = asNumber(await getProp("duration/full"));
  }

  let currentTime = asNumber(time);
  if (currentTime == null) {
    currentTime = asNumber(await getProp("playback-time"));
  }

  return {
    title: resolveTitle(title, filename),
    pos: asNumber(pos),
    count: asNumber(count),
    time: currentTime ?? 0,
    duration: trackDuration != null && trackDuration > 0 ? trackDuration : null,
    paused: Boolean(paused),
  };
}

function fmtTime(s) {
  if (s == null) return "?:??";
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Structured playback state, or null when idle.
 * Pass `{ wait: true }` to poll until track metadata and duration are available.
 */
export async function playbackInfo({ wait = false, attempts = 25, intervalMs = 200 } = {}) {
  if (!(await isRunning())) return null;
  if (!wait) return readPlaybackInfo();

  for (let i = 0; i < attempts; i++) {
    const info = await readPlaybackInfo();
    if (isPlaybackReady(info)) return info;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return readPlaybackInfo();
}

/** Human-readable status of the current track. */
export async function status() {
  const info = await playbackInfo({ wait: true });
  if (!info) return "Nothing is playing.";
  const icon = info.paused ? "⏸" : "▶";
  return `${icon} ${info.pos ?? "?"}/${info.count ?? "?"}  ${info.title}  ${fmtTime(info.time)}/${fmtTime(info.duration)}`;
}

export { fmtTime };
