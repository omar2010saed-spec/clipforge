import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Chip({
  label,
  active,
  onPress,
  testID,
  style,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ToolButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.tool, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={styles.toolLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  disabled,
  label,
  size = 24,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  label: string;
  size?: number;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={[styles.iconBtn, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={size} color={colors.text} />
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Stepper({
  value,
  onDec,
  onInc,
  testID,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.stepper} testID={testID}>
      <Pressable onPress={onDec} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="-">
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onInc} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="+">
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

export function ColorSwatches({
  value,
  options,
  onChange,
  allowNone,
}: {
  value: string;
  options: string[];
  onChange: (c: string) => void;
  allowNone?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {allowNone ? (
        <Pressable
          onPress={() => onChange('transparent')}
          style={[styles.swatch, styles.swatchNone, value === 'transparent' && styles.swatchActive]}
          accessibilityRole="button"
          accessibilityLabel="none"
        >
          <Ionicons name="ban-outline" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {options.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          style={[styles.swatch, { backgroundColor: c }, value.toLowerCase() === c.toLowerCase() && styles.swatchActive]}
          accessibilityRole="button"
          accessibilityLabel={c}
        />
      ))}
    </ScrollView>
  );
}

export const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FFE600', '#FF3B30', '#FF9500', '#34C759',
  '#00C7BE', '#007AFF', '#7C5CFF', '#FF2D92', '#8E8E93',
];
export const BG_COLORS = ['#000000', 'rgba(0,0,0,0.65)', '#FFFFFF', '#FFE600', '#FF3B30', '#007AFF', '#7C5CFF'];

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.primaryText, fontWeight: '700' },
  tool: { width: 66, alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  toolLabel: { color: colors.text, fontSize: 11 },
  iconBtn: { padding: spacing.xs },
  sectionLabel: { color: colors.textMuted, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtn: { padding: spacing.sm, paddingHorizontal: spacing.md },
  stepValue: { color: colors.text, minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.border },
  swatchNone: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  swatchActive: { borderColor: colors.primary, borderWidth: 3 },
});
