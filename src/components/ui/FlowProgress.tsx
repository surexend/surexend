import { cn } from '@/lib/utils'

interface FlowProgressProps {
  steps: string[]
  current: number
  className?: string
}

export default function FlowProgress({ steps, current, className }: FlowProgressProps) {
  return (
    <div className={cn('rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4', className)}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((label, index) => {
          const stepNumber = index + 1
          const done = stepNumber < current
          const active = stepNumber === current
          return (
            <div key={label} className="flex min-w-max items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border px-2.5 py-1.5"
                style={active
                  ? { borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)' }
                  : done
                    ? { borderColor: 'rgba(16,185,129,0.28)', background: 'rgba(16,185,129,0.10)' }
                    : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <span className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold',
                  done ? 'bg-emerald-500 text-black' : active ? 'bg-white text-black' : 'bg-white/10 text-[#94A3B8]',
                )}>
                  {done ? '✓' : stepNumber}
                </span>
                <span className={cn(
                  'text-[11px] font-bold whitespace-nowrap',
                  active ? 'text-white' : done ? 'text-emerald-300' : 'text-[#64748B]',
                )}>
                  {label}
                </span>
              </div>
              {index < steps.length - 1 && <div className="h-px w-4 bg-white/10" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
