/**
 * OPTIONAL (untested) Expo config plugin.
 *
 * ffmpeg-kit's official binaries were removed from Maven, so the JS package
 * `ffmpeg-kit-react-native` can no longer resolve its native dependency.
 * If you place your own FFmpegKit AAR at `vendor/ffmpeg-kit.aar`, this plugin:
 *   - copies it to android/app/libs
 *   - adds a flatDir repository
 *   - substitutes every `com.arthenica:ffmpeg-kit-*` module with the local AAR
 * If the file does not exist the plugin does nothing, so the app still builds.
 */
const fs = require('fs');
const path = require('path');
const { withProjectBuildGradle, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');

const AAR = 'ffmpeg-kit.aar';

function hasAar(projectRoot) {
  return fs.existsSync(path.join(projectRoot, 'vendor', AAR));
}

module.exports = function withFfmpegAar(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      if (!hasAar(root)) return cfg;
      const libs = path.join(cfg.modRequest.platformProjectRoot, 'libs');
      fs.mkdirSync(libs, { recursive: true });
      fs.copyFileSync(path.join(root, 'vendor', AAR), path.join(libs, 'ffmpeg-kit-local-1.0.aar'));
      return cfg;
    },
  ]);

  config = withProjectBuildGradle(config, (cfg) => {
    if (!hasAar(cfg.modRequest.projectRoot)) return cfg;
    const marker = '// ffmpeg-kit-local';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    cfg.modResults.contents += `
${marker}
allprojects {
  repositories {
    flatDir { dirs "$rootDir/libs" }
  }
  configurations.all {
    resolutionStrategy.dependencySubstitution {
      all { DependencySubstitution dep ->
        def r = dep.requested
        if (r instanceof ModuleComponentSelector && r.group == 'com.arthenica') {
          dep.useTarget 'local:ffmpeg-kit-local:1.0'
        }
      }
    }
  }
}
`;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!hasAar(cfg.modRequest.projectRoot)) return cfg;
    const marker = '// ffmpeg-kit-local-deps';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    cfg.modResults.contents += `
${marker}
dependencies {
  implementation 'com.arthenica:smart-exception-java:0.2.1'
}
`;
    return cfg;
  });

  return config;
};
