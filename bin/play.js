#!/usr/bin/env node
import * as mpv from "../src/mpv.js";
import { resolvePlaylist } from "../src/playlists.js";

const [cmd, ...rest] = process.argv.slice(2);

const usage = `Usage:
  play <playlist>   start a playlist (name, .m3u URL, or path)
  play next         skip forward
  play prev         go back
  play pause        toggle pause
  play status       show current track
  play stop         stop playback`;

try {
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
      console.log(usage);
      break;
    case "next":
      await mpv.next();
      await new Promise((r) => setTimeout(r, 300));
      console.log(await mpv.status());
      break;
    case "prev":
      await mpv.prev();
      await new Promise((r) => setTimeout(r, 300));
      console.log(await mpv.status());
      break;
    case "pause":
      await mpv.togglePause();
      console.log(await mpv.status());
      break;
    case "status":
      console.log(await mpv.status());
      break;
    case "stop":
      await mpv.stop().catch(() => {});
      console.log("Stopped.");
      break;
    default: {
      const url = resolvePlaylist(cmd);
      console.log(`Playing ${url} ...`);
      await mpv.startPlaylist(url);
      console.log(await mpv.status());
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
