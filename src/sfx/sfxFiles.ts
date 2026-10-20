import * as FileSystem from 'expo-file-system';
import { encodeWav, sfxDurationMs, synthesize, toBase64, type SfxId } from './synth';

const dir = () => `${FileSystem.documentDirectory}sfx/`;

/** Writes the effect to disk on first use and returns its file uri and length. */
export async function ensureSfxFile(id: SfxId): Promise<{ uri: string; durationMs: number }> {
  const uri = `${dir()}${id}.wav`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.size < 100) {
    await FileSystem.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(uri, toBase64(encodeWav(synthesize(id))), { encoding: FileSystem.EncodingType.Base64 });
  }
  return { uri, durationMs: sfxDurationMs(id) };
}
