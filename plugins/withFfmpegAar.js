/**
 * Expo config plugin: makes the self-built FFmpegKit engine available to Gradle.
 *
 * ffmpeg-kit's official Maven binaries were removed, so CI builds the AAR itself
 * (.github/workflows/build-ffmpeg.yml) and `scripts/make-local-maven.js` turns it into
 * `vendor/maven`. When that folder exists this plugin adds it as a Maven repository and
 * selects the "min" package name. Without it the plugin does nothing.
 */
const fs = require('fs');
const path = require('path');
const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withFfmpegAar(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const repo = path.join(cfg.modRequest.projectRoot, 'vendor', 'maven');
    if (!fs.existsSync(repo)) return cfg;
    const marker = '// ffmpeg-kit-local';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    cfg.modResults.contents += `
${marker}
ext { ffmpegKitPackage = "min" }
allprojects {
  repositories {
    maven { url = uri("file://${repo.replace(/\\/g, '/')}") }
  }
}
`;
    return cfg;
  });
};
