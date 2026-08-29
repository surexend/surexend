'use client'

import React, { useState, useEffect } from 'react'
import { Copy, Share2, AlertTriangle, CheckCircle2, Landmark } from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { walletAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'

interface NetworkLogoProps {
  id: string
  size?: number
  className?: string
}

const LOGO_PATHS: Record<string, string> = {
  ETHEREUM: '/logos/ethereum.png',
  POLYGON: '/logos/polygon.png',
  AVALANCHE: '/logos/avalanche.png',
  ARBITRUM: '/logos/arbitrum.png',
  BASE: '/logos/base.png',
  OPTIMISM: '/logos/optimism.png',
  SOLANA: '/logos/solana.png',
  BSC: '/logos/bnb.png',
  MONAD: '/logos/monad.png',
  ARC: '/logos/arc.png',
}

const ACCENT_COLORS: Record<string, string> = {
  ETHEREUM: 'rgba(98, 126, 234, 0.18)',
  POLYGON: 'rgba(130, 71, 229, 0.18)',
  AVALANCHE: 'rgba(232, 65, 66, 0.18)',
  ARBITRUM: 'rgba(40, 160, 240, 0.18)',
  BASE: 'rgba(0, 82, 255, 0.18)',
  OPTIMISM: 'rgba(255, 4, 32, 0.18)',
  SOLANA: 'rgba(20, 241, 149, 0.18)',
  BSC: 'rgba(243, 186, 47, 0.18)',
  MONAD: 'rgba(131, 110, 249, 0.18)',
  ARC: 'rgba(255, 94, 0, 0.18)',
}

function NetworkLogo({ id, size = 32, className = '' }: NetworkLogoProps) {
  const logoSrc = LOGO_PATHS[id] || LOGO_PATHS.ETHEREUM
  const bgAccent = ACCENT_COLORS[id] || 'rgba(255, 255, 255, 0.08)'

  // Full-cover circular clip for logos with square background cards (e.g. Arc)
  const isFullCover = id === 'ARC'

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 transition-transform ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: isFullCover ? 'transparent' : bgAccent,
        padding: isFullCover ? '0px' : `${Math.max(2, size * 0.08)}px`,
      }}
    >
      <img
        src={logoSrc}
        alt={`${id} logo`}
        className={`w-full h-full rounded-full filter drop-shadow-sm ${isFullCover ? 'object-cover' : 'object-contain'}`}
        onError={(e) => {
          ;(e.target as HTMLImageElement).src = '/logos/ethereum.png'
        }}
      />
    </div>
  )
}

