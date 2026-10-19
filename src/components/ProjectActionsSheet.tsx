import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Project } from '@/types';
import { BottomSheet } from './BottomSheet';
import { colors, radius, spacing } from '@/theme/colors';
import { t } from '@/i18n';

interface Props {
  project: Project | null;
  onClose: () => void;
  onRename: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectActionsSheet({ project, onClose, onRename, onDuplicate, onDelete }: Props) {
  const rows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; danger?: boolean; run: (p: Project) => void }[] = [
    { icon: 'create-outline', label: t('rename'), run: onRename },
    { icon: 'copy-outline', label: t('duplicate'), run: onDuplicate },
    { icon: 'trash-outline', label: t('delete'), danger: true, run: onDelete },
  ];

  return (
    <BottomSheet visible={project !== null} onClose={onClose}>
      {project ? <Text style={styles.title} numberOfLines={1}>{project.name}</Text> : null}
      {rows.map((r) => (
        <Pressable
          key={r.label}
          style={styles.row}
          onPress={() => project && r.run(project)}
          accessibilityRole="button"
        >
          <Ionicons name={r.icon} size={22} color={r.danger ? colors.danger : colors.text} />
          <Text style={[styles.rowText, r.danger && { color: colors.danger }]}>{r.label}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
