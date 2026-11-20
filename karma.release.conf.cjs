'use strict';
module.exports = config => {
  require('./karma.conf.js')(config);
  config.set({
    browsers: ['ChromeHeadless'], singleRun: true, autoWatch: false,
    reporters: ['dots', 'notes-release'],
    plugins: [...config.plugins, require('./scripts/release-tests/reporter.cjs')],
    files: [...(config.files || []),
      ...(process.env.STELLAR_RELEASE_UI === '1' ? [
        { pattern: 'www/**/*', included: false, served: true, watched: false },
        { pattern: 'local/release-ui/**/*', included: false, served: true, watched: false }
      ] : [])
    ],
    client: { ...config.client, jasmine: { random: false }, clearContext: true },
    browserNoActivityTimeout: 60000
  });
};
