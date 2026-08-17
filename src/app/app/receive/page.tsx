'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Copy, Share2, AlertTriangle, CheckCircle2, Landmark } from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { walletAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'

function EthereumLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#627EEA" />
      <path d="M50 18v29.5l25.8-11.7L50 18z" fill="white" fillOpacity="0.8" />
      <path d="M50 18L24.2 35.8 50 47.5V18z" fill="white" />
      <path d="M50 79v-20L75.8 47.3 50 79z" fill="white" fillOpacity="0.8" />
      <path d="M50 79L24.2 47.3 50 59v20z" fill="white" />
      <path d="M50 59v-11.5l25.8-11.7L50 59z" fill="white" fillOpacity="0.5" />
      <path d="M50 59L24.2 35.8 50 47.5V59z" fill="white" fillOpacity="0.6" />
    </svg>
  )
}

function ArbitrumLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#28A0F0" />
      <path d="M50 20L80 70H20L50 20Z" fill="white" fillOpacity="0.2" />
      <path d="M50 35L70 68H30L50 35Z" fill="white" />
    </svg>
  )
}

function AvalancheLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#E84142" />
      <path d="M50 22L78 72H60L50 54L40 72H22L50 22Z" fill="white" />
    </svg>
  )
}

function BaseLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#0052FF" />
      <circle cx="50" cy="50" r="22" stroke="white" strokeWidth="8" />
    </svg>
  )
}

function OptimismLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#FF0420" />
      <path d="M35 50a15 15 0 0 1 30 0v5a15 15 0 0 1-30 0v-5z" stroke="white" strokeWidth="8" />
    </svg>
  )
}

function SolanaLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#14F195" />
      <path d="M72 32H28l-8 8h44l8-8zm0 28H28l-8 8h44l8-8zM28 46h44l8 8H36l-8-8z" fill="white" />
    </svg>
  )
}

function BNBLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#F3BA2F" />
      <path d="M32 50L50 32L68 50L50 68L32 50Z" fill="white" />
      <path d="M50 20L56 26L50 32L44 26L50 20Z" fill="white" />
      <path d="M50 68L56 74L50 80L44 74L50 68Z" fill="white" />
      <path d="M20 50L26 44L32 50L26 56L20 50Z" fill="white" />
      <path d="M68 50L74 44L80 50L74 56L68 50Z" fill="white" />
    </svg>
  )
}

function PolygonLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#8247E5" />
      <path d="M63 37L50 30L37 37V51L50 58L63 51V37Z" fill="white" />
      <path d="M37 51L24 44V58L37 65V51Z" fill="white" fillOpacity="0.7" />
      <path d="M63 51L76 44V58L63 65V51Z" fill="white" fillOpacity="0.7" />
    </svg>
  )
}

function ArcLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#FF5E00" />
      <path d="M50 25L75 68H25L50 25Z" stroke="white" strokeWidth="8" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="54" r="8" fill="white" />
    </svg>
  )
}

function MonadLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#836EF9" />
      <path d="M36 24c8 0 14 6 14 14v32M36 24c-8 0-14 6-14 14v32c0 8 6 14 14 14s14-6 14-14V38c0-8 6-14 14-14s14 6 14 14v32" stroke="white" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="36" cy="24" r="7" fill="white" />
      <circle cx="50" cy="84" r="7" fill="white" />
      <circle cx="64" cy="24" r="7" fill="white" />
    </svg>
  )
}

