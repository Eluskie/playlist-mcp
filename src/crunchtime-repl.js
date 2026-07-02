import readline from "node:readline";
import * as mpv from "./mpv.js";
import { DEFAULT_PLAYLIST, resolvePlaylist } from "./playlists.js";
import {
  crunchBanner,
  formatPlayback,
  formatReplHelp,
  formatStart,
  formatStop,
  paint,
} from "./cli-theme.js";

const PROMPT = paint.gold("crunchtime") + paint.dim("> ");
const LIVE_TICK_MS = 500;
const STATUS_HEIGHT = 5;

function padStatusBlock(text) {
  const lines = text.split("\n");
  while (lines.length < STATUS_HEIGHT) lines.push("");
  return lines.slice(0, STATUS_HEIGHT).join("\n");
}

function createLiveDisplay(rl) {
  let interval = null;
  let paused = false;
  let reserved = false;

  function moveToStatusTop() {
    readline.moveCursor(process.stdout, 0, -STATUS_HEIGHT);
  }

  function restorePromptCursor() {
    process.stdout.write("\x1b[u");
  }

  function writeBlock(text) {
    if (!reserved) return;

    const lines = padStatusBlock(text).split("\n");

    // Save prompt cursor, redraw only the reserved status rows, then restore.
    process.stdout.write("\x1b[s");
    moveToStatusTop();
    for (const line of lines) {
      readline.clearLine(process.stdout, 0);
      process.stdout.write(`${line}\n`);
    }
    restorePromptCursor();
  }

  function clearBlock() {
    if (!reserved) return;

    process.stdout.write("\x1b[s");
    moveToStatusTop();
    for (let i = 0; i < STATUS_HEIGHT; i++) {
      readline.clearLine(process.stdout, 0);
      process.stdout.write("\n");
    }
    restorePromptCursor();
  }

  function reserve(text) {
    console.log(padStatusBlock(text));
    reserved = true;
  }

  async function renderOnce() {
    if (!(await mpv.isRunning())) {
      stop();
      clearBlock();
      return false;
    }
    const info = await mpv.playbackInfo();
    if (!info) {
      stop();
      clearBlock();
      return false;
    }
    writeBlock(formatPlayback(info));
    return true;
  }

  async function tick() {
    if (paused) return;
    await renderOnce();
  }

  function start() {
    if (interval) return;
    paused = false;
    interval = setInterval(() => void tick(), LIVE_TICK_MS);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    paused = false;
  }

  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
    if (interval) void renderOnce();
  }

  async function withOutput(fn) {
    pause();
    await fn();
    if (await mpv.isRunning()) {
      rl.prompt(true);
      process.stdout.write("\x1b[s");
      resume();
    }
  }

  return { start, stop, clearBlock, pause, resume, withOutput, renderOnce, reserve };
}

async function waitForTracks() {
  return mpv.playbackInfo({ wait: true });
}

async function startDefaultPlaylist() {
  const url = resolvePlaylist(DEFAULT_PLAYLIST);
  await mpv.startPlaylist(url, { attached: true });
  await waitForTracks();
}

function parseCommand(line) {
  const trimmed = line.trim();
  if (!trimmed) return { cmd: "status" };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { cmd: first.toLowerCase(), args: rest };
}

async function runCommand({ cmd, args }, live) {
  if (/^\d+$/.test(cmd)) {
    await mpv.playTrack(Number(cmd));
    await new Promise((r) => setTimeout(r, 300));
    await live.renderOnce();
    return true;
  }

  switch (cmd) {
    case "next":
    case "n":
      await mpv.next();
      await new Promise((r) => setTimeout(r, 300));
      await live.renderOnce();
      break;
    case "prev":
    case "previous":
    case "back":
    case "b":
      await mpv.prev();
      await new Promise((r) => setTimeout(r, 300));
      await live.renderOnce();
      break;
    case "pause":
    case "p":
      if (await mpv.isRunning()) {
        await mpv.togglePause();
      } else {
        await startDefaultPlaylist();
        live.start();
      }
      await live.renderOnce();
      break;
    case "resume":
    case "unpause":
    case "r":
      await mpv.resumePlayback({ restart: startDefaultPlaylist });
      live.start();
      await live.renderOnce();
      break;
    case "play":
      await startDefaultPlaylist();
      live.start();
      await live.renderOnce();
      break;
    case "stop":
    case "x":
      live.stop();
      live.clearBlock();
      await mpv.shutdown();
      await live.withOutput(async () => {
        console.log(formatStop());
      });
      break;
    case "status":
    case "s":
    case "now":
      await live.renderOnce();
      break;
    case "help":
    case "h":
    case "?":
      await live.withOutput(async () => {
        console.log(formatReplHelp());
      });
      break;
    case "clear":
      live.stop();
      await live.withOutput(async () => {
        console.clear();
        console.log(crunchBanner());
      });
      if (await mpv.isRunning()) {
        const info = await mpv.playbackInfo();
        live.reserve(formatPlayback(info));
        live.start();
      }
      break;
    case "quit":
    case "exit":
    case "q":
      return false;
    default:
      await live.withOutput(async () => {
        console.log(paint.red(`Unknown: ${cmd}`) + paint.dim(" — type help for commands"));
      });
  }
  return true;
}

export async function runCrunchtimeRepl() {
  mpv.bindSessionLifecycle();

  console.log(formatStart());
  try {
    await startDefaultPlaylist();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log("");
  console.log(formatReplHelp());
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: PROMPT,
  });

  const live = createLiveDisplay(rl);
  live.reserve(formatPlayback(await waitForTracks()));
  let closing = false;

  const closeSession = async () => {
    if (closing) return;
    closing = true;
    live.stop();
    live.clearBlock();
    rl.close();
    await mpv.shutdown();
  };

  rl.on("SIGINT", () => {
    console.log("");
    void closeSession().then(() => process.exit(0));
  });

  rl.on("close", () => {
    void mpv.shutdown();
  });

  rl.on("line", (line) => {
    void (async () => {
      if (closing) return;
      try {
        const keepGoing = await runCommand(parseCommand(line), live);
        if (!keepGoing) {
          await closeSession();
          console.log(formatStop());
          return;
        }
      } catch (err) {
        await live.withOutput(async () => {
          console.error(paint.red(err.message));
        });
        if (await mpv.isRunning()) live.start();
      }
      if (!closing) {
        rl.prompt();
        process.stdout.write("\x1b[s");
      }
    })();
  });

  rl.prompt();
  process.stdout.write("\x1b[s");
  live.start();
}
