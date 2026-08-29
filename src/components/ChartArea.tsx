'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Pair = { id: string; label: string; symbol: string; decimals: number }

type Props = {
  section: 'market' | 'cashflow'
  chartSeries?: { time: string; value: number }[]
  chartYDomain?: [number | string, number | string]
  selectedMarket?: string
  marketPairs?: Pair[]
  chartLoading?: boolean
  primary?: string
  cashFlowData?: { day: string; moneyIn: number; moneyOut: number }[]
  totalIn?: number
  totalOut?: number
  lite?: boolean
}

export default function ChartArea({
  section,
  chartSeries = [],
  chartYDomain,
  selectedMarket = '',
  marketPairs = [],
  chartLoading = false,
  primary = '#D4A017',
  cashFlowData = [],
  totalIn = 0,
  totalOut = 0,
  lite = false,
}: Props) {
  const pair = marketPairs.find((p) => p.id === selectedMarket)
  const symbol = pair?.symbol || '$'
  const decimals = pair?.decimals ?? 4

  if (lite) {
    if (section === 'market') {
      const last = chartSeries[chartSeries.length - 1]
      return (
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-[#64748B]">Lite mode — chart paused</p>
          <p className="text-sm font-bold text-white">
            {symbol}
            {last ? last.value.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—'}
          </p>
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Money In</p>
          <p className="text-sm font-bold text-[#10B981]">+${totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Money Out</p>
          <p className="text-sm font-bold text-[#EF4444]">-${totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>
    )
  }

  if (section === 'market') {
    const gradientId = `cryptoMarketGradient_${section}`
    return (
      <div className="h-64 sm:h-72 w-full pt-2 relative">
        {chartLoading && chartSeries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          {chartSeries.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-xs text-[#64748B]">Loading live market data…</p>
            </div>
          ) : (
            <AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={primary} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} dy={5} minTickGap={40} />
              <YAxis
                domain={chartYDomain}
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${symbol}${val.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                width={70}
              />
              <Tooltip
                cursor={{ stroke: '#3B82F6', strokeDasharray: '4 4', strokeWidth: 1.5 }}
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#191B21] border border-white/10 p-3 rounded-xl shadow-2xl">
                        <p className="font-bold text-white text-sm">{symbol}{(payload[0].value)?.toLocaleString(undefined, { maximumFractionDigits: decimals })}</p>
                        <p className="text-[10px] text-[#94A3B8] mt-0.5">{pair?.label} · {payload[0].payload.time}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={primary}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 6, fill: primary, stroke: '#ffffff', strokeWidth: 2 }}
                animationDuration={400}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    )
  }

  const inflowGradId = `inflowGradient_${section}`
  const outflowGradId = `outflowGradient_${section}`

  return (
    <div className="h-52 w-full pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={inflowGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id={outflowGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            cursor={{ stroke: '#3B82F6', strokeDasharray: '4 4' }}
            content={({ active, payload }: any) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-[#191B21] border border-white/10 p-3 rounded-xl shadow-2xl">
                    <p className="text-xs font-bold text-white mb-1.5">{payload[0]?.payload?.day}</p>
                    <p className="text-xs text-[#10B981] font-semibold">Money In: +${payload[0]?.value}</p>
                    <p className="text-xs text-[#EF4444] font-semibold mt-0.5">Money Out: -${payload[1]?.value}</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Area type="monotone" dataKey="moneyIn" stroke="#10B981" strokeWidth={2.5} fill={`url(#${inflowGradId})`} isAnimationActive={false} />
          <Area type="monotone" dataKey="moneyOut" stroke="#EF4444" strokeWidth={2.5} fill={`url(#${outflowGradId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}