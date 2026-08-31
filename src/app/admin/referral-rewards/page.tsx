'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Gift, RefreshCw, Send, WalletCards } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI, type AdminApprovalPayload } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import AdminStepUpModal from '@/components/admin/AdminStepUpModal'

const STATUS_OPTIONS = ['', 'ELIGIBLE', 'PENDING', 'PAID', 'FAILED']

function statusClass(status: string) {
  if (status === 'PAID') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (status === 'ELIGIBLE') return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  if (status === 'FAILED') return 'bg-red-500/10 text-red-400 border-red-500/20'
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
}

export default function AdminReferralRewardsPage() {
  const [walletData, setWalletData] = useState<any>(null)
  const [rewardsData, setRewardsData] = useState<any>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalTitle, setApprovalTitle] = useState('Authorize campaign action')
  const [approvalDescription, setApprovalDescription] = useState('Confirm this sensitive campaign action with your PIN or biometric.')
  const [approvalLabel, setApprovalLabel] = useState('Continue')
  const [approvalLoading, setApprovalLoading] = useState(false)
  const pendingAction = useRef<((approval: AdminApprovalPayload) => Promise<void>) | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [wallet, rewards] = await Promise.all([
        adminAPI.getReferralRewardWallet(),
        adminAPI.getReferralRewards({ status: status || undefined, limit: 50 }),
      ])
      setWalletData(wallet)
      setRewardsData(rewards)
    } catch {
      setWalletData(null)
      setRewardsData(null)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  const requestApproval = (title: string, description: string, label: string, action: (approval: AdminApprovalPayload) => Promise<void>) => {
    setApprovalTitle(title)
    setApprovalDescription(description)
    setApprovalLabel(label)
    pendingAction.current = action
    setApprovalOpen(true)
  }

  const approve = async (approval: AdminApprovalPayload) => {
    if (!pendingAction.current) return
    setApprovalLoading(true)
    try {
      await pendingAction.current(approval)
      pendingAction.current = null
      setApprovalOpen(false)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Campaign action failed')
    } finally {
      setApprovalLoading(false)
    }
  }

  const copyAddress = async () => {
    if (!walletData?.wallet?.address) return
    try {
      await navigator.clipboard.writeText(walletData.wallet.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { toast.error('Could not copy the wallet address') }
  }

  const createWallet = () => requestApproval(
    'Create referral rewards wallet',
    'This creates a dedicated Circle Programmable Wallet for the five-referrals campaign. Fund it only from the Circle Console before paying rewards.',
    'Create Circle wallet',
    async (approval) => {
      await adminAPI.createReferralRewardWallet(approval)
      toast.success('Referral rewards wallet created')
      await load()
    },
  )

  const pay = (reward: any) => requestApproval(
    'Pay referral reward',
    `Send ${Number(reward.amount).toFixed(2)} ${reward.currency} from the campaign wallet to @${reward.user?.surexTag || reward.user?.email}. Circle will process the on-chain transfer; the reward is not booked until that transfer confirms.`,
    `Send ${Number(reward.amount).toFixed(2)} ${reward.currency}`,
    async (approval) => {
      const result = await adminAPI.payReferralReward(reward.id, approval)
      toast.success(`Payout submitted to Circle (${result.circleTransaction?.state || 'initiated'})`)
      await load()
    },
  )

  const refreshReward = (reward: any) => requestApproval(
    'Refresh payout status',
    'Check Circle for the latest state of this submitted referral reward.',
    'Check Circle status',
    async (approval) => {
      await adminAPI.refreshReferralReward(reward.id, approval)
      toast.success('Payout status refreshed')
      await load()
    },
  )

  const wallet = walletData?.wallet
  const campaign = walletData?.campaign || rewardsData?.campaign || { requiredReferrals: 5, reward: 5, currency: 'USDT' }

  if (loading && !walletData && !rewardsData) {
    return <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><p className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-amber-400">Growth campaign</p><h1 className="text-xl font-extrabold text-white mt-1">Invite 5, receive {campaign.reward} {campaign.currency}</h1><p className="text-xs text-[#64748B] mt-1">Eligibility is created once a customer has {campaign.requiredReferrals} active, attributed registrations. Every payment is initiated from the dedicated Circle wallet.</p></div>
        <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-white/[0.07] disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <section className="liquid-glass p-5 sm:p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0"><div className="flex items-center gap-2"><WalletCards className="w-5 h-5 text-amber-400" /><h2 className="font-bold text-white">Referral rewards wallet</h2></div><p className="text-xs text-[#94A3B8] mt-1">A separate Circle Programmable Wallet, isolated from customer balances.</p></div>
          {!wallet ? (
            <button onClick={createWallet} disabled={!walletData?.configured} className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50">Create Circle wallet</button>
          ) : <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-400">Circle wallet active</div>}
        </div>

        {!walletData?.configured ? (
          <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4"><p className="text-sm font-bold text-amber-300">Circle needs to be configured first</p><p className="text-xs text-[#FDE68A] mt-1 leading-relaxed">Add <code>CIRCLE_API_KEY</code> and <code>CIRCLE_ENTITY_SECRET</code> to the backend environment. SureXend creates and stores its referral wallet set automatically; <code>CIRCLE_WALLET_SET_ID</code> is optional when you already have one.</p></div>
        ) : !wallet ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-[#94A3B8]">Create the wallet once, then fund it with USDC in Circle Console. Before paying the promised USDT, provision at least the required USDT amount on this same wallet and supported blockchain.</div>
        ) : (
          <><div className="mt-5 grid md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">USDC treasury funding</p><p className="text-2xl font-black text-white mt-1">{wallet.usdcBalance == null ? 'Unavailable' : `$${Number(wallet.usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p><p className="text-[10px] text-[#64748B] mt-1">Funded through Circle</p></div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Available USDT payouts</p><p className="text-2xl font-black text-emerald-400 mt-1">{wallet.usdtBalance == null ? 'Unavailable' : `$${Number(wallet.usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>{wallet.balanceError ? <p className="text-[10px] text-amber-400 mt-1">Circle balance check unavailable</p> : <p className="text-[10px] text-[#64748B] mt-1">Required to send 5 USDT</p>}</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Blockchain</p><p className="text-sm font-bold text-white mt-2">{wallet.blockchain}</p><p className="text-[10px] text-[#64748B] mt-1">Wallet set: {wallet.walletSetId || '—'}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Circle wallet ID</p><p className="text-xs font-mono font-bold text-white mt-2 truncate">{wallet.circleWalletId}</p><p className="text-[10px] text-[#64748B] mt-1">Search this ID in Circle Console</p></div>
          </div>{!walletData?.payoutConfigured && <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200">USDT payouts are safely disabled. Set <code>CIRCLE_REFERRAL_REWARD_USDT_TOKEN_ADDRESS</code> to the verified USDT contract on the selected Circle chain.</div>}</>
        )}
        {wallet?.address && <button onClick={copyAddress} className="mt-3 w-full sm:w-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-[#CBD5E1] hover:bg-white/[0.05]"><span className="max-w-[250px] truncate">{wallet.address}</span>{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-sm font-bold text-white">Eligible and paid rewards</h2><p className="text-xs text-[#64748B] mt-0.5">{rewardsData ? `${rewardsData.total} campaign records` : 'Could not load reward records'}</p></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-white/10 bg-[#121419] px-3 py-2 text-xs font-semibold text-white outline-none">{STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option ? option[0] + option.slice(1).toLowerCase() : 'All statuses'}</option>)}</select></div>
        <div className="liquid-glass overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-[#64748B]"><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Reward</th><th className="px-4 py-3">Payout status</th><th className="px-4 py-3">Circle transaction</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{rewardsData?.rewards?.length ? rewardsData.rewards.map((reward: any) => <tr key={reward.id} className="border-b border-white/[0.05] last:border-0"><td className="px-4 py-3"><p className="font-semibold text-white">{reward.user?.firstName} {reward.user?.lastName}</p><p className="text-[10px] text-[#64748B]">@{reward.user?.surexTag || '—'} · {reward.user?.email}</p></td><td className="px-4 py-3 text-white">{reward.referralCount} / {reward.requiredReferrals} referrals</td><td className="px-4 py-3 font-bold text-emerald-400">${Number(reward.amount).toFixed(2)} {reward.currency}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(reward.status)}`}>{reward.status}</span>{reward.failureReason && <p className="max-w-[180px] truncate text-[10px] text-red-300 mt-1" title={reward.failureReason}>{reward.failureReason}</p>}</td><td className="px-4 py-3"><p className="font-mono text-[10px] text-[#94A3B8]">{reward.circleTransactionId || 'Not submitted'}</p><p className="text-[10px] text-[#64748B]">{reward.paidAt ? `Paid ${formatDate(reward.paidAt)}` : `Eligible ${formatDate(reward.createdAt)}`}</p></td><td className="px-4 py-3">{['ELIGIBLE', 'FAILED'].includes(reward.status) ? <button onClick={() => pay(reward)} disabled={!wallet?.address || !walletData?.payoutConfigured || wallet.usdtBalance == null || Number(wallet.usdtBalance) < Number(reward.amount)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-2 text-[10px] font-bold text-black disabled:opacity-40"><Send className="w-3.5 h-3.5" /> {reward.status === 'FAILED' ? 'Retry' : 'Pay'}</button> : reward.status === 'PENDING' ? <button onClick={() => refreshReward(reward)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] font-bold text-white"><RefreshCw className="w-3.5 h-3.5" /> Check status</button> : <span className="text-[10px] text-[#64748B]">Completed</span>}</td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[#64748B]"><Gift className="w-6 h-6 mx-auto mb-2 opacity-50" />No qualifying referral rewards yet.</td></tr>}</tbody></table></div>
        </div>
      </section>

      <AdminStepUpModal open={approvalOpen} title={approvalTitle} description={approvalDescription} actionLabel={approvalLabel} loading={approvalLoading} onClose={() => { if (!approvalLoading) { pendingAction.current = null; setApprovalOpen(false) } }} onApprove={approve} />
    </div>
  )
}
