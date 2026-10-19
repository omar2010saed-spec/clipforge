import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TextOverlay } from '@/types';
import { resolveFont } from '@/fonts/fonts';

const OFFSETS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

interface Props {
  overlay: TextOverlay;
  /** pixels per design pixel (outputShortSide / 1080) */
  scale: number;
  maxWidth: number;
}

/**
 * Visual body of a text / sticker overlay (no positioning, no rotation).
 * Used by the live preview AND by the export rasterizer, so what you see is what you get.
 * The outline is emulated with 8 offset copies because React Native has no text stroke.
 */
export const TextOverlayBody = React.memo(function TextOverlayBody({ overlay, scale, maxWidth }: Props) {
  const font = resolveFont(overlay.fontFamily, overlay.bold);
  const fontSize = Math.max(4, overlay.fontSize * scale);
  const stroke = overlay.strokeWidth * scale;
  const hasBg = overlay.backgroundColor !== 'transparent';
  const pad = Math.ceil(stroke + (overlay.shadow ? 6 * scale : 0)) + 2;
  const boxPad = hasBg ? fontSize * 0.25 : 0;

  const base = {
    ...font,
    fontSize,
    lineHeight: fontSize * 1.3,
    textAlign: overlay.align,
    color: overlay.color,
  } as const;

  return (
    <View collapsable={false} style={{ padding: pad, maxWidth: maxWidth + pad * 2, alignSelf: 'center' }}>
      <View
        style={{
          backgroundColor: overlay.backgroundColor,
          paddingHorizontal: boxPad * 1.4,
          paddingVertical: boxPad * 0.6,
          borderRadius: hasBg ? fontSize * 0.25 : 0,
        }}
      >
        {stroke > 0
          ? OFFSETS.map(([dx, dy], i) => (
              <Text
                key={i}
                style={[
                  base,
                  styles.copy,
                  { color: overlay.strokeColor, left: dx * stroke, top: dy * stroke },
                ]}
              >
                {overlay.text}
              </Text>
            ))
          : null}
        <Text
          style={[
            base,
            overlay.shadow
              ? {
                  textShadowColor: 'rgba(0,0,0,0.75)',
                  textShadowOffset: { width: 2 * scale, height: 2 * scale },
                  textShadowRadius: 4 * scale,
                }
              : null,
          ]}
        >
          {overlay.text}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  copy: { position: 'absolute', width: '100%' },
});
