/**
 * Resolve a playlist name to something mpv can play.
 *
 * - Full URLs or local paths pass through untouched.
 * - Bare names ("focus") resolve against PLAYLIST_BASE_URL,
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
  const base = process.env.PLAYLIST_BASE_URL;
  if (!base) {
    throw new Error(
      `"${nameOrUrl}" is not a URL or path, and PLAYLIST_BASE_URL is not set. ` +
        "Set PLAYLIST_BASE_URL to your server's playlist folder, e.g. https://music.example.com/playlists"
    );
  }
  return `${base.replace(/\/$/, "")}/${nameOrUrl}.m3u`;
}
