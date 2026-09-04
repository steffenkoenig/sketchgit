import { execFileSync } from 'child_process';

try {
  console.info('Running license check on production dependencies...');
  execFileSync(
    'npx',
    [
      'license-checker-rseidelsohn',
      '--production',
      '--excludePrivatePackages',
      // elkjs (EPL-2.0) is a transitive dev-only dependency of @prisma/studio-core
      // (Prisma Studio's diagram layout engine) — never shipped in the app bundle.
      // --production doesn't cleanly exclude it because npm hoists it into the
      // same node_modules tree, so it's excluded here by name instead of widening
      // the allowed-license list.
      '--excludePackages',
      'elkjs',
      '--onlyAllow',
      'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;Unlicense;0BSD;LGPL-2.1;LGPL-3.0-or-later;BlueOak-1.0.0;MPL-2.0;Python-2.0;CC-BY-4.0;OFL-1.1'
    ],
    { encoding: 'utf-8', stdio: 'inherit', shell: false }
  );
  console.info('License check completed successfully.');
} catch (error) {
  console.error('License check failed:', error.message);
  process.exit(1);
}
