export const DEFAULT_PLAYLIST_BASE_URL =
  "https://pub-aceac72714b7441f82362b702006c886.r2.dev/playlists";

export const DEFAULT_PLAYLIST = "kingdom-hearts";

function playlistBaseUrl() {
  return process.env.PLAYLIST_BASE_URL || DEFAULT_PLAYLIST_BASE_URL;
}

/**
 * Resolve a playlist name to something mpv can play.
 *
 * - Full URLs or local paths pass through untouched.
 * - Bare names ("focus") resolve against PLAYLIST_BASE_URL (or the built-in default),
 *   e.g. PLAYLIST_BASE_URL=https://music.example.com/playlists
 *        "focus" -> https://music.example.com/playlists/focus.m3u
 */
export function resolvePlaylist(nameOrUrl) {
  if (
    /^(https?:\/\/|[a-zA-Z]:[\\/]|\/|\.)/.test(nameOrUrl) ||
    /[\\/]/.test(nameOrUrl) ||
    nameOrUrl.endsWith(".m3u")
  ) {
    return nameOrUrl;
  }
  return `${playlistBaseUrl().replace(/\/$/, "")}/${nameOrUrl}.m3u`;
}
