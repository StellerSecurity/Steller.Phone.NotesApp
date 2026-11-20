'use strict';
const fs = require('node:fs');
const path = require('node:path');
function NotesReleaseReporter(baseReporterDecorator, config) {
  baseReporterDecorator(this);
  const cases = [];
  this.onSpecComplete = (_browser, result) => cases.push({ name: [...result.suite, result.description].join(' > '), passed: !!result.success, skipped: !!result.skipped, failures: result.log || [] });
  this.onRunComplete = (_browsers, result) => {
    const folder = process.env.STELLAR_TEST_REPORT_DIR || path.join(__dirname, '../../test-results');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'mobile-integration.json'), JSON.stringify({ suite: 'Mobile integration and shipping UI', passed: !result.failed && !result.error && !result.disconnected, ...result, cases }, null, 2) + '\n');
  };
}
NotesReleaseReporter.$inject = ['baseReporterDecorator', 'config'];
module.exports = { 'reporter:notes-release': ['type', NotesReleaseReporter] };
