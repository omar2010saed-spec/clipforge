export type TrackKind = 'video' | 'overlay' | 'audio' | 'text' | 'sticker';
export type MediaKind = 'video' | 'image' | 'gif' | 'audio';
export type TextAnimation = 'none' | 'fade' | 'slideUp';
export type TextAlign = 'left' | 'center' | 'right';

/** Reference size used to express font sizes; scaled to the preview / export size. */
export const DESIGN_SHORT_SIDE = 1080;

export interface Clip {
  id: string;
  trackId: string;
  kind: MediaKind;
  sourceUri: string;
  name: string;
  /** Start position on the timeline, in milliseconds */
  startMs: number;
  /** Trim in/out inside the source, in milliseconds */
  inMs: number;
  outMs: number;
  /** Total length of the source (large constant for images / gifs) */
  sourceDurationMs: number;
  speed: number;
  reversed: boolean;
  /** 0..2 (1 = original) */
  volume: number;
  /** false when the source is known to have no audio stream */
  hasAudio?: boolean;
  /** Overlay placement, normalized to the canvas (center point and width fraction) */
  x: number;
  y: number;
  scale: number;
}

export interface Track {
  id: string;
  kind: TrackKind;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

export interface TextOverlay {
  id: string;
  trackId: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Font id from the font library (see src/fonts) */
  fontFamily: string;
  /** In design pixels (relative to a 1080px short side) */
  fontSize: number;
  bold: boolean;
  align: TextAlign;
  color: string;
  strokeColor: string;
  /** In design pixels, 0 = no stroke */
  strokeWidth: number;
  /** 'transparent' = no background box */
  backgroundColor: string;
  shadow: boolean;
  /** Degrees */
  rotation: number;
  /** Center point, normalized to the canvas */
  x: number;
  y: number;
  animation: TextAnimation;
  isCaption: boolean;
  isSticker: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  texts: TextOverlay[];
}
