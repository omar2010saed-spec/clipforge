import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Project } from '@/types';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDate, formatDuration } from '@/utils/format';
import { projectClipCount, projectDurationMs } from '@/models/project';
import { getLanguage, localeTag, t } from '@/i18n';

interface Props {
  project: Project;
  width: number;
  onPress: (project: Project) => void;
  onMenu: (project: Project) => void;
}

export const ProjectCard = React.memo(function ProjectCard({ project, width, onPress, onMenu }: Props) {
  const lang = getLanguage();
  const thumbHeight = Math.round(width * 0.75);
  const ratio = project.width / project.height;

  return (
    <Pressable
      testID={`project-card-${project.id}`}
      style={[styles.card, { width }]}
      android_ripple={{ color: colors.border }}
      onPress={() => onPress(project)}
      onLongPress={() => onMenu(project)}
      accessibilityRole="button"
      accessibilityLabel={project.name}
    >
      <View style={[styles.thumb, { height: thumbHeight }]}>
        <View style={[styles.frame, { aspectRatio: ratio }]}>
          <Ionicons name="film-outline" size={28} color={colors.textMuted} />
        </View>
        <View style={styles.duration}>
          <Text style={styles.durationText}>{formatDuration(projectDurationMs(project))}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {formatDate(project.updatedAt, localeTag(lang))} · {t('clips', { count: projectClipCount(project) })}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => onMenu(project)}
          accessibilityRole="button"
          accessibilityLabel="menu"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    height: '78%',
    maxWidth: '85%',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    end: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  meta: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
