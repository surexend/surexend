// Self-contained receipt renderer for the chat assistant. Draws the receipt
// directly on a Canvas 2D context with exact pixel positions (same approach as
// the history page export) so a blank page or overlapping text is impossible by
// construction. jsPDF is lazy-loaded only for the PDF path.

import { getSwapInfo, currencySymbol, formatAmount } from '@/lib/utils'

const statusLabel = (s?: string) => {
  const u = (s || '').toUpperCase()
  if (u === 'COMPLETED' || u === 'SUCCESS' || u === 'PAID') return 'COMPLETED'
  if (u === 'FAILED' || u === 'REJECTED') return 'FAILED'
  if (u === 'PENDING' || u === 'PROCESSING') return 'PENDING'
  return 'COMPLETED'
}

export async function renderReceiptCanvas(opts: {
  tx: any
  variant: 'gold' | 'lemon'
  accentHex: string
}): Promise<HTMLCanvasElement> {
  const { tx, variant, accentHex } = opts
  const font = getComputedStyle(document.body).fontFamily
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  const W = 420
  const PX = 32
  const PY = 36
  const CW = W - PX * 2

  const logoPath = variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'
  const srcImg = new Image()
  srcImg.src = logoPath
  await srcImg.decode()
  let logo: HTMLImageElement | HTMLCanvasElement = srcImg
  if (variant !== 'gold') {
    const c = document.createElement('canvas')
    c.width = Math.max(64, srcImg.naturalWidth * 2)
    c.height = Math.max(64, srcImg.naturalHeight * 2)
    const lctx = c.getContext('2d')
    if (lctx) {
      lctx.filter = 'brightness(0) invert(1)'
      lctx.drawImage(srcImg, 0, 0, c.width, c.height)
      logo = c
    }
  }

  const measure = (text: string, f: string) => {
    const cv = document.createElement('canvas')
    const cx = cv.getContext('2d')!
    cx.font = f
    return cx.measureText(text).width
  }

  const wrap = (text: string, f: string, maxW: number) => {
    const cv = document.createElement('canvas')
    const cx = cv.getContext('2d')!
    cx.font = f
    const out: string[] = []
    let line = ''
    for (const ch of text) {
      const t = line + ch
      if (cx.measureText(t).width > maxW && line) { out.push(line); line = ch }
      else line = t
    }
    if (line) out.push(line)
    return out
  }

  const meta = tx?.metadata || {}
  const swap = getSwapInfo(tx)
  const statusU = statusLabel(tx?.status)
  const palette: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    COMPLETED: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', text: '#34D399', dot: '#34D399' },
    FAILED: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', text: '#F87171', dot: '#F87171' },
    PENDING: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#FBBF24', dot: '#FBBF24' },
  }
  const sc = palette[statusU] || palette.PENDING
  const dateTxt = new Date(tx?.createdAt || tx?.date || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const isDebit = statusU !== 'FAILED' && ['SEND', 'BILL_PAYMENT', 'CONVERT', 'WITHDRAWAL'].includes((tx?.type || '').toUpperCase())
  const symbol = tx?.currency === 'NGN' ? '₦' : tx?.currency === 'GHS' ? 'GH₵' : tx?.currency === 'KES' ? 'KSh' : '$'
  const amountValue = swap
    ? `${currencySymbol(swap.to)}${formatAmount(swap.toAmount)}`
    : `${isDebit ? '-' : ''}${symbol}${Number(tx?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const amountColor = '#ffffff'
  const amountSub = swap
    ? null
    : tx?.currency && tx?.currency !== 'USDT' ? `${tx.currency} · ${meta.network || 'ARC'}` : `US Dollar · ${meta.network || 'ARC'}`

  let amountSize = 40
  while (amountSize > 22 && measure(amountValue, `900 ${amountSize}px ${font}`) > CW) amountSize -= 2

  // Swap conversion row geometry (same approach as the history page export).
  const convFrom = swap ? `${currencySymbol(swap.from)}${formatAmount(swap.fromAmount)} ${swap.from}` : ''
  const convTo = swap ? `${currencySymbol(swap.to)}${formatAmount(swap.toAmount)} ${swap.to}` : ''
  const CONV_FONT = `600 12px ${font}`
  const CONV_GAP = 9
  const CONV_CHIP_R = 9.5
  const convW = swap
    ? measure(convFrom, CONV_FONT) + CONV_GAP + CONV_CHIP_R * 2 + CONV_GAP + measure(convTo, CONV_FONT)
    : 0

  const labelOff = 35
  const amtOff = labelOff + 9 + amountSize
  const subOff = amtOff + 18
  const convCy = amtOff + 14 + CONV_CHIP_R
  const panelH = Math.round((swap ? convCy + CONV_CHIP_R : subOff) + 26)

  const rows: { label: string; value: string; mono?: boolean; accent?: boolean }[] = []
  const addRow = (label: string, value: string, mono = false, accent = false) => {
    if (value) rows.push({ label, value, mono, accent })
  }
  addRow('Reference', tx?.reference || tx?.id || '—', true)
  if (!swap) {
    addRow('Type', (tx?.type || 'Transaction').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()))
    addRow('Status', statusU)
  }
  if (swap) {
    addRow('You swapped', `${currencySymbol(swap.from)}${formatAmount(swap.fromAmount)} ${swap.from}`)
    addRow('You received', `+${currencySymbol(swap.to)}${formatAmount(swap.toAmount)} ${swap.to}`, false, true)
    if (swap.rate) addRow('Rate', `1 ${swap.from} = ${formatAmount(swap.rate, 6)} ${swap.to}`)
  } else {
    const internal = meta?.delivery === 'internal'
    if (internal && (tx?.type || '').toUpperCase() === 'RECEIVE' && meta.fromTag) {
      addRow('From', `@${meta.fromTag}${meta.senderName ? ` · ${meta.senderName}` : ''}`, false, true)
    } else if (internal && meta.toTag) {
      addRow('To', `@${meta.toTag}${meta.recipientName ? ` · ${meta.recipientName}` : ''}`, false, true)
    }
    if (internal) addRow('Delivery', 'Instant · SureX Tag')
    else addRow('Recipient', tx?.recipient || meta?.recipient || meta?.destinationNetwork || '')
  }
  addRow('Provider', meta?.provider || '')
  if (tx?.fee && Number(tx.fee) > 0) addRow('Fee', `${symbol}${Number(tx.fee).toLocaleString()}`)

  let y = PY
  y += 32 + 22
  y += 24 + 18
  y += panelH + 24
  const rowsTop = y
  y += 20
  for (const row of rows) {
    const vf = row.mono ? `600 11px ${mono}` : `600 11px ${font}`
    const lines = wrap(row.value, vf, Math.max(80, CW - measure(row.label, `500 11px ${font}`) - 16))
    y += Math.max(15, lines.length * 16) + 12
  }
  y += 24 + 18 + 32
  const H = y + PY

  const canvas = document.createElement('canvas')
  const S = 2
  canvas.width = W * S
  canvas.height = H * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)
  ctx.fillStyle = '#0B1120'
  ctx.fillRect(0, 0, W, H)

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  const spaced = (text: string, f: string, x: number, y: number, color: string, gap = 2.5, align: 'left' | 'center' | 'right' = 'left') => {
    const cv = document.createElement('canvas')
    const cx = cv.getContext('2d')!
    cx.font = f
    const widths = [...text].map(ch => cx.measureText(ch).width)
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, text.length - 1)
    let sx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
    const prevAlign = ctx.textAlign
    ctx.textAlign = 'left'
    ctx.fillStyle = color
    ctx.font = f
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], sx, y)
      sx += widths[i] + gap
    }
    ctx.textAlign = prevAlign
  }

  // Header
  const logoSize = 32
  ctx.drawImage(logo as CanvasImageSource, PX, PY, logoSize, logoSize)
  const wmY = PY + 21
  const wmFont = `800 16px ${font}`
  const w1 = measure('SURE', wmFont)
  const w2 = measure('X', wmFont)
  ctx.font = wmFont
  ctx.fillStyle = '#ffffff'
  ctx.fillText('SURE', PX + logoSize + 10, wmY)
  ctx.fillStyle = accentHex
  ctx.fillText('X', PX + logoSize + 10 + w1 + 3, wmY)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('END', PX + logoSize + 10 + w1 + 3 + w2 + 3, wmY)

  const rightX = W - PX
  spaced('OFFICIAL RECEIPT', `700 9px ${font}`, rightX, PY + 21, '#475569', 2.5, 'right')

  // Status row
  const statusY = PY + 32 + 22
  const statusW = measure(statusU, `700 10px ${font}`) + 12 + 8 + 10 + 12
  roundRect(PX, statusY, statusW, 24, 999)
  ctx.fillStyle = sc.bg
  ctx.fill()
  roundRect(PX, statusY, statusW, 24, 999)
  ctx.strokeStyle = sc.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(PX + 14, statusY + 12, 3, 0, Math.PI * 2)
  ctx.fillStyle = sc.dot
  ctx.fill()
  ctx.font = `700 10px ${font}`
  ctx.fillStyle = sc.text
  ctx.fillText(statusU, PX + 22, statusY + 15.5)
  ctx.font = `500 10px ${font}`
  ctx.fillStyle = '#475569'
  ctx.textAlign = 'right'
  ctx.fillText(dateTxt, rightX, statusY + 15.5)
  ctx.textAlign = 'left'

  // Amount panel
  const panelY = statusY + 24 + 18
  roundRect(PX, panelY, CW, panelH, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fill()
  roundRect(PX, panelY, CW, panelH, 16)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()
  const grad = ctx.createLinearGradient(PX, panelY, PX + CW, panelY)
  grad.addColorStop(0, 'transparent')
  grad.addColorStop(0.5, accentHex)
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.fillRect(PX, panelY, CW, 3)
  ctx.textAlign = 'center'
  spaced('AMOUNT', `700 9px ${font}`, W / 2, panelY + labelOff, '#64748B', 2.5, 'center')
  ctx.font = `900 ${amountSize}px ${font}`
  ctx.fillStyle = amountColor
  ctx.fillText(amountValue, W / 2, panelY + amtOff)
  if (swap) {
    const startX = W / 2 - convW / 2
    let x = startX
    ctx.font = CONV_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = '#94A3B8'
    ctx.fillText(convFrom, x, panelY + convCy + 4)
    x += measure(convFrom, CONV_FONT) + CONV_GAP
    ctx.beginPath()
    ctx.arc(x + CONV_CHIP_R, panelY + convCy, CONV_CHIP_R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1
    ctx.stroke()
    const acx = x + CONV_CHIP_R
    const acy = panelY + convCy
    ctx.strokeStyle = '#CBD5E1'
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(acx - 3.4, acy)
    ctx.lineTo(acx + 3, acy)
    ctx.moveTo(acx + 0.4, acy - 2.8)
    ctx.lineTo(acx + 3.4, acy)
    ctx.lineTo(acx + 0.4, acy + 2.8)
    ctx.stroke()
    x += CONV_CHIP_R * 2 + CONV_GAP
    ctx.fillStyle = '#ffffff'
    ctx.font = CONV_FONT
    ctx.fillText(convTo, x, panelY + convCy + 4)
  } else if (amountSub) {
    ctx.font = `400 12px ${font}`
    ctx.fillStyle = '#94A3B8'
    ctx.fillText(amountSub, W / 2, panelY + subOff)
  }
  ctx.textAlign = 'left'

  // Rows
  let ry = rowsTop + 20
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PX, rowsTop + 10)
  ctx.lineTo(W - PX, rowsTop + 10)
  ctx.stroke()
  for (const row of rows) {
    const lf = `500 11px ${font}`
    const vf = row.mono ? `600 11px ${mono}` : `600 11px ${font}`
    ctx.font = lf
    ctx.fillStyle = '#64748B'
    ctx.fillText(row.label, PX, ry + 13)
    ctx.font = vf
    ctx.fillStyle = row.accent ? accentHex : '#ffffff'
    ctx.textAlign = 'right'
    wrap(row.value, vf, Math.max(80, CW - measure(row.label, lf) - 16)).forEach((line, i) =>
      ctx.fillText(line, W - PX, ry + 13 + i * 16))
    ctx.textAlign = 'left'
    ry += Math.max(15, wrap(row.value, vf, Math.max(80, CW - measure(row.label, lf) - 16)).length * 16) + 12
  }

  // Footer
  const fy = ry + 24 + 18
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PX, fy - 18)
  ctx.lineTo(W - PX, fy - 18)
  ctx.stroke()
  ctx.font = `500 9px ${font}`
  ctx.fillStyle = '#475569'
  ctx.fillText('Powered by SureXend', PX, fy + 12)
  ctx.font = `400 9px ${font}`
  ctx.fillStyle = '#334155'
  ctx.fillText('Verified digital transaction record', PX, fy + 24)
  const refFont = `600 9px ${mono}`
  const leftWidest = Math.max(
    measure('Powered by SureXend', `500 9px ${font}`),
    measure('Verified digital transaction record', `400 9px ${font}`)
  )
  const maxRefW = Math.max(60, CW - leftWidest - 24)
  let refTxt = tx?.reference || tx?.id || '—'
  if (measure(refTxt, refFont) > maxRefW) {
    while (refTxt.length > 1 && measure(refTxt + '…', refFont) > maxRefW) refTxt = refTxt.slice(0, -1)
    refTxt += '…'
  }
  ctx.font = refFont
  ctx.fillStyle = '#475569'
  ctx.textAlign = 'right'
  ctx.fillText(refTxt, W - PX, fy + 24)
  ctx.textAlign = 'left'

  return canvas
}

export async function downloadReceiptFile(canvas: HTMLCanvasElement, refSlug: string, format: 'png' | 'pdf') {
  if (format === 'png') {
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `surexend-receipt-${refSlug}.png`
    link.click()
    return
  }
  const { jsPDF } = await import('jspdf')
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] })
  pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save(`surexend-receipt-${refSlug}.pdf`)
}