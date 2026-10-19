export type VideoCodec = 'h264' | 'h265';
export type ExportFormat = 'mp4' | 'gif';
export type ExportPresetKey = '720p' | '1080p' | '2k' | '4k';

export interface ExportSettings {
  format: ExportFormat;
  codec: VideoCodec;
  preset: ExportPresetKey;
  fps: 24 | 30 | 60;
}

/** Short side in pixels + base bitrate (kbps) at 30 fps. */
export const EXPORT_PRESETS: Record<ExportPresetKey, { shortSide: number; bitrateKbps: number }> = {
  '720p': { shortSide: 720, bitrateKbps: 8000 },
  '1080p': { shortSide: 1080, bitrateKbps: 16000 },
  '2k': { shortSide: 1440, bitrateKbps: 30000 },
  '4k': { shortSide: 2160, bitrateKbps: 60000 },
};