const NETWORKS = [
  { id: 'ETHEREUM' as const, label: 'Ethereum', sublabel: 'ERC20 Network', color: '#627EEA', Logo: EthereumLogo },
  { id: 'POLYGON' as const, label: 'Polygon', sublabel: 'Amoy/POS Network', color: '#8247E5', Logo: PolygonLogo },
  { id: 'AVALANCHE' as const, label: 'Avalanche', sublabel: 'Fuji/C-Chain', color: '#E84142', Logo: AvalancheLogo },
  { id: 'ARBITRUM' as const, label: 'Arbitrum', sublabel: 'Sepolia/One', color: '#28A0F0', Logo: ArbitrumLogo },
  { id: 'BASE' as const, label: 'Base', sublabel: 'Sepolia/L2', color: '#0052FF', Logo: BaseLogo },
  { id: 'OPTIMISM' as const, label: 'Optimism', sublabel: 'Sepolia/L2', color: '#FF0420', Logo: OptimismLogo },
  { id: 'SOLANA' as const, label: 'Solana', sublabel: 'Devnet/Mainnet', color: '#14F195', Logo: SolanaLogo },
  { id: 'BSC' as const, label: 'BSC', sublabel: 'BNB Smart Chain', color: '#F3BA2F', Logo: BNBLogo },
  { id: 'MONAD' as const, label: 'Monad', sublabel: 'Monad Testnet', color: '#836EF9', Logo: MonadLogo },
  { id: 'ARC' as const, label: 'Arc', sublabel: 'Arc L1 Network', color: '#FF5E00', Logo: ArcLogo },
]

