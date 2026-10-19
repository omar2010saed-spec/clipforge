import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { colors } from '@/theme/colors';
import { applyDirection, t } from '@/i18n';
import { FONT_ASSETS } from '@/fonts/fonts';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  useEffect(() => {
    // Allow free rotation (portrait + landscape); layouts react to window size.
    ScreenOrientation.unlockAsync().catch((e) => console.warn('[orientation] unlock failed', e));

    // Keep native layout direction in sync with the chosen language.
    if (applyDirection()) {
      Alert.alert(t('restartTitle'), t('restartMessage'));
    }
  }, []);

  // Fonts are bundled, so this resolves almost instantly. If loading fails we still start
  // the app (text falls back to the system font).
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
