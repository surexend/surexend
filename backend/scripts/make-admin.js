const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const EMAIL = process.argv[2] || 'demo@surexend.com';

(async () => {
  const user = await p.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true } });
  if (!user) return console.log(`NO USER: ${EMAIL}`);
  await p.user.update({ where: { id: user.id }, data: { role: 'ADMIN' }, select: { id: true } });
  console.log(`Role ADMIN set for ${EMAIL} (was ${user.role || 'USER'})`);
  await p.$disconnect();
})();