const NETWORKS = [
  { id: 'ETHEREUM' as const, label: 'Ethereum', sublabel: 'Mainnet', color: '#627EEA' },
  { id: 'POLYGON' as const, label: 'Polygon', sublabel: 'PoS Mainnet', color: '#8247E5' },
  { id: 'AVALANCHE' as const, label: 'Avalanche', sublabel: 'C-Chain', color: '#E84142' },
  { id: 'ARBITRUM' as const, label: 'Arbitrum', sublabel: 'One Mainnet', color: '#28A0F0' },
  { id: 'BASE' as const, label: 'Base', sublabel: 'Mainnet', color: '#0052FF' },
  { id: 'OPTIMISM' as const, label: 'Optimism', sublabel: 'Mainnet', color: '#FF0420' },
  { id: 'SOLANA' as const, label: 'Solana', sublabel: 'Mainnet', color: '#14F195' },
  { id: 'BSC' as const, label: 'BNB Smart Chain', sublabel: 'Mainnet', color: '#F3BA2F' },
  { id: 'MONAD' as const, label: 'Monad', sublabel: 'Mainnet', color: '#836EF9' },
  { id: 'ARC' as const, label: 'Arc', sublabel: 'Mainnet', color: '#FF5E00' },
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
    <div className="mobile-flat-surface liquid-glass p-4 rounded-3xl border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4" style={{ color: colors.primary }} />
          <h2 className="text-sm font-extrabold text-white">Fund Local Currency</h2>
        </div>
        <span
          className="px-2 py-1 rounded-full text-[10px] font-bold border"
          style={{
            color: colors.primary,
            borderColor: `rgba(${colors.glowRgb},0.4)`,
            background: `rgba(${colors.glowRgb},0.1)`,
          }}
        >
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
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Account Name</p>
              <p className="text-sm font-bold text-white">{data.account.accountName}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[#64748B] font-bold">Account Number</p>
                <p className="text-base font-black text-white tracking-wider">{data.account.accountNumber}</p>
              </div>
              <button
                onClick={copyNum}
                className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
              >
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
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
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
  const { colors } = useTheme()
  const [network, setNetwork] = useState<
    'POLYGON' | 'AVALANCHE' | 'ARBITRUM' | 'ETHEREUM' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'BSC' | 'MONAD' | 'ARC'
  >('POLYGON')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  const activeNet = NETWORKS.find((n) => n.id === network)!

  const {
    data: addressData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['depositAddress', network],
    queryFn: () => walletAPI.getDepositAddress(network),
    retry: false,
  })

  const address = addressData?.address || ''

  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, {
        width: 220,
        margin: 2,
        color: { dark: '#020203', light: '#FFFFFF' },
      })
        .then(setQrCodeDataUrl)
        .catch(console.error)
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
      navigator.share({ title: 'My SureXend USDC Address', text: `My USDC (${network}) address:\n${address}` }).catch(console.error)
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
          <p className="text-xs text-[#64748B] mt-0.5">Deposit USDC to your wallet</p>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-bold border"
          style={{
            color: colors.primary,
            borderColor: `rgba(${colors.glowRgb},0.4)`,
            background: `rgba(${colors.glowRgb},0.1)`,
          }}
        >
          USDC
        </span>
      </div>

      {/* Network Selector */}
      <div className="grid grid-cols-2 gap-2">
        {NETWORKS.map((net) => (
          <button
            key={net.id}
            onClick={() => setNetwork(net.id)}
            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border transition-all active:bg-white/[0.04]"
            style={
              network === net.id
                ? { background: `rgba(${colors.glowRgb},0.12)`, borderColor: colors.primary, boxShadow: `0 0 12px rgba(${colors.glowRgb},0.2)` }
                : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }
            }
          >
            <NetworkLogo id={net.id} size={32} />
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
            {error instanceof Error
              ? error.message
              : 'Circle Web3 wallet creation failed for this network. Please ensure this chain is enabled in your Developer Console.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mobile-flat-surface liquid-glass p-5 rounded-3xl flex flex-col items-center gap-4 border border-white/10">
            {/* Chain info banner */}
            <div className="flex items-center gap-3 w-full p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
              <NetworkLogo id={activeNet.id} size={34} />
              <div>
                <p className="text-sm font-bold text-white">{activeNet.label} Network</p>
                <p className="text-xs text-[#64748B]">{activeNet.sublabel}</p>
              </div>
              <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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
                    <NetworkLogo id={activeNet.id} size={32} />
                  </div>
                </>
              ) : (
                <div className="w-[200px] h-[200px] bg-gray-100 rounded-xl flex items-center justify-center">
                  <span className="text-gray-400 text-xs">Generating...</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#64748B] text-center font-medium">Scan QR code or copy address below</p>
          </div>

          {/* Address Card */}
          <div className="mobile-flat-surface liquid-glass p-4 rounded-2xl border border-white/10">
            <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 font-bold">{network} Deposit Address</p>
            <p className="text-xs font-mono text-white break-all leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/[0.08] select-all">
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
      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/[0.08] border border-red-500/20">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-red-400 mb-0.5">Important</p>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            Only send <strong className="text-white">USDC</strong> to this address via the{' '}
            <strong className="text-white">{activeNet.sublabel}</strong>. Sending any other asset or network will result in{' '}
            <strong className="text-red-400">permanent loss</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
