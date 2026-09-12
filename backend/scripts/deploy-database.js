#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

function run(command, args) {
  console.log(`[db] ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', env: process.env });
}

const production = process.env.NODE_ENV === 'production';
if (production) {
  // Production must use reviewed, immutable migrations. `db push --accept-data-loss`
  // can silently reshape a live financial schema and is never an acceptable
  // deployment mechanism.
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy']);
} else {
  // Local development may synchronize the schema, but destructive changes are
  // not accepted implicitly and every failure stops startup.
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'db', 'push', '--skip-generate']);
}

run(process.execPath, ['scripts/apply-data-migrations.js']);
