const fs = require('fs')
const path = require('path')
const files = []
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(css|tsx?|jsx?)$/.test(e.name)) files.push(f) } }
walk(path.resolve('src/app')); walk(path.resolve('src/components'))
const rules = [
  /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/, 
  /document\.body\.style\.height\s*=\s*['"]100vh['"]/, 
  /document\.addEventListener\(\s*['"]touch(end|move)['"][\s\S]{0,200}preventDefault/,
]
const failures = []
for (const file of files) { const source = fs.readFileSync(file, 'utf8'); if (rules.some(r => r.test(source))) failures.push(path.relative(process.cwd(), file)) }
const appLayout = fs.readFileSync(path.resolve('src/app/app/layout.tsx'), 'utf8')
if (/className="[^"]*h-dvh-force[^"]*overflow-hidden/.test(appLayout)) failures.push('src/app/app/layout.tsx: mobile app shell must use document scrolling')
if (failures.length) { console.error('Mobile safety check failed:\n' + failures.join('\n')); process.exit(1) }
console.log(`Mobile safety check passed (${files.length} files scanned).`)
