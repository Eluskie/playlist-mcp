# playlist-mcp

Play playlists hosted on your server, from a terminal or from an AI agent
(Claude Code, Cursor, anything that speaks MCP). Audio plays locally through a
headless [mpv](https://mpv.io); your server only hosts static files.

```text
you / your agent ──▶ play CLI or MCP server ──▶ local mpv ──streams──▶ your server's audio files
```

## Requirements

- Node.js 18+
- mpv on your PATH
  - Windows: `winget install mpv` (or `choco install mpv`)
  - macOS: `brew install mpv`
  - Linux: `apt install mpv` etc.

## Server setup

Host your audio files and one `.m3u` per playlist anywhere that serves static
files over HTTP (a VPS with nginx, Cloudflare R2 + a public bucket, GitHub
Pages, ...). An `.m3u` is just a text file with one audio URL per line — see
`playlists/example.m3u`.

Tip: put Cloudflare in front of your server so audio files are cached at the
edge and listeners don't hit your origin.

## Terminal usage

**Fastest path** — install mpv once, then:

```bash
npx -y playlist-mcp crunchtime
```

That starts the default Kingdom Hearts battle playlist (hosted on Cloudflare R2, no config
needed). Controls: `crunchtime next`, `crunchtime pause`, `crunchtime resume`,
`crunchtime status`, `crunchtime stop`. Inside the session, single-letter shortcuts
work too (`n`, `p`, `r`, `s`, `q`).

Or link locally for a global command:

```bash
npm install
npm link                      # makes `play` and `crunchtime` available globally

crunchtime                    # kingdom-hearts playlist, no env vars required
crunchtime next
```

**Other playlists** — override the default server or pass URLs directly:

```bash
export PLAYLIST_BASE_URL=https://music.example.com/playlists

play focus                    # plays https://music.example.com/playlists/focus.m3u
play next
play prev
play pause
play resume
play status                   # ▶ 3/12  Artist – Track  1:24/3:58
play stop
```

`play` also accepts a full URL or local path: `play https://.../chill.m3u`.

## MCP usage (Claude Code / Cursor)

Add to your MCP config (`.mcp.json` for Claude Code, `mcp.json` for Cursor):

```json
{
  "mcpServers": {
    "playlist": {
      "command": "node",
      "args": ["C:/path/to/playlist-mcp/src/mcp-server.js"],
      "env": {
        "PLAYLIST_BASE_URL": "https://music.example.com/playlists"
      }
    }
  }
}
```

Then ask your agent things like "play the focus playlist", "skip this song",
"what's playing?". Tools exposed: `play_playlist`, `play_default_playlist`,
`next_track`, `previous_track`, `toggle_pause`, `pause_playback`,
`resume_playback`, `now_playing`, `stop_playback`.

The CLI and the MCP server control the same mpv instance, so you can start a
playlist from chat and skip tracks from the terminal (or vice versa).
