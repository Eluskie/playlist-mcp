#!/usr/bin/env node
import * as mpv from "../src/mpv.js";
import { runCrunchtimeRepl } from "../src/crunchtime-repl.js";
import { DEFAULT_PLAYLIST, resolvePlaylist } from "../src/playlists.js";
import { crunchHelp, formatPlayback, formatStop } from "../src/cli-theme.js";

const [cmd] = process.argv.slice(2);

async function showStatus() {
  console.log(formatPlayback(await mpv.playbackInfo({ wait: true })));
}

try {
  switch (cmd) {
    case undefined:
      await runCrunchtimeRepl();
      break;
    case "-h":
    case "--help":
      console.log(crunchHelp());
      break;
    case "next":
    case "n":
      await mpv.next();
      await new Promise((r) => setTimeout(r, 300));
      await showStatus();
      break;
    case "prev":
    case "b":
      await mpv.prev();
      await new Promise((r) => setTimeout(r, 300));
      await showStatus();
      break;
    case "pause":
    case "p":
      await mpv.togglePause();
      await showStatus();
      break;
    case "resume":
    case "unpause":
    case "r":
      await mpv.resumePlayback({
        restart: async () => {
          await mpv.startPlaylist(resolvePlaylist(DEFAULT_PLAYLIST));
        },
      });
      await showStatus();
      break;
    case "play":
      await mpv.startPlaylist(resolvePlaylist(DEFAULT_PLAYLIST));
      await showStatus();
      break;
    case "status":
    case "s":
      await showStatus();
      break;
    case "stop":
      await mpv.shutdown();
      console.log(formatStop());
      break;
    default:
      console.error(`Unknown command: ${cmd}\n\n${crunchHelp()}`);
      process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
