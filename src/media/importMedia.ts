import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { MediaKind } from '@/types';
import type { NewMedia } from '@/editor/timeline';
import { sanitizeFileName } from '@/utils/path';
import { probeMedia } from './probe';

export interface PickedItem {
  uri: string;
  name: string;
  kind: MediaKind;
  durationMs?: number | null;
}

export class PermissionDeniedError extends Error {
  constructor() {
    super('permission-denied');
  }
}

export function detectKind(mime: string | null | undefined, name: string): MediaKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/gif' || ext === 'gif') return 'gif';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic', 'bmp'].includes(ext)) return 'image';
  if (m.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
  return 'video';
}

function fromImagePicker(result: ImagePicker.ImagePickerResult): PickedItem[] {
  if (result.canceled) return [];
  return result.assets.map((a, i) => {
    const name = a.fileName ?? `media-${Date.now()}-${i}`;
    const kind: MediaKind = a.type === 'video' ? 'video' : detectKind(a.mimeType, name);
    return { uri: a.uri, name, kind, durationMs: a.type === 'video' ? (a.duration ?? null) : null };
  });
}

export async function pickFromGallery(): Promise<PickedItem[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  return fromImagePicker(result);
}

export async function pickFromCamera(): Promise<PickedItem[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new PermissionDeniedError();
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
  return fromImagePicker(result);
}

export async function pickFiles(kind: 'media' | 'audio'): Promise<PickedItem[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: kind === 'audio' ? ['audio/*'] : ['video/*', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    kind: kind === 'audio' ? 'audio' : detectKind(a.mimeType, a.name),
  }));
}

/** Copies the file into the app's permanent storage (cache can be cleared by the OS) and probes it. */
export async function persistAndProbe(projectId: string, item: PickedItem): Promise<NewMedia> {
  const dir = `${FileSystem.documentDirectory}media/${projectId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = `${dir}${Date.now()}-${sanitizeFileName(item.name)}`;
  await FileSystem.copyAsync({ from: item.uri, to: dest });
  const probe = await probeMedia(dest, item.kind, item.durationMs);
  return { kind: item.kind, uri: dest, name: item.name, durationMs: probe.durationMs, hasAudio: probe.hasAudio };
}
