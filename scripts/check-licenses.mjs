import { execSync } from 'child_process';

try {
  console.info('Running license check on production dependencies...');
  execSync(
    'npx license-checker-rseidelsohn --production --excludePrivatePackages --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;Unlicense;0BSD;LGPL-2.1;LGPL-3.0-or-later;BlueOak-1.0.0;MPL-2.0;Python-2.0;CC-BY-4.0"',
    { encoding: 'utf-8', stdio: 'inherit' }
  );
  console.info('License check completed successfully.');
} catch (error) {
  console.error('License check failed:', error.message);
  process.exit(1);
}
