import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Project, TrackKind } from '@/types';
import { clipEndMs, projectDurationMs, TRACK_ORDER } from '@/models/project';
import { assignLanes, moveClip, moveText } from '@/editor/timeline';
import { useEditorStore } from '@/store/editorStore';
import { colors, radius } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { getVideoThumbnail } from '@/media/thumbnails';

const LABEL_W = 30;
const RULER_H = 26;
const LANE_H = 36;
const MAIN_H = 54;
const PAD_V = 3;

const TRACK_STYLE: Record<TrackKind, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  video: { color: '#3B6CFF', icon: 'film-outline' },
  overlay: { color: '#8A5CFF', icon: 'layers-outline' },
  audio: { color: '#1FA971', icon: 'musical-notes-outline' },
  text: { color: '#E08A1E', icon: 'text-outline' },
  sticker: { color: '#D6459B', icon: 'happy-outline' },
};

interface Item {
  id: string;
  type: 'clip' | 'text';
  start: number;
  end: number;
  label: string;
  badge?: string;
  /** visual source for the thumbnail strip (video / image clips) */
  thumb?: { uri: string; atMs: number; isImage: boolean };
}

function itemsOf(project: Project, kind: TrackKind): Item[] {
  const track = project.tracks.find((t) => t.kind === kind);
  if (!track) return [];
  if (kind === 'text' || kind === 'sticker') {
    return project.texts
      .filter((x) => x.trackId === track.id)
      .map((x) => ({ id: x.id, type: 'text' as const, start: x.startMs, end: x.endMs, label: x.text }));
  }
  return track.clips.map((c) => {
    const badges = [c.speed !== 1 ? `${c.speed}x` : '', c.reversed ? '⟲' : ''].filter(Boolean).join(' ');
    const thumb =
      c.kind === 'audio'
        ? undefined
        : { uri: c.sourceUri, atMs: c.inMs, isImage: c.kind === 'image' || c.kind === 'gif' };
    return { id: c.id, type: 'clip' as const, start: c.startMs, end: clipEndMs(c), label: c.name, badge: badges, thumb };
  });
}

function pickTickStep(pxPerSec: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * pxPerSec >= 70) ?? 600;
}

function Block({
  item,
  left,
  top,
  width,
  height,
  color,
  selected,
  pxPerMs,
  onPress,
  onMove,
  onDragState,
}: {
  item: Item;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  selected: boolean;
  pxPerMs: number;
  onPress: (item: Item) => void;
  onMove: (item: Item, newStartMs: number) => void;
  onDragState: (dragging: boolean) => void;
}) {
  const [dx, setDx] = useState(0);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const thumb = item.thumb;
  useEffect(() => {
    let alive = true;
    if (!thumb) return;
    if (thumb.isImage) {
      setThumbUri(thumb.uri);
      return;
    }
    getVideoThumbnail(thumb.uri, thumb.atMs).then((u) => {
      if (alive) setThumbUri(u);
    });
    return () => {
      alive = false;
    };
  }, [thumb?.uri, thumb?.atMs, thumb?.isImage]);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(250)
        .onStart(() => onDragState(true))
        .onUpdate((e) => setDx(e.translationX))
        .onEnd((e) => {
          if (Math.abs(e.translationX) > 3) onMove(item, item.start + e.translationX / pxPerMs);
        })
        .onFinalize(() => {
          setDx(0);
          onDragState(false);
        }),
    [item, onMove, onDragState, pxPerMs],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        onPress={() => onPress(item)}
        style={[
          styles.block,
          { left: left + dx, top, width, height, backgroundColor: color },
          selected && styles.blockSelected,
          dx !== 0 && { opacity: 0.8, zIndex: 10 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        {thumbUri ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}>
            <Image source={{ uri: thumbUri }} resizeMode="repeat" style={StyleSheet.absoluteFill} />
          </View>
        ) : null}
        <Text style={[styles.blockText, thumbUri ? styles.blockTextOnThumb : null]} numberOfLines={1}>
          {item.badge ? `${item.badge}  ` : ''}
          {item.label}
        </Text>
      </Pressable>
    </GestureDetector>
  );
}

