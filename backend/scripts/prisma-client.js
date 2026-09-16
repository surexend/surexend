// Shared Prisma Client factory for operator scripts.
// Prisma is generated with the Rust-free query compiler, so every runtime
// client must receive the PostgreSQL driver adapter rather than attempting to
// load a platform-specific Rust query engine.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function createPrismaClient(connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL) {
  if (!connectionString || !String(connectionString).trim()) {
    throw new Error('DATABASE_URL or DIRECT_URL is required before constructing PrismaClient.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: String(connectionString).trim() }),
  });
}

module.exports = { createPrismaClient };
