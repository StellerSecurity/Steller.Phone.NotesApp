import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const appDelegatePath = resolve(projectRoot, 'ios/App/App/AppDelegate.swift');
const infoPlistPath = resolve(projectRoot, 'ios/App/App/Info.plist');

if (!existsSync(appDelegatePath) || !existsSync(infoPlistPath)) {
  process.exit(0);
}

let appDelegate = readFileSync(appDelegatePath, 'utf8');

if (!appDelegate.includes('import StellarBackgroundNotesSync')) {
  const importAnchor = 'import Capacitor';
  if (!appDelegate.includes(importAnchor)) {
    throw new Error('Unable to configure background sync: Capacitor import not found in AppDelegate.swift');
  }
  appDelegate = appDelegate.replace(importAnchor, `${importAnchor}\nimport StellarBackgroundNotesSync`);
}

if (!appDelegate.includes('BackgroundNotesSyncProcessor.register()')) {
  const didFinishPattern = /(func application\([^)]*didFinishLaunchingWithOptions[\s\S]*?\{)([\s\S]*?)(\n\s*return true)/;
  if (!didFinishPattern.test(appDelegate)) {
    throw new Error('Unable to configure background sync: launch handler not found in AppDelegate.swift');
  }
  appDelegate = appDelegate.replace(
    didFinishPattern,
    '$1$2\n        BackgroundNotesSyncProcessor.register()$3'
  );
}

writeFileSync(appDelegatePath, appDelegate);

let infoPlist = readFileSync(infoPlistPath, 'utf8');
const entries = [];

if (!infoPlist.includes('<key>BGTaskSchedulerPermittedIdentifiers</key>')) {
  entries.push(
    '\t<key>BGTaskSchedulerPermittedIdentifiers</key>\n' +
    '\t<array>\n' +
    '\t\t<string>steller.phone.notesapp.background-sync</string>\n' +
    '\t</array>'
  );
}

if (!infoPlist.includes('<key>UIBackgroundModes</key>')) {
  entries.push(
    '\t<key>UIBackgroundModes</key>\n' +
    '\t<array>\n' +
    '\t\t<string>fetch</string>\n' +
    '\t\t<string>processing</string>\n' +
    '\t</array>'
  );
}

if (entries.length > 0) {
  const closingTag = '</dict>';
  if (!infoPlist.includes(closingTag)) {
    throw new Error('Unable to configure background sync: malformed Info.plist');
  }
  infoPlist = infoPlist.replace(closingTag, `${entries.join('\n')}\n${closingTag}`);
  writeFileSync(infoPlistPath, infoPlist);
}

console.log('Configured Stellar Notes background sync.');
