'use strict';

// Do not collect command arguments, signing passwords, errors or identifiers.
// Returning the action itself preserves its arguments, result and errors.
exports.THANK_YOU = 'Capacitor telemetry is disabled for this project.';
exports.telemetryAction = (_config, action) => action;
exports.sendMetric = async () => {};

exports.TELEMETRY_SAFE_CHOICES = {
  androidreleasetype: ['AAB', 'APK'],
  signingType: ['apksigner', 'jarsigner'],
  xcodeExportMethod: ['app-store-connect', 'release-testing', 'enterprise', 'debugging', 'developer-id', 'mac-application', 'validation'],
  xcodeSigningStyle: ['automatic', 'manual'],
};
