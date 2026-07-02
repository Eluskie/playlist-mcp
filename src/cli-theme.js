import { fmtTime } from "./mpv.js";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const esc = (code, text) => (useColor ? `${code}${text}\x1b[0m` : text);

export const paint = {
  bold: (t) => esc("\x1b[1m", t),
  dim: (t) => esc("\x1b[2m", t),
  gold: (t) => esc("\x1b[38;5;220m", t),
  cyan: (t) => esc("\x1b[36m", t),
  magenta: (t) => esc("\x1b[35m", t),
  green: (t) => esc("\x1b[32m", t),
  red: (t) => esc("\x1b[31m", t),
};

function progressBar(current, total, width = 28) {
  if (current == null || total == null || total <= 0) {
    return paint.dim("░".repeat(width));
  }
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * width);
  return paint.gold("█".repeat(filled)) + paint.dim("░".repeat(width - filled));
}

export function crunchBanner() {
  const lines = [
    "╔═══════════════════════════════════════╗",
    "║                                       ║",
    "║        ⚔  IT'S CRUNCH TIME  ⚔        ║",
    "║                                       ║",
    "╚═══════════════════════════════════════╝",
  ];
  return lines.map((line) => paint.gold(line)).join("\n");
}

export function crunchHelp() {
  return `${crunchBanner()}

${paint.bold("Start a session")}
  ${paint.cyan("crunchtime")}            ${paint.dim("interactive session — music stops when you quit or close the terminal")}

${paint.bold("One-shot (outside a session)")}
  ${paint.cyan("crunchtime next")}       ${paint.dim("skip forward")}
  ${paint.cyan("crunchtime pause")}      ${paint.dim("toggle pause")}
  ${paint.cyan("crunchtime resume")}     ${paint.dim("unpause — restarts playlist if stopped")}
  ${paint.cyan("crunchtime play")}       ${paint.dim("restart default playlist")}
  ${paint.cyan("crunchtime status")}     ${paint.dim("now playing")}
  ${paint.cyan("crunchtime stop")}       ${paint.dim("stop playback")}

${paint.dim("Inside the session, type help for the full command list.")}`;
}

export function formatReplHelp() {
  return `${paint.bold("Session commands")}
  ${paint.cyan("next")} ${paint.dim("n")}           skip forward
  ${paint.cyan("prev")} ${paint.dim("b back")}     go back
  ${paint.cyan("pause")} ${paint.dim("p")}         toggle pause (starts if stopped)
  ${paint.cyan("resume")} ${paint.dim("r")}        unpause (restarts if stopped)
  ${paint.cyan("play")}              restart playlist
  ${paint.cyan("stop")} ${paint.dim("x")}          stop music (stay in session)
  ${paint.cyan("status")} ${paint.dim("s now")}    refresh now playing
  ${paint.cyan("1")}…${paint.cyan("6")}             jump to track
  ${paint.cyan("help")} ${paint.dim("h ?")}        this list
  ${paint.cyan("quit")} ${paint.dim("q exit")}     leave — stops music
  ${paint.dim("Ctrl+C")}             same as quit`;
}

export function formatPlayback(info) {
  if (!info) {
    return `${paint.dim("◇")} ${paint.dim("The battlefield is quiet. Run")} ${paint.cyan("crunchtime")} ${paint.dim("to begin.")}`;
  }

  const state = info.paused ? paint.magenta("⏸ PAUSED") : paint.green("▶ PLAYING");
  const track = paint.bold(info.title.replace(/\.mp3$/i, ""));
  const elapsed = info.time ?? 0;
  const clock = `${paint.cyan(fmtTime(elapsed))}${paint.dim("/")}${paint.dim(fmtTime(info.duration))}`;
  const position =
    info.pos != null && info.count != null
      ? paint.dim(`Track ${info.pos} of ${info.count}`)
      : paint.dim("Track ?");

  return [
    state,
    "",
    `  ${paint.gold("♪")} ${track}`,
    `  ${progressBar(elapsed, info.duration)}  ${clock}`,
    `  ${position}`,
  ].join("\n");
}

export function formatStart() {
  return [
    crunchBanner(),
    "",
    paint.dim("  Engaging battle themes..."),
    paint.dim('  "Light! Darkness! Answer!"'),
    "",
  ].join("\n");
}

export function formatStop() {
  return `${paint.gold("◇")} ${paint.dim("Session ended. The keyblade rests.")}`;
}
