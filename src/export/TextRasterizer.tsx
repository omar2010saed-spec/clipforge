import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { TextOverlay } from '@/types';
import { DESIGN_SHORT_SIDE } from '@/types';
import { TextOverlayBody } from '@/components/TextOverlayView';

export interface TextRasterizerHandle {
  /** Renders every text / sticker to a transparent PNG and returns { overlayId: fileUri }. */
  render(): Promise<Record<string, string>>;
}

interface Props {
  texts: TextOverlay[];
  outWidth: number;
  outHeight: number;
}

/**
 * Off-screen renderer. Text is drawn with the same component as the preview (so Arabic shaping,
 * fonts, outline and shadow match exactly) and captured at the export resolution: 1 layout unit
 * = 1 output pixel, enforced by passing explicit width/height to the capture.
 */
export const TextRasterizer = forwardRef<TextRasterizerHandle, Props>(function TextRasterizer(
  { texts, outWidth, outHeight },
  ref,
) {
  const nodes = useRef(new Map<string, View | null>());
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const scale = Math.min(outWidth, outHeight) / DESIGN_SHORT_SIDE;

  useImperativeHandle(ref, () => ({
    async render() {
      // give fonts and layout a moment to settle
      await new Promise((r) => setTimeout(r, 400));
      const out: Record<string, string> = {};
      for (const t of texts) {
        const node = nodes.current.get(t.id);
        const size = sizes.current.get(t.id);
        if (!node || !size || size.w < 1 || size.h < 1) continue;
        out[t.id] = await captureRef(node, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          width: Math.ceil(size.w),
          height: Math.ceil(size.h),
        });
      }
      return out;
    },
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -50000, top: 0 }}>
      {texts.map((t) => (
        <View
          key={t.id}
          ref={(n) => {
            nodes.current.set(t.id, n);
          }}
          collapsable={false}
          onLayout={(e) => sizes.current.set(t.id, { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          style={{ alignSelf: 'flex-start' }}
        >
          <TextOverlayBody overlay={{ ...t, rotation: 0 }} scale={scale} maxWidth={outWidth * 0.9} />
        </View>
      ))}
    </View>
  );
});
