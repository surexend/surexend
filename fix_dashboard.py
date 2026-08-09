with open(r'src\app\app\dashboard\page.tsx', 'r', encoding='utf-8-sig') as f:
    lines = f.readlines()

print(f'Total lines: {len(lines)}')

# Find the broken section - look for the characteristic garbled line
for i, line in enumerate(lines):
    if 'glass-card w-[94vw] max-w-md max-h-[85vh]' in line and i < 730:
        print(f'Found broken glass-card at line {i+1}: {repr(line[:80])}')
    if 'Option 2: Crypto Wallet' in line:
        print(f'Option 2 at line {i+1}: {repr(line[:80])}')

# Print lines 695-715 for context
print('\n--- Lines 695-720 ---')
for i in range(694, 720):
    if i < len(lines):
        print(f'{i+1}: {repr(lines[i][:100])}')
