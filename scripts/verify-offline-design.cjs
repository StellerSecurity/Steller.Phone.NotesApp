'use strict';
// Validate the actual packaged design resources without installing or loading dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, process.argv[2] || 'www');
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
assert(!/fonts\.(googleapis|gstatic)\.com/i.test(html), 'Remote Google Fonts reference in output');
assert(!/<link\b[^>]*href=["'](?:https?:)?\/\//i.test(html), 'Remote link resource in output');
const styles = fs.readdirSync(output).filter(name => name.endsWith('.css'));
assert(styles.length, 'Missing built stylesheets');
const css = styles.map(name => fs.readFileSync(path.join(output, name), 'utf8')).join('\n');
assert(!/url\(\s*["']?(?:https?:)?\/\//i.test(css), 'Remote resource in built stylesheet');
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/fonts/poppins/provenance.json'), 'utf8'));
assert.equal(provenance.files.filter(file => file.name.endsWith('.ttf')).length, 18);
for (const file of provenance.files) {
  const bytes = fs.readFileSync(path.join(output, 'assets/fonts/poppins', file.name));
  assert.equal(bytes.length, file.bytes, file.name);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256, file.name);
  if (file.name.endsWith('.ttf')) assert(css.includes('/assets/fonts/poppins/' + file.name), 'Unreferenced font: ' + file.name);
}
assert(fs.statSync(path.join(output, 'assets/Company-Logo-blue.png')).size > 0, 'Missing offline logo');
console.log('PASS: built styles have no remote resources; all 18 local fonts, license and logo are packaged.');
