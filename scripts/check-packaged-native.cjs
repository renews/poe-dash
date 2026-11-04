const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

if (process.versions.electron) {
  const packagedRequire = createRequire(path.join(process.argv[2], 'package.json'));
  assert.equal(typeof packagedRequire('uiohook-napi').uIOhook.start, 'function');
  assert.equal(typeof packagedRequire('bufferutil').mask, 'function');
  assert.equal(typeof packagedRequire('utf-8-validate'), 'function');
  console.log(`Packaged native modules load under Electron ${process.versions.electron}`);
} else {
  function findArchives(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.name === 'app.asar' ? [file] : entry.isDirectory() ? findArchives(file) : [];
    });
  }
  const archives = findArchives(path.resolve('release'));
  assert.ok(archives.length, 'Build a packaged application first');
  for (const archive of archives) {
    const result = spawnSync(require('electron'), [__filename, archive], {
      stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    assert.equal(result.status, 0, `Native module loading failed for ${archive}`);
  }
  const bundles = fs.readdirSync('dist-electron').filter(name => name.endsWith('.js'));
  const keyboard = bundles.find(name => name.startsWith('poeCopyKeyboard-'));
  assert.ok(keyboard, 'Keyboard bundle must exist');
  assert.match(fs.readFileSync(path.join('dist-electron', keyboard), 'utf8'), /from ["']uiohook-napi["']/);
}
