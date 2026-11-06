/**
 * Build a sidecar filename from a media path.
 * e.g. "/path/to/video.mp4" -> "/path/to/video.captions_json5"
 * Returns null if the path has no extension or is empty/null.
 */
export function sidecarName(mediaFilePath: string | null | undefined): string | null {
  if (!mediaFilePath) return null
  const dot = mediaFilePath.lastIndexOf('.')
  if (dot <= 0) return null
  return mediaFilePath.substring(0, dot) + '.captions_json5'
}

/**
 * Build the `media://` URL the renderer uses as a media element `src`.
 *
 * Every path segment is percent-encoded. Interpolating the raw path — which is what
 * this used to do — silently breaks on characters that are perfectly ordinary in media
 * filenames: `#` starts a URL fragment, `?` starts a query, and a stray `%` makes
 * `decodeURIComponent` throw. In all three cases the protocol handler ends up `stat`ing
 * a path that does not exist, returns 400, and the player just shows nothing.
 *
 *   /Music/track #3.mp3  →  the handler used to see "/Music/track "
 *   /100% live.wav       →  the handler used to throw URI malformed
 *
 * Backslashes are normalised to forward slashes and a leading slash is added when
 * missing, so a Windows path (`C:\Media\a.mp4`) produces `media://local/C%3A/Media/a.mp4`;
 * `pathFromMediaUrl` plus the caller's drive-letter handling turns that back into a path
 * Node accepts. `encodeURIComponent('')` is `''`, so the leading slash survives the split.
 */
export function mediaUrlForPath(filePath: string): string {
  const slashed = filePath.replace(/\\/g, '/')
  const absolute = slashed.startsWith('/') ? slashed : `/${slashed}`
  const encoded = absolute.split('/').map(encodeURIComponent).join('/')
  return `media://local${encoded}`
}

/**
 * Inverse of `mediaUrlForPath`: recover the filesystem path from a `media://` URL.
 *
 * On Windows the caller still has to strip the leading slash ahead of the drive letter;
 * that is left out here so this stays a pure string round trip.
 */
export function pathFromMediaUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname)
}

/**
 * Compute a backup path that doesn't collide with existing files.
 * Tries `.bak`, then `.bak2`, `.bak3`, etc.
 * @param basePath - The original file path to back up
 * @param exists - Function that returns true if a path already exists
 */
export async function findBackupPath(
  basePath: string,
  exists: (p: string) => Promise<boolean>
): Promise<string> {
  let backupPath = basePath + '.bak'
  let suffix = 2
  while (await exists(backupPath)) {
    backupPath = basePath + `.bak${suffix}`
    suffix++
  }
  return backupPath
}