export function Timeline() {
  const project = useEditorStore((s) => s.project);
  const timeMs = useEditorStore((s) => s.timeMs);
  const playing = useEditorStore((s) => s.playing);
  const selection = useEditorStore((s) => s.selection);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setTime = useEditorStore((s) => s.setTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const select = useEditorStore((s) => s.select);
  const commit = useEditorStore((s) => s.commit);

  const scrollRef = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const [viewW, setViewW] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pxPerMs = pxPerSec / 1000;
  const duration = project ? projectDurationMs(project) : 0;
  const pad = viewW / 2;
  const contentW = pad * 2 + Math.max(duration, 5000) * pxPerMs;

  useEffect(() => {
    if (!userScrolling.current) scrollRef.current?.scrollTo({ x: timeMs * pxPerMs, animated: false });
  }, [timeMs, pxPerMs, viewW]);

  const rows = useMemo(() => {
    if (!project) return [];
    return TRACK_ORDER.map((kind) => {
      const items = itemsOf(project, kind);
      const lanes = kind === 'video' ? { lanes: new Map<string, number>(), laneCount: 1 } : assignLanes(items, (i) => ({ start: i.start, end: i.end }));
      const laneH = kind === 'video' ? MAIN_H : LANE_H;
      return { kind, items, lanes: lanes.lanes, height: lanes.laneCount * laneH + PAD_V * 2, laneH };
    });
  }, [project]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!userScrolling.current) return;
      setTime(e.nativeEvent.contentOffset.x / pxPerMs);
    },
    [pxPerMs, setTime],
  );

  const onPressItem = useCallback(
    (item: Item) => select({ type: item.type, id: item.id }),
    [select],
  );

  const onMoveItem = useCallback(
    (item: Item, newStartMs: number) => {
      commit((p) => (item.type === 'clip' ? moveClip(p, item.id, newStartMs) : moveText(p, item.id, newStartMs)));
    },
    [commit],
  );

  if (!project) return null;

  const step = pickTickStep(pxPerSec);
  const tickCount = Math.min(2000, Math.ceil(Math.max(duration, 5000) / 1000 / step) + 1);
  const rowsHeight = rows.reduce((h, r) => h + r.height, 0);

  return (
    <View style={styles.root}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexDirection: 'row' }}>
          {/* fixed icon column */}
          <View style={{ width: LABEL_W }}>
            <View style={{ height: RULER_H }} />
            {rows.map((r) => (
              <View key={r.kind} style={[styles.label, { height: r.height }]}>
                <Ionicons name={TRACK_STYLE[r.kind].icon} size={16} color={colors.textMuted} />
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
            <ScrollView
              ref={scrollRef}
              horizontal
              scrollEnabled={!dragging}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollBeginDrag={() => {
                userScrolling.current = true;
                if (playing) setPlaying(false);
              }}
              onScrollEndDrag={(e) => {
                if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) userScrolling.current = false;
              }}
              onMomentumScrollBegin={() => {
                userScrolling.current = true;
              }}
              onMomentumScrollEnd={() => {
                userScrolling.current = false;
              }}
            >
              <View style={{ width: contentW, height: RULER_H + rowsHeight }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => select(null)} accessibilityLabel="timeline" />

                {/* ruler */}
                {Array.from({ length: tickCount }, (_, i) => {
                  const sec = i * step;
                  return (
                    <View key={i} pointerEvents="none" style={{ position: 'absolute', left: pad + sec * pxPerSec, top: 0 }}>
                      <Text style={styles.tickText}>{formatDuration(sec * 1000)}</Text>
                      <View style={styles.tick} />
                    </View>
                  );
                })}

                {/* rows */}
                {(() => {
                  let top = RULER_H;
                  return rows.map((r) => {
                    const rowTop = top;
                    top += r.height;
                    const style = TRACK_STYLE[r.kind];
                    return (
                      <View key={r.kind} style={[styles.row, { top: rowTop, height: r.height }]} pointerEvents="box-none">
                        {r.items.map((item) => {
                          const lane = r.lanes.get(item.id) ?? 0;
                          return (
                            <Block
                              key={item.id}
                              item={item}
                              left={pad + item.start * pxPerMs}
                              top={PAD_V + lane * r.laneH}
                              width={Math.max(6, (item.end - item.start) * pxPerMs)}
                              height={r.laneH - 4}
                              color={style.color}
                              selected={selection?.id === item.id}
                              pxPerMs={pxPerMs}
                              onPress={onPressItem}
                              onMove={onMoveItem}
                              onDragState={setDragging}
                            />
                          );
                        })}
                      </View>
                    );
                  });
                })()}
              </View>
            </ScrollView>

            {/* fixed playhead, the content scrolls underneath it */}
            <View pointerEvents="none" style={[styles.playhead, { left: viewW / 2 - 1 }]} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The time axis always runs left-to-right, even in Arabic (RTL) layouts.
  root: { flex: 1, backgroundColor: colors.surface, direction: 'ltr' },
  label: { alignItems: 'center', justifyContent: 'center' },
  row: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tickText: { color: colors.textMuted, fontSize: 9, marginLeft: 2 },
  tick: { width: StyleSheet.hairlineWidth, height: 8, backgroundColor: colors.textMuted },
  block: { position: 'absolute', borderRadius: radius.sm, paddingHorizontal: 6, justifyContent: 'center', overflow: 'hidden' },
  blockSelected: { borderWidth: 2, borderColor: '#FFFFFF' },
  blockText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  blockTextOnThumb: { textShadowColor: '#000', textShadowRadius: 3 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF' },
});
