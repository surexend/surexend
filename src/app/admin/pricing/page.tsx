'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { Search, RefreshCw, Check, X, TrendingUp, TrendingDown, BadgePercent, Loader2, Power } from 'lucide-react'
import toast from 'react-hot-toast'

const NETWORK_COLORS: Record<string, string> = {
  MTN: '#FBBF24',
  GLO: '#34D399',
  AIRTEL: '#F87171',
  '9MOBILE': '#A3E635',
}

export default function AdminPricingPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeNet, setActiveNet] = useState<string>('MTN')
  const [search, setSearch] = useState('')

  // Editable sell-price overrides keyed "provider:planCode"
  const [edits, setEdits] = useState<Record<string, string>>({})
  // Airtime markup % per provider
  const [airtimeMarkup, setAirtimeMarkup] = useState<Record<string, string>>({})
  // Data network auto-margin % per provider
  const [dataMargin, setDataMargin] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminAPI.getPricing()
      .then((d) => {
        setData(d)
        const am: Record<string, string> = {}
        d.airtime?.forEach((a: any) => { am[a.provider] = String(a.markupPercent ?? 0) })
        setAirtimeMarkup(am)
        const dm: Record<string, string> = {}
        d.data?.forEach((x: any) => { dm[x.provider] = String(x.marginPct ?? 0) })
        setDataMargin(dm)
      })
      .catch(() => { setData(null); toast.error('Failed to load pricing') })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const active = useMemo(() => data?.data?.find((x: any) => x.provider === activeNet), [data, activeNet])

  const filteredPlans = useMemo(() => {
    if (!active) return []
    const q = search.toLowerCase()
    return active.plans.filter((p: any) =>
      !q || (p.name || '').toLowerCase().includes(q) || (p.validity || '').toLowerCase().includes(q))
  }, [active, search])

  const fmt = (n: number) => Number(n || 0).toLocaleString()

  const saveAirtime = async (provider: string) => {
    const pct = Math.max(0, Number(airtimeMarkup[provider]) || 0)
    setSavingKey(`airtime:${provider}`)
    try {
      await adminAPI.setAirtimePricing(provider, pct)
      toast.success(`${provider} airtime markup set to ${pct}%`)
      load()
    } catch { toast.error('Failed to save airtime markup') } finally { setSavingKey(null) }
  }

  const saveDataMargin = async (provider: string) => {
    const pct = Math.max(0, Number(dataMargin[provider]) || 0)
    setSavingKey(`margin:${provider}`)
    try {
      await adminAPI.setDataMargin(provider, pct)
      toast.success(`${provider} auto margin set to ${pct}%`)
      load()
    } catch { toast.error('Failed to save auto margin') } finally { setSavingKey(null) }
  }

  const savePlan = async (provider: string, planCode: string, value: string) => {
    const parsed = Number(value)
    setSavingKey(`${provider}:${planCode}`)
    try {
      if (value.trim() === '' || !isFinite(parsed) || parsed <= 0) {
        await adminAPI.setDataPlanPrice(provider, planCode, null)
        toast.success('Plan reset to automatic pricing')
      } else {
        await adminAPI.setDataPlanPrice(provider, planCode, parsed)
        toast.success('Plan price updated')
      }
      setEdits((e) => { const n = { ...e }; delete n[`${provider}:${planCode}`]; return n })
      load()
    } catch { toast.error('Failed to save plan price') } finally { setSavingKey(null) }
  }

  const toggleBills = async () => {
    const next = !data?.billsEnabled
    setSavingKey('bills')
    try {
      await adminAPI.setBillsEnabled(next)
      toast.success(next ? 'Bills & VTU are LIVE' : 'Bills & VTU paused (users see a fun message)')
      load()
    } catch { toast.error('Failed to toggle bills') } finally { setSavingKey(null) }
  }

  const togglePlan = async (provider: string, planCode: string, disabled: boolean) => {
    setSavingKey(`toggle:${provider}:${planCode}`)
    try {
      await adminAPI.setDataPlanEnabled(provider, planCode, !disabled)
      toast.success(disabled ? 'Plan re-enabled' : 'Plan disabled — hidden from the app')
      load()
    } catch { toast.error('Failed to toggle plan') } finally { setSavingKey(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load pricing.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Service Pricing</h1>
          <p className="text-xs text-[#64748B] mt-0.5">Set your sell price per service. The app always sells at YOUR price.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Global bills / VTU kill switch ── */}
      <section className="liquid-glass p-5 relative overflow-hidden flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${data.billsEnabled ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
            <Power className={`w-5 h-5 ${data.billsEnabled ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Bills &amp; VTU {data.billsEnabled ? 'LIVE' : 'PAUSED'}</p>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              {data.billsEnabled
                ? 'Users can buy airtime & data right now.'
                : 'Paused — the app shows a fun "bills are napping" message.'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleBills}
          disabled={savingKey === 'bills'}
          className="px-4 py-2 rounded-xl text-xs font-bold text-black disabled:opacity-50 flex items-center gap-1.5"
          style={{ background: data.billsEnabled ? 'linear-gradient(135deg, #EF4444, #EF4444CC)' : 'linear-gradient(135deg, #10B981, #10B981CC)', color: data.billsEnabled ? '#fff' : '#052014' }}
        >
          {savingKey === 'bills' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {data.billsEnabled ? 'Pause all bills' : 'Go live'}
        </button>
      </section>

      {/* ── Airtime ── */}
      <section className="liquid-glass p-5 relative overflow-hidden">
        <h3 className="font-semibold text-sm text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Airtime
        </h3>
        <p className="text-[11px] text-[#64748B] mb-4">Markup % is added on top of the face value your customers enter. Example: 5% markup → a ₦100 top-up sells for ₦105.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.airtime.map((a: any) => {
            const pct = Math.max(0, Number(airtimeMarkup[a.provider]) || 0)
            const sampleSell = Math.round(100 * (1 + pct / 100))
            return (
              <div key={a.provider} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black"
                      style={{ background: `${NETWORK_COLORS[a.provider] || '#94A3B8'}22`, color: NETWORK_COLORS[a.provider] || '#94A3B8' }}>
                      {a.provider.slice(0, 3)}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm">{a.name}</p>
                      <p className="text-[10px] text-[#64748B]">Service cost: {a.costPercent}% of face value</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[#94A3B8]">
                    ₦100 → ₦{sampleSell}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number" min={0} step={0.5}
                    value={airtimeMarkup[a.provider] ?? '0'}
                    onChange={(e) => setAirtimeMarkup((m) => ({ ...m, [a.provider]: e.target.value }))}
                    placeholder="Markup %"
                    className="flex-1 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  />
                  <button
                    onClick={() => saveAirtime(a.provider)}
                    disabled={savingKey === `airtime:${a.provider}`}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-black disabled:opacity-50 flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #D4A017, #D4A017CC)' }}
                  >
                    {savingKey === `airtime:${a.provider}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Data ── */}
      <section className="liquid-glass p-5 relative overflow-hidden">
        <h3 className="font-semibold text-sm text-white mb-1 flex items-center gap-2">
          <BadgePercent className="w-4 h-4 text-amber-400" /> Data Bundles
        </h3>
        <p className="text-[11px] text-[#64748B] mb-4">
          Per-network auto margin applies to every plan. You can also set an exact sell price per plan (overrides the margin). Reset clears the override.
        </p>

        {/* Network tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {data.data.map((x: any) => (
            <button
              key={x.provider}
              onClick={() => { setActiveNet(x.provider); setSearch('') }}
              className="px-4 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
              style={activeNet === x.provider
                ? { background: `${NETWORK_COLORS[x.provider]}22`, color: NETWORK_COLORS[x.provider], border: `1px solid ${NETWORK_COLORS[x.provider]}55` }
                : { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {x.name}
            </button>
          ))}
        </div>

        {active && (
          <>
            {/* Auto margin control */}
            <div className="flex items-center gap-2 mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
              <span className="text-xs text-[#94A3B8] flex-shrink-0">Auto margin % (all plans):</span>
              <input
                type="number" min={0} step={0.5}
                value={dataMargin[active.provider] ?? '0'}
                onChange={(e) => setDataMargin((m) => ({ ...m, [active.provider]: e.target.value }))}
                className="w-24 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
              <button
                onClick={() => saveDataMargin(active.provider)}
                disabled={savingKey === `margin:${active.provider}`}
                className="px-4 py-2 rounded-xl text-xs font-bold text-black disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #D4A017, #D4A017CC)' }}
              >
                {savingKey === `margin:${active.provider}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Apply to all
              </button>
              <div className="ml-auto relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search plans…"
                  className="pl-9 pr-3 py-2 rounded-xl bg-[#0F1629] border border-white/10 text-xs text-white outline-none focus:border-white/30 w-48"
                />
              </div>
            </div>

            {/* Plans table */}
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-white/[0.03]">
                  <tr className="text-[#64748B] text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Service cost</th>
                    <th className="py-3 px-4">Your sell price</th>
                    <th className="py-3 px-4">Profit</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((p: any) => {
                    const key = `${active.provider}:${p.code}`
                    const hasOverride = edits[key] !== undefined || p.amount !== p.costPrice
                    const sellInput = edits[key] ?? (hasOverride ? String(p.amount) : '')
                    const isSaving = savingKey === key
                    const isCustom = hasOverride && !edits[key]
                    const profit = (Number(edits[key]) || p.amount) - p.costPrice
                    return (
                      <tr key={p.code} className="border-t border-white/5">
                        <td className="py-2.5 px-4">
                          <p className="text-white font-semibold flex items-center gap-2">
                            {p.name}
                            {p.disabled && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/25 font-bold">disabled</span>
                            )}
                          </p>
                          <p className="text-[10px] text-[#64748B]">{p.validity} · {p.planType?.replace(/_/g, ' ')}</p>
                        </td>
                        <td className="py-2.5 px-4 text-[#94A3B8]">
                          <span className="inline-flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-emerald-400" /> ₦{fmt(p.costPrice)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#64748B]">₦</span>
                            <input
                              type="number" min={0}
                              value={sellInput}
                              onChange={(e) => setEdits((m) => ({ ...m, [key]: e.target.value }))}
                              placeholder={String(p.amount)}
                              className="w-24 bg-[#0F1629] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-400/50"
                            />
                            {isCustom && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">custom</span>}
                          </div>
                        </td>
                        <td className={`py-2.5 px-4 font-bold ${profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-[#64748B]'}`}>
                          {profit > 0 ? '+' : ''}₦{fmt(profit)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => togglePlan(active.provider, p.code, !!p.disabled)}
                              disabled={isSaving || savingKey === `toggle:${active.provider}:${p.code}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all border"
                              style={p.disabled
                                ? { background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.35)' }
                                : { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                              {savingKey === `toggle:${active.provider}:${p.code}` ? <Loader2 className="w-3 h-3 animate-spin" /> : p.disabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {p.disabled ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              onClick={() => savePlan(active.provider, p.code, sellInput)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all"
                              style={sellInput.trim() === ''
                                ? { background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }
                                : { background: 'linear-gradient(135deg, #D4A017, #D4A017CC)', color: '#0D0D0D' }}
                            >
                              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : sellInput.trim() === '' ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                              {sellInput.trim() === '' ? 'Reset' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredPlans.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-[#64748B]">No plans match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[#64748B] mt-3">Tip: leave a sell price blank and press Reset to go back to automatic pricing (cost or network margin).</p>
          </>
        )}
      </section>
    </div>
  )
}