'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, Flashlight, Image as ImageIcon, RefreshCw, AlertCircle, CheckCircle2, Zap } from 'lucide-react'
import jsQR from 'jsqr'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

export interface ScannedQRResult {
  address: string
  network?: string
  amount?: string
}

export function parseScannedCryptoURI(raw: string): ScannedQRResult {
  let text = raw.trim()
  let detectedNetwork: string | undefined
  let amount: string | undefined

  // Matches URI formats like ethereum:0x1234...?amount=10 or solana:5XYZ...?amount=5
  const uriMatch = text.match(/^([a-zA-Z0-9_-]+):([^?]+)(\?.*)?$/)
  if (uriMatch) {
    const scheme = uriMatch[1].toUpperCase()
    const path = uriMatch[2]
    const queryString = uriMatch[3]

    if (scheme === 'ETHEREUM' || scheme === 'ETH') detectedNetwork = 'ETHEREUM'
    else if (scheme === 'POLYGON' || scheme === 'MATIC') detectedNetwork = 'POLYGON'
    else if (scheme === 'ARBITRUM' || scheme === 'ARB') detectedNetwork = 'ARBITRUM'
    else if (scheme === 'OPTIMISM' || scheme === 'OP') detectedNetwork = 'OPTIMISM'
    else if (scheme === 'BASE') detectedNetwork = 'BASE'
    else if (scheme === 'AVALANCHE' || scheme === 'AVAX') detectedNetwork = 'AVALANCHE'
    else if (scheme === 'SOLANA' || scheme === 'SOL') detectedNetwork = 'SOLANA'
    else if (scheme === 'ARC') detectedNetwork = 'ARC'

    text = path.trim()

    if (queryString) {
      try {
        const searchParams = new URLSearchParams(queryString.substring(1))
        amount = searchParams.get('amount') || searchParams.get('value') || undefined
      } catch {
        // ignore malformed query
      }
    }
  }

  // Auto-detect network from address format if not yet determined
  if (/^[1-9A-HJ-NP-za-km-z]{32,44}$/.test(text) && !text.startsWith('0x')) {
    detectedNetwork = detectedNetwork || 'SOLANA'
  } else if (/^0x[a-fA-F0-9]{40}$/.test(text)) {
    // Default to ARC if none specified since ARC is the primary native network
    detectedNetwork = detectedNetwork || 'ARC'
  }

  return { address: text, network: detectedNetwork, amount }
}

interface QRScannerModalProps {
  open: boolean
  onClose: () => void
  onScan: (result: ScannedQRResult) => void
  title?: string
  description?: string
}

export default function QRScannerModal({
  open,
  onClose,
  onScan,
  title = 'Scan QR Code',
  description = 'Align recipient wallet QR code within frame',
}: QRScannerModalProps) {
  const { colors, variant } = useTheme()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isScanning, setIsScanning] = useState(true)
  const [scannedSuccess, setScannedSuccess] = useState(false)

  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current)
      animFrameIdRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setTorchOn(false)
  }, [])

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })

      if (code && code.data) {
        // QR Code detected!
        setIsScanning(false)
        setScannedSuccess(true)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([40, 30, 40])
        }

        const parsed = parseScannedCryptoURI(code.data)
        toast.success('QR code detected successfully!')

        setTimeout(() => {
          stopCamera()
          onScan(parsed)
          onClose()
        }, 500)
        return
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanFrame)
  }, [isScanning, onScan, onClose, stopCamera])

  const startCamera = useCallback(async () => {
    stopCamera()
    setCameraError(null)
    setIsScanning(true)
    setScannedSuccess(false)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported on this browser. You can upload an image from your gallery instead.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
        setCameraActive(true)

        // Check torch capabilities
        const track = stream.getVideoTracks()[0]
        const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : null
        if (capabilities && capabilities.torch) {
          setHasTorch(true)
        } else {
          setHasTorch(false)
        }

        animFrameIdRef.current = requestAnimationFrame(scanFrame)
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings or upload a QR image.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on your device. Please upload an image from your photos instead.')
      } else {
        setCameraError('Unable to access camera. Please check permissions or upload a QR image.')
      }
    }
  }, [facingMode, scanFrame, stopCamera])

  useEffect(() => {
    if (open) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [open, startCamera, stopCamera])

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return
    const track = streamRef.current.getVideoTracks()[0]
    const nextState = !torchOn
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      })
      setTorchOn(nextState)
    } catch {
      toast.error('Torch could not be toggled')
    }
  }

  const switchCamera = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(img, 0, 0, img.width, img.height)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)

        if (code && code.data) {
          setScannedSuccess(true)
          const parsed = parseScannedCryptoURI(code.data)
          toast.success('QR Code recognized from photo!')
          setTimeout(() => {
            stopCamera()
            onScan(parsed)
            onClose()
          }, 400)
        } else {
          toast.error('No readable QR code found in this photo. Please try a clearer screenshot.')
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 liquid-backdrop">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="w-full max-w-md bg-[#0b0f17] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)] relative overflow-hidden flex flex-col"
          style={{ borderColor: `rgba(${colors.glowRgb}, 0.35)` }}
        >
          {/* Hidden Canvas for QR frame analysis */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Hidden file input for photo upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10"
                style={{ background: `rgba(${colors.glowRgb}, 0.15)`, color: colors.primary }}
              >
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base tracking-tight">{title}</h3>
                <p className="text-[11px] text-[#94A3B8]">{description}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/[0.04] hover:bg-white/10 text-[#94A3B8] hover:text-white transition-all active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Viewfinder Window */}
          <div className="relative w-full aspect-square max-h-[320px] rounded-2xl overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center">
            {cameraError ? (
              <div className="p-5 text-center space-y-3 z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed max-w-xs">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-all flex items-center gap-2 mx-auto"
                >
                  <ImageIcon className="w-4 h-4" />
                  Upload QR Image
                </button>
              </div>
            ) : (
              <>
                {/* Live Video Feed */}
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />

                {/* Reticle Focus Frame with Corner Brackets */}
                <div className="relative w-56 h-56 z-10 pointer-events-none flex items-center justify-center">
                  {/* Outer corner brackets */}
                  <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 rounded-br-xl border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                  {/* Laser Scan Sweep Animation */}
                  {!scannedSuccess && (
                    <motion.div
                      className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_14px_rgba(52,211,153,1)]"
                      animate={{ top: ['8%', '92%', '8%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}

                  {/* Scanned Confirmation Pill */}
                  {scannedSuccess && (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="px-4 py-2 rounded-2xl bg-emerald-500 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-2xl"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Scanned!
                    </motion.div>
                  )}
                </div>

                {/* Dark Vignette Overlay around scanning box */}
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
              </>
            )}
          </div>

          {/* Controls toolbar */}
          <div className="mt-4 flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 px-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <span>Upload Photo</span>
            </button>

            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  torchOn
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-lg'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                }`}
                title="Toggle Torch / Flashlight"
              >
                <Flashlight className={`w-4 h-4 ${torchOn ? 'text-amber-400' : ''}`} />
                <span className="hidden xs:inline">{torchOn ? 'Flash On' : 'Flash'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={switchCamera}
              className="py-3 px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95"
              title="Flip Camera (Front / Back)"
            >
              <RefreshCw className="w-4 h-4 text-[#94A3B8]" />
              <span className="hidden xs:inline">Flip</span>
            </button>
          </div>

          {/* Quick Guidance */}
          <p className="text-[11px] text-[#64748B] text-center mt-3 flex items-center justify-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400/70" />
            Supports Ethereum, Solana, Polygon, Arbitrum, Base & Arc addresses
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
