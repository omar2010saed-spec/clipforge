import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Project } from '@/types';
import { useProjectsStore } from '@/store/projectsStore';
import { ProjectCard } from '@/components/ProjectCard';
import { ProjectFormModal } from '@/components/ProjectFormModal';
import { ProjectActionsSheet } from '@/components/ProjectActionsSheet';
import { EmptyState } from '@/components/EmptyState';
import { colors, radius, spacing } from '@/theme/colors';
import { getLanguage, setLanguage, t } from '@/i18n';
import type { AspectKey } from '@/models/project';

const GAP = spacing.md;
const MIN_CARD_WIDTH = 160;

type FormState = { mode: 'create' | 'rename'; project: Project | null } | null;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const projects = useProjectsStore((s) => s.projects);
  const status = useProjectsStore((s) => s.status);
  const error = useProjectsStore((s) => s.error);
  const load = useProjectsStore((s) => s.load);
  const create = useProjectsStore((s) => s.create);
  const rename = useProjectsStore((s) => s.rename);
  const duplicate = useProjectsStore((s) => s.duplicate);
  const remove = useProjectsStore((s) => s.remove);

  const [form, setForm] = useState<FormState>(null);
  const [menuProject, setMenuProject] = useState<Project | null>(null);

  // reload whenever the screen is focused (e.g. coming back from the editor)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Responsive grid: the column count follows the window width, so rotating
  // the device re-flows the layout automatically.
  const horizontalPadding = spacing.lg;
  const columns = Math.max(
    1,
    Math.floor((width - horizontalPadding * 2 + GAP) / (MIN_CARD_WIDTH + GAP)),
  );
  const cardWidth = Math.floor((width - horizontalPadding * 2 - GAP * (columns - 1)) / columns);

  const openProject = useCallback(
    (p: Project) => router.push({ pathname: '/editor/[id]', params: { id: p.id } }),
    [router],
  );

  const handleCreate = useCallback(
    async (name: string, aspect: AspectKey) => {
      setForm(null);
      const project = await create(name, aspect);
      if (project) openProject(project);
    },
    [create, openProject],
  );

  const handleSubmit = useCallback(
    (name: string, aspect: AspectKey) => {
      if (!form) return;
      if (form.mode === 'create') {
        void handleCreate(name, aspect);
      } else if (form.project) {
        const id = form.project.id;
        setForm(null);
        void rename(id, name);
      }
    },
    [form, handleCreate, rename],
  );

  const confirmDelete = useCallback(
    (p: Project) => {
      setMenuProject(null);
      Alert.alert(t('deleteTitle'), t('deleteMessage', { name: p.name }), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => void remove(p.id) },
      ]);
    },
    [remove],
  );

  const toggleLanguage = useCallback(() => {
    const needsRestart = setLanguage(getLanguage() === 'ar' ? 'en' : 'ar');
    Alert.alert(t('restartTitle'), t('restartMessage'));
    if (!needsRestart) void load();
  }, [load]);

  const defaultName = useMemo(() => `${t('untitled')} ${projects.length + 1}`, [projects.length]);

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <ProjectCard project={item} width={cardWidth} onPress={openProject} onMenu={setMenuProject} />
    ),
    [cardWidth, openProject],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <Text style={styles.title}>{t('myProjects')}</Text>
        <Pressable
          testID="language-toggle"
          hitSlop={10}
          onPress={toggleLanguage}
          accessibilityRole="button"
          accessibilityLabel="language"
        >
          <Ionicons name="language-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      {status === 'loading' && projects.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : status === 'error' && projects.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('errorTitle')}
            subtitle={error ?? undefined}
            actionLabel={t('retry')}
            onAction={() => void load()}
          />
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="film-outline" title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={projects}
          keyExtractor={(p) => p.id}
          numColumns={columns}
          renderItem={renderItem}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingBottom: insets.bottom + 120,
            gap: GAP,
          }}
          refreshing={status === 'loading'}
          onRefresh={() => void load()}
        />
      )}

      {error && projects.length > 0 ? <Text style={styles.toast}>{error}</Text> : null}

      <Pressable
        testID="new-project-button"
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => setForm({ mode: 'create', project: null })}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={24} color={colors.primaryText} />
        <Text style={styles.fabText}>{t('newProject')}</Text>
      </Pressable>

      <ProjectFormModal
        visible={form !== null}
        mode={form?.mode ?? 'create'}
        initialName={form?.mode === 'rename' ? (form.project?.name ?? '') : defaultName}
        onClose={() => setForm(null)}
        onSubmit={handleSubmit}
      />

      <ProjectActionsSheet
        project={menuProject}
        onClose={() => setMenuProject(null)}
        onRename={(p) => {
          setMenuProject(null);
          setForm({ mode: 'rename', project: p });
        }}
        onDuplicate={(p) => {
          setMenuProject(null);
          void duplicate(p.id);
        }}
        onDelete={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    end: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    elevation: 6,
  },
  fabText: { color: colors.primaryText, fontWeight: '700', fontSize: 15 },
  toast: {
    position: 'absolute',
    start: spacing.lg,
    bottom: 100,
    backgroundColor: colors.danger,
    color: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
