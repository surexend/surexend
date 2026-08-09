'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Copy, Share2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { walletAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'

export default function ReceivePage() {
  const { variant, colors } = useTheme()
  const [network, setNetwork] = useState<'TRC20' | 'BEP20' | 'POLYGON'>('TRC20')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  const { data: addressData, isLoading } = useQuery({
    queryKey: ['depositAddress', network],
    queryFn: () => walletAPI.getDepositAddress(network),
    initialData: { address: 'TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' } // Mock fallback
  })

  const address = addressData?.address || ''

  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, {
        width: 250,
        margin: 1,
        color: {
          dark: '#0A0F1E',
          light: '#FFFFFF'
        }
      }).then(setQrCodeDataUrl).catch(console.error)
    }
  }, [address])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address)
    setIsCopied(true)
    toast.success('Address copied to clipboard')
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My SureXend USDT Address',
        text: `Here is my USDT (${network}) address:\n${address}`,
      }).catch(console.error)
    } else {
      copyToClipboard()
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-md mx-auto min-h-[80vh] flex flex-col pt-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-card-${variant} p-6 relative overflow-hidden`}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <h2 className="text-xl font-bold text-white mb-6 text-center">Receive USDT</h2>

        {/* Network Selector */}
        <div className="grid grid-cols-3 gap-2 mb-8 relative z-10">
          {(['TRC20', 'BEP20', 'POLYGON'] as const).map((net) => (
            <button
              key={net}
              onClick={() => setNetwork(net)}
              className={`py-2 rounded-xl text-xs font-medium transition-all ${
                network === net 
                  ? `bg-[rgba(255,255,255,0.1)] text-white border border-[${colors.primary}]`
                  : 'bg-[rgba(255,255,255,0.02)] text-[#94A3B8] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.05)]'
              }`}
              style={network === net ? { borderColor: colors.primary } : {}}
            >
              {net}
            </button>
          ))}
        </div>

        {/* QR Code Container with Network Chain Badge Centered */}
        <div className="flex justify-center mb-6">
          <div className="p-3.5 bg-white rounded-3xl shadow-2xl relative group">
            {isLoading ? (
              <div className="w-[210px] h-[210px] bg-gray-200 animate-pulse rounded-2xl"></div>
            ) : qrCodeDataUrl ? (
              <div className="relative flex items-center justify-center">
                <img src={qrCodeDataUrl} alt="QR Code" className="w-[210px] h-[210px] rounded-2xl" />
                {/* Embedded Network Chain Badge in Center of QR Barcode */}
                <div className="absolute w-11 h-11 rounded-2xl bg-[#0A0F1E] border-2 border-emerald-400 p-1 flex items-center justify-center shadow-2xl ring-4 ring-white/90">
                  {network === 'TRC20' && <span className="text-lg font-black text-red-500">TRX</span>}
                  {network === 'BEP20' && <span className="text-lg font-black text-amber-400">BNB</span>}
                  {network === 'POLYGON' && <span className="text-lg font-black text-purple-400">MATIC</span>}
                </div>
              </div>
            ) : null}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-black/80 px-3 py-1.5 rounded-full border border-white/20">Scan to Receive USDT</span>
            </div>
          </div>
        </div>

        {/* Address Display */}
        <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] rounded-xl p-4 mb-6 text-center relative group">
          <p className="text-xs text-[#94A3B8] mb-1 uppercase tracking-wider">{network} Address</p>
          <p className="text-sm font-mono text-white break-all">
            {isLoading ? 'Loading address...' : address}
          </p>
          <button 
            onClick={copyToClipboard}
            className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 flex items-center justify-center bg-[rgba(255,255,255,0.1)] backdrop-blur-sm transition-all rounded-xl cursor-pointer"
          >
            <span className="bg-[#0F1629] px-4 py-2 rounded-full text-xs font-medium flex items-center">
              {isCopied ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
              {isCopied ? 'Copied' : 'Tap to copy'}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button onClick={copyToClipboard} className={`py-3 rounded-xl border border-[rgba(255,255,255,0.1)] flex items-center justify-center gap-2 hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm`}>
            {isCopied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {isCopied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleShare} className={`py-3 rounded-xl border border-[rgba(255,255,255,0.1)] flex items-center justify-center gap-2 hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm`}>
            <Share2 className="w-4 h-4" /> Share
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
          <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-xs text-[#EF4444] leading-relaxed">
            Send only <span className="font-bold">USDT</span> to this address via the <span className="font-bold">{network}</span> network. Sending any other asset will result in permanent loss.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
