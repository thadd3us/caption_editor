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
