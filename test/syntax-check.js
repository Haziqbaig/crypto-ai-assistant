// Quick syntax check for all JS files (used in CI/local dev).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
let failed = false;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(dir, f)]);
    console.log('OK', f);
  } catch (e) {
    failed = true;
    console.error('FAIL', f, e.stderr?.toString() || e.message);
  }
}
process.exit(failed ? 1 : 0);
