'use strict';

// Use the installed CLI only, after applying the repository's security fixes.
const { harden } = require('./harden-dependencies.cjs');
harden();
if (process.argv[2] === 'telemetry') {
  console.log('Capacitor telemetry is disabled for this project.');
} else {
  require('../node_modules/@capacitor/cli/bin/capacitor');
}
