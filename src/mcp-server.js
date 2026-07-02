#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as mpv from "./mpv.js";
import { resolvePlaylist } from "./playlists.js";

const server = new McpServer({ name: "playlist-mcp", version: "0.1.0" });

const text = (t) => ({ content: [{ type: "text", text: t }] });

server.tool(
  "play_playlist",
  "Start playing a playlist. Accepts a playlist name (resolved against PLAYLIST_BASE_URL), a full .m3u URL, or a local path. Replaces whatever is currently playing.",
  { playlist: z.string().describe("Playlist name, URL, or path") },
  async ({ playlist }) => {
    const url = resolvePlaylist(playlist);
    await mpv.startPlaylist(url);
    return text(`Playing ${url}\n${await mpv.status()}`);
  }
);

server.tool("next_track", "Skip to the next track.", {}, async () => {
  await mpv.next();
  await new Promise((r) => setTimeout(r, 300));
  return text(await mpv.status());
});

server.tool("previous_track", "Go back to the previous track.", {}, async () => {
  await mpv.prev();
  await new Promise((r) => setTimeout(r, 300));
  return text(await mpv.status());
});

server.tool("toggle_pause", "Pause or resume playback.", {}, async () => {
  await mpv.togglePause();
  return text(await mpv.status());
});

server.tool("now_playing", "Show the current track and playlist position.", {}, async () =>
  text(await mpv.status())
);

server.tool("stop_playback", "Stop playback and quit the player.", {}, async () => {
  await mpv.stop().catch(() => {});
  return text("Stopped.");
});

await server.connect(new StdioServerTransport());
