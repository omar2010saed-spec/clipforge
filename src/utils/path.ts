/** Converts a file:// uri (possibly percent-encoded) into a plain filesystem path. */
export function uriToPath(uri: string): string {
  const raw = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURI(raw);
  } catch {
    return raw;
  }
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'file';
}