function BankFundingCard() {
  const { colors } = useTheme()
  const [copied, setCopied] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['localFundingAccount'],
    queryFn: () => walletAPI.getLocalFundingAccount(),
    retry: false,
  })

  const copyNum = () => {
    if (!data?.account?.accountNumber) return
    navigator.clipboard.writeText(data.account.accountNumber)
    setCopied(true)
    toast.success('Account number copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="liquid-glass p-4 rounded-3xl border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4" style={{ color: colors.primary }} />
          <h2 className="text-sm font-extrabold text-white">Fund Local Currency</h2>
        </div>
        <span className="px-2 py-1 rounded-full text-[10px] font-bold border" style={{ color: colors.primary, borderColor: `rgba(${colors.glowRgb},0.4)`, background: `rgba(${colors.glowRgb},0.1)` }}>
          Bank Transfer
        </span>
      </div>

      {isLoading ? (
        <div className="h-16 bg-white/[0.03] rounded-xl animate-pulse" />
      ) : data?.configured && data?.account ? (
        <>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            Send money to this account and your <strong className="text-white">NGN wallet</strong> is credited automatically.
          </p>
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Account Name</p>
              <p className="text-sm font-bold text-white">{data.account.accountName}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Account Number</p>
                <p className="text-base font-black text-white tracking-wider">{data.account.accountNumber}</p>
              </div>
              <button onClick={copyNum} className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
              </button>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Bank</p>
              <p className="text-sm font-semibold text-white">{data.account.bankName}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            {data?.message || 'Bank deposits are being set up. Contact support to fund your local wallet for now.'}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ReceivePage() {
  const { variant, colors } = useTheme()
  const [network, setNetwork] = useState<'POLYGON' | 'AVALANCHE' | 'ARBITRUM' | 'ETHEREUM' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'BSC' | 'MONAD' | 'ARC'>('POLYGON')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  const activeNet = NETWORKS.find(n => n.id === network)!

  const { data: addressData, isLoading, isError, error } = useQuery({
    queryKey: ['depositAddress', network],
    queryFn: () => walletAPI.getDepositAddress(network),
    retry: false
  })

  const address = addressData?.address || ''

  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, {
        width: 220,
        margin: 2,
        color: { dark: '#0A0F1E', light: '#FFFFFF' }
      }).then(setQrCodeDataUrl).catch(console.error)
    }
  }, [address])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address)
    setIsCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'My SureXend USDT Address', text: `My USDT (${network}) address:\n${address}` }).catch(console.error)
    } else {
      copyToClipboard()
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto pb-28 sm:pb-32 space-y-4">

      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-white">Receive Crypto</h1>
          <p className="text-xs text-[#64748B] mt-0.5">Deposit USDT or USDC to your wallet</p>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-bold border"
          style={{ color: colors.primary, borderColor: `rgba(${colors.glowRgb},0.4)`, background: `rgba(${colors.glowRgb},0.1)` }}
        >
          USDT / USDC
        </span>
      </div>

      {/* Network Selector */}
      <div className="grid grid-cols-2 gap-2">
        {NETWORKS.map((net) => (
          <button
            key={net.id}
            onClick={() => setNetwork(net.id)}
            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border transition-all active:scale-95"
            style={network === net.id
              ? { background: `rgba(${colors.glowRgb},0.12)`, borderColor: colors.primary }
              : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }
            }
          >
            <net.Logo size={28} />
            <span className={`text-[11px] font-extrabold ${network === net.id ? 'text-white' : 'text-[#64748B]'}`}>{net.label}</span>
            <span className="text-[9px] text-[#475569] leading-none text-center">{net.sublabel}</span>
          </button>
        ))}
      </div>

      {/* QR Card */}
      {isError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center glass-card border border-red-500/20 bg-red-500/[0.02] rounded-3xl gap-3">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <h3 className="text-sm font-bold text-white">Address Generation Failed</h3>
          <p className="text-xs text-[#94A3B8] max-w-xs leading-relaxed">
            {error instanceof Error ? error.message : 'Circle Web3 wallet creation failed for this network. Please ensure this chain is enabled in your Developer Console.'}
          </p>
        </div>
      ) : (
        <>
          <motion.div
            key={network}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="liquid-glass p-5 rounded-3xl flex flex-col items-center gap-4 border border-white/10"
          >
            {/* Chain info banner */}
            <div className="flex items-center gap-3 w-full p-3 rounded-2xl bg-white/[0.03] border border-white/8">
              <activeNet.Logo size={32} />
              <div>
                <p className="text-sm font-bold text-white">{activeNet.label} Network</p>
                <p className="text-xs text-[#64748B]">{activeNet.sublabel}</p>
              </div>
              <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold">Active</span>
              </div>
            </div>

            {/* QR Code with logo center */}
            <div className="p-3 bg-white rounded-2xl shadow-xl relative flex items-center justify-center">
              {isLoading ? (
                <div className="w-[200px] h-[200px] bg-gray-200 animate-pulse rounded-xl" />
              ) : qrCodeDataUrl ? (
                <>
                  <img src={qrCodeDataUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-xl" />
                  {/* Centered chain logo overlay */}
                  <div className="absolute flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-lg border-2 border-gray-100">
                    <activeNet.Logo size={30} />
                  </div>
                </>
              ) : (
                <div className="w-[200px] h-[200px] bg-gray-100 rounded-xl flex items-center justify-center">
                  <span className="text-gray-400 text-xs">Generating...</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#64748B] text-center font-medium">
              Scan QR code or copy address below
            </p>
          </motion.div>

          {/* Address Card */}
          <div className="liquid-glass p-4 rounded-2xl border border-white/10">
            <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 font-bold">{network} Deposit Address</p>
            <p className="text-xs font-mono text-white break-all leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/8 select-all">
              {isLoading ? 'Loading address...' : address}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={copyToClipboard}
              disabled={isLoading || !address}
              className="py-3.5 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {isCopied ? 'Copied!' : 'Copy Address'}
            </button>
            <button
              onClick={handleShare}
              disabled={isLoading || !address}
              className="py-3.5 rounded-2xl text-black flex items-center justify-center gap-2 text-sm font-bold transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:pointer-events-none"
              style={{ background: colors.gradientBg }}
            >
              <Share2 className="w-4 h-4" /> Share Address
            </button>
          </div>
        </>
      )}

      {/* Fund local currency via bank transfer */}
      <BankFundingCard />

      {/* Warning */}
      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/8 border border-red-500/20">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-red-400 mb-0.5">Important</p>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            Only send <strong className="text-white">USDT</strong> to this address via the <strong className="text-white">{activeNet.sublabel}</strong>. Sending any other asset or network will result in <strong className="text-red-400">permanent loss</strong>.
          </p>
        </div>
      </div>

    </div>
  )
}
