#!/usr/bin/env node
// Bump expo.version in app.json by a semver release type.
// Usage: node scripts/bump-version.cjs <patch|minor|major>
// On GitHub Actions, writes the new version to $GITHUB_OUTPUT as `version`.

const fs = require('fs');
const path = require('path');

const releaseType = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error(`Invalid release type: ${releaseType}. Use patch | minor | major.`);
  process.exit(1);
}

const appJsonPath = path.join(__dirname, '..', 'app.json');
const raw = fs.readFileSync(appJsonPath, 'utf8');
const config = JSON.parse(raw);

const current = config.expo && config.expo.version;
if (!current || !/^\d+\.\d+\.\d+$/.test(current)) {
  console.error(`expo.version must be semver (x.y.z); got: ${current}`);
  process.exit(1);
}

const [major, minor, patch] = current.split('.').map(Number);
const next =
  releaseType === 'major'
    ? `${major + 1}.0.0`
    : releaseType === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

config.expo.version = next;
// Preserve 2-space indentation + trailing newline.
fs.writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Bumped version: ${current} -> ${next} (${releaseType})`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `previous=${current}\n`);
}
