'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { bankAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Trash2, Loader2, Rocket, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function BankAccountsPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [banks, setBanks] = useState<any[]>([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    try {
      const data = await bankAPI.list()
      setAccounts(Array.isArray(data) ? data : data?.accounts || [])
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    bankAPI.getBanks('NG').then((b: any) => setBanks(Array.isArray(b) ? b : b?.banks || [])).catch(() => {})
  }, [])

  const add = async () => {
    if (!bankCode || accountNumber.length < 10) return toast.error('Choose a bank and enter a valid account number')
    setAdding(true)
    try {
      await bankAPI.add({ bankCode, accountNumber, country: 'NG' })
      toast.success('Bank account added')
      setShowAdd(false)
      setBankCode(''); setAccountNumber('')
      load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not add bank account')
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await bankAPI.remove(id)
      toast.success('Bank account removed')
      load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not remove bank account')
    }
  }

  return (
    <div className="w-full max-w-full px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      {/* Fun mainnet notice */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 border border-white/10 bg-gradient-to-r from-[rgba(212,160,23,0.12)] via-[rgba(255,215,0,0.05)] to-[rgba(34,197,94,0.08)] flex items-start gap-3 mb-4"
      >
        <div className="w-10 h-10 rounded-xl bg-[rgba(212,160,23,0.15)] border border-[rgba(212,160,23,0.35)] flex items-center justify-center flex-shrink-0">
          <Rocket className="w-5 h-5 text-[#FFD966]" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Bank payouts land on the mainnet soon</p>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-1">
            Naira withdrawals are being migrated on-chain for instant, bank-grade settlement. Your saved accounts come along automatically — no re-entry needed.
          </p>
        </div>
      </motion.div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white">Saved bank accounts ({accounts.length})</h2>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-black shadow-lg transition-all active:scale-95"
          style={{ background: colors.gradientBg }}
        >
          <Plus className="w-3.5 h-3.5" /> Add account
        </button>
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="liquid-glass rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Bank</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="mt-1 w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none"
            >
              <option value="" disabled className="bg-[#0A0B0F]">Select bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code} className="bg-[#0A0B0F]">{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Account number</label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="10-digit account number"
              className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[rgba(212,160,23,0.5)] transition-colors"
            />
          </div>
          <button
            onClick={add}
            disabled={adding}
            className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: colors.gradientBg }}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {adding ? 'Verifying…' : 'Verify & add'}
          </button>
        </motion.div>
      )}

      <div className="space-y-2.5">
        {loading ? (
          <p className="text-center text-sm text-[#64748B] py-8">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass rounded-2xl p-6 text-center">
            <Building2 className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
            <p className="text-sm text-[#94A3B8]">No bank accounts yet.</p>
            <p className="text-[11px] text-[#64748B] mt-1">Add one above to withdraw to your local bank.</p>
          </motion.div>
        ) : (
          accounts.map((acc) => (
            <motion.div key={acc.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5" style={{ color: colors.primary }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{acc.bankName || 'Bank account'}</p>
                <p className="text-[11px] text-[#94A3B8] font-mono truncate">
                  {acc.accountNumber} • {acc.accountName || 'Verified'}
                </p>
              </div>
              {acc.isDefault && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: colors.primary, border: `1px solid rgba(${accentRgb}, 0.4)`, background: `rgba(${accentRgb}, 0.1)` }}>
                  DEFAULT
                </span>
              )}
              <button onClick={() => remove(acc.id)} className="text-[#64748B] hover:text-red-400 transition-colors p-2" aria-label="Remove bank">
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}