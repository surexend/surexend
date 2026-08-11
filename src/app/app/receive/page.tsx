'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Copy, Share2, AlertTriangle, CheckCircle2 } from 'lucide-react'
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

const NETWORKS = [
  { id: 'ETHEREUM' as const, label: 'Ethereum', sublabel: 'ERC20 Network', color: '#627EEA', Logo: EthereumLogo },
  { id: 'POLYGON' as const, label: 'Polygon', sublabel: 'Amoy/POS Network', color: '#8247E5', Logo: PolygonLogo },
  { id: 'AVALANCHE' as const, label: 'Avalanche', sublabel: 'Fuji/C-Chain', color: '#E84142', Logo: AvalancheLogo },
  { id: 'ARBITRUM' as const, label: 'Arbitrum', sublabel: 'Sepolia/One', color: '#28A0F0', Logo: ArbitrumLogo },
  { id: 'BASE' as const, label: 'Base', sublabel: 'Sepolia/L2', color: '#0052FF', Logo: BaseLogo },
  { id: 'OPTIMISM' as const, label: 'Optimism', sublabel: 'Sepolia/L2', color: '#FF0420', Logo: OptimismLogo },
  { id: 'SOLANA' as const, label: 'Solana', sublabel: 'Devnet/Mainnet', color: '#14F195', Logo: SolanaLogo },
  { id: 'BSC' as const, label: 'BSC', sublabel: 'BNB Smart Chain', color: '#F3BA2F', Logo: BNBLogo },
]

export default function ReceivePage() {
  const { variant, colors } = useTheme()
  const [network, setNetwork] = useState<'POLYGON' | 'AVALANCHE' | 'ARBITRUM' | 'ETHEREUM' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'BSC'>('POLYGON')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  const activeNet = NETWORKS.find(n => n.id === network)!

  const { data: addressData, isLoading } = useQuery({
    queryKey: ['depositAddress', network],
    queryFn: () => walletAPI.getDepositAddress(network),
    initialData: { address: network === 'SOLANA' ? 'HN7cABviJ373u4AeeaoeeNC6YtUt1qq1C9Xf6S7vwLdi' : '0x8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b' }
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
      <motion.div
        key={network}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="glass-card p-5 rounded-3xl flex flex-col items-center gap-4 border border-white/10"
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
      <div className="glass-card p-4 rounded-2xl border border-white/10">
        <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 font-bold">{network} Deposit Address</p>
        <p className="text-xs font-mono text-white break-all leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/8 select-all">
          {isLoading ? 'Loading address...' : address}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={copyToClipboard}
          className="py-3.5 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-95"
        >
          {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {isCopied ? 'Copied!' : 'Copy Address'}
        </button>
        <button
          onClick={handleShare}
          className="py-3.5 rounded-2xl text-black flex items-center justify-center gap-2 text-sm font-bold transition-all active:scale-95 shadow-lg"
          style={{ background: colors.gradientBg }}
        >
          <Share2 className="w-4 h-4" /> Share Address
        </button>
      </div>

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
