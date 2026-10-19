#!/usr/bin/env node
/**
 * Turns the prebuilt FFmpegKit AAR into a tiny local Maven repository (vendor/maven) so that
 * `ffmpeg-kit-react-native` can resolve `com.arthenica:ffmpeg-kit-min:<version>` offline.
 * usage: node scripts/make-local-maven.js <path-to.aar>
 */
const fs = require('fs');
const path = require('path');

const aar = process.argv[2];
if (!aar || !fs.existsSync(aar)) {
  console.error('AAR not found:', aar);
  process.exit(1);
}
const root = process.cwd();
const props = fs.readFileSync(
  path.join(root, 'node_modules/ffmpeg-kit-react-native/android/gradle.properties'),
  'utf8'
);
const m = props.match(/ffmpegKit\.android\.main\.version\s*=\s*(\S+)/);
if (!m) {
  console.error('cannot read ffmpegKit.android.main.version');
  process.exit(1);
}
const version = m[1];
const artifact = 'ffmpeg-kit-min';
const dir = path.join(root, 'vendor/maven/com/arthenica', artifact, version);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(aar, path.join(dir, `${artifact}-${version}.aar`));
fs.writeFileSync(
  path.join(dir, `${artifact}-${version}.pom`),
  `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.arthenica</groupId>
  <artifactId>${artifact}</artifactId>
  <version>${version}</version>
  <packaging>aar</packaging>
  <dependencies>
    <dependency>
      <groupId>com.arthenica</groupId>
      <artifactId>smart-exception-java</artifactId>
      <version>0.2.1</version>
      <scope>compile</scope>
    </dependency>
  </dependencies>
</project>
`
);
console.log(`local maven ready: com.arthenica:${artifact}:${version}`);
