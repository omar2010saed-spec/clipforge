import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_ID = process.env.APP_ID ?? 'com.clipforge.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ClipForge',
  slug: 'clipforge',
  version: '0.1.0',
  scheme: 'clipforge',
  // "default" lets the OS rotate freely (Portrait + Landscape)
  orientation: 'default',
  userInterfaceStyle: 'dark',
  newArchEnabled: false,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0B0F',
  },
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: 'Record video and photos to use in your projects.',
      NSMicrophoneUsageDescription: 'Record video with sound.',
      NSPhotoLibraryUsageDescription: 'Import media from your library.',
      NSPhotoLibraryAddUsageDescription: 'Save exported videos to your library.',
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0B0F',
    },
    permissions: ['CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_VIDEO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_AUDIO'],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-localization',
    'expo-screen-orientation',
    [
      'expo-image-picker',
      {
        cameraPermission: 'Record video and photos to use in your projects.',
        microphonePermission: 'Record video with sound.',
        photosPermission: 'Import media from your library.',
      },
    ],
    ['expo-media-library', { savePhotosPermission: 'Save exported videos to your library.', isAccessMediaLocationEnabled: false }],
    [
      'expo-build-properties',
      {
        android: { minSdkVersion: 24, compileSdkVersion: 35, targetSdkVersion: 34 },
        ios: { deploymentTarget: '15.1' },
      },
    ],
    // Optional: wires vendor/ffmpeg-kit.aar into the Android build when the file exists.
    './plugins/withFfmpegAar.js',
  ],
});
