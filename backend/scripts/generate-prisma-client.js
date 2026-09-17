#!/usr/bin/env node

/**
 * Generate the Rust-free Prisma Client without downloading unused native
 * engines. Prisma 6.15 still asks the CLI to resolve Rust engines during
 * `generate`, even when the schema uses engineType=client; pointing those
 * resolution checks at the current Node executable keeps generation offline.
 * The generated application client uses @prisma/adapter-pg and never loads
 * these placeholders at runtime.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const prismaBin = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
const env = {
  ...process.env,
  PRISMA_QUERY_ENGINE_LIBRARY: process.env.PRISMA_QUERY_ENGINE_LIBRARY || process.execPath,
  PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY || process.execPath,
};
const result = spawnSync(process.execPath, [prismaBin, 'generate'], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
