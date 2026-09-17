const { createPrismaClient } = require('./prisma-client');
const p = createPrismaClient();

const EMAIL = process.argv[2] || process.env.ADMIN_EMAIL;

if (!EMAIL) {
  console.error('Usage: node scripts/make-admin.js user@example.com')
  process.exit(1)
}

(async () => {
  const user = await p.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true } });
  if (!user) return console.log(`NO USER: ${EMAIL}`);
  await p.user.update({ where: { id: user.id }, data: { role: 'ADMIN' }, select: { id: true } });
  console.log(`Role ADMIN set for ${EMAIL} (was ${user.role || 'USER'})`);
  await p.$disconnect();
})();