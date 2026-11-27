const { spawnSync } = require('node:child_process');
const { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const port = '8097';
const metroHost = `127.0.0.1:${port}`;
const bundleId = 'com.sevastian.cashflow';
const scenes = {
  budgets: 'cashflow:///',
  shared: 'cashflow:///?scope=shared',
  'shared-detail': 'cashflow:///budget-detail?cat=groceries&scope=shared',
  cycle: 'cashflow:///cycle',
  'budget-detail': 'cashflow:///budget-detail?cat=groceries',
  spending: 'cashflow:///where',
  activity: 'cashflow:///activity',
  people: 'cashflow:///people',
  map: 'cashflow:///map',
  trips: 'cashflow:///trips',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function simulator() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not read booted iOS simulators.');
  const { devices } = JSON.parse(result.stdout);
  const booted = Object.values(devices).flat();
  if (booted.length !== 1) throw new Error('Boot one iOS simulator or reuse the one already running.');
  return booted[0].udid;
}

const [action, value] = process.argv.slice(2);
if (action === 'metro') {
  const scenario = value ?? 'budgets';
  if (!['budgets', 'payday', 'nobank', 'empty', 'travel'].includes(scenario)) throw new Error('Use pnpm qa budgets, payday, nobank, empty or travel.');
  run('pnpm', ['exec', 'expo', 'start', '--localhost', '--port', port], {
    env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_CASHFLOW_QA: scenario },
  });
} else if (action === 'install') {
  const target = simulator();
  if (!existsSync('ios') || !readdirSync('ios').some((name) => name.endsWith('.xcodeproj'))) run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios']);
  const project = readdirSync('ios').find((name) => name.endsWith('.xcodeproj'));
  if (!project) throw new Error('No generated Xcode project in ios/.');
  const scheme = project.slice(0, -'.xcodeproj'.length);
  const workspace = `ios/${scheme}.xcworkspace`;
  if (!existsSync(workspace)) run('pod', ['install', '--project-directory=ios']);
  const derived = process.env.CASHFLOW_QA_DERIVED_DATA ?? '.expo/qa-ios';
  mkdirSync(derived, { recursive: true });
  const logPath = join(derived, 'build.log');
  const log = openSync(logPath, 'w');
  console.log(`Building Cashflow for the booted simulator. Log at ${logPath}`);
  try {
    run('xcodebuild', ['-workspace', workspace, '-scheme', scheme, '-configuration', 'Debug', '-destination', `id=${target}`,
      '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build'], { stdio: ['ignore', log, log] });
  } finally {
    closeSync(log);
  }
  const app = join(derived, 'Build', 'Products', 'Debug-iphonesimulator', `${scheme}.app`);
  writeFileSync(join(app, 'ip.txt'), `${metroHost}\n`);
  run('xcrun', ['simctl', 'install', target, app]);
} else if (action === 'open' && Object.hasOwn(scenes, value)) {
  const target = simulator();
  const app = spawnSync('xcrun', ['simctl', 'get_app_container', target, bundleId, 'app'], { encoding: 'utf8' });
  const marker = join(app.stdout?.trim() ?? '', 'ip.txt');
  if (app.status !== 0 || !existsSync(marker) || readFileSync(marker, 'utf8').trim() !== metroHost) {
    throw new Error('Install the simulator fixture app first with pnpm qa:install.');
  }
  const packager = spawnSync('curl', ['-fsS', '--max-time', '2', `http://${metroHost}/status`], { encoding: 'utf8' });
  if (packager.stdout?.trim() !== 'packager-status:running') throw new Error('Start fixture Metro with pnpm qa.');
  run('xcrun', ['simctl', 'openurl', target, scenes[value]]);
} else {
  throw new Error('Use pnpm qa, pnpm qa:install, or pnpm qa:open budgets|shared|budget-detail|shared-detail|cycle|spending|activity|people|map|trips.');
}
