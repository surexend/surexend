// Self-contained receipt renderer for the chat assistant & history downloads.
// Draws the receipt directly on a Canvas 2D context with exact pixel positions.
// jsPDF is lazy-loaded only for the PDF path.

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
      if (cx.measureText(t).width > maxW && line) {
        out.push(line)
        line = ch
      } else {
        line = t
      }
    }
    if (line) out.push(line)
    return out
  }

  const meta = tx?.metadata || {}
  const swap = getSwapInfo(tx)
  const statusU = (tx?.status || '').toUpperCase()
  const isFailed = statusU === 'FAILED'
  const typeUpper = (tx?.type || '').toUpperCase()
  const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'
  const isDebit = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
  const isSwap = !!swap

  // Type pill (small, top-left) — Credit / Debit / Swap / Failed
  const typePill = isFailed
    ? { label: 'Failed', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', text: '#F87171', dot: '#F87171' }
    : isSwap
      ? { label: 'Swap', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#FBBF24', dot: '#FBBF24' }
      : isDebit
        ? { label: 'Debit', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.20)', text: '#E2E8F0', dot: '#E2E8F0' }
        : { label: 'Credit', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', text: '#34D399', dot: '#34D399' }

  const dateTxt = new Date(tx?.createdAt || tx?.date || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const symbol = tx?.currency === 'NGN' ? '₦' : tx?.currency === 'GHS' ? 'GH₵' : tx?.currency === 'KES' ? 'KSh' : '$'

  const amountLabel = swap ? 'YOU RECEIVED' : 'AMOUNT'
  const amountValue = isFailed
    ? 'Failed'
    : swap
      ? `${currencySymbol(swap.to)}${formatAmount(swap.toAmount)}`
      : `${symbol}${formatAmount(Number(tx?.amount || 0))}`
  const amountSub = isFailed
    ? null
    : swap
      ? null
      : tx?.currency && tx?.currency !== 'USDT'
        ? tx.currency
        : 'USDC'

  let amountSize = 40
  while (amountSize > 22 && measure(amountValue, `900 ${amountSize}px ${font}`) > CW) amountSize -= 2

  // Swap conversion row
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

  // Failure box text
  let failLines: string[] = []
  const errorReason = meta.errorReason || tx?.errorReason
  if (isFailed) {
    const failMsg = errorReason || 'This transaction was not completed. The sent amount (if any) has been refunded to your available balance.'
    failLines = wrap(failMsg, `400 11px ${font}`, CW - 32)
  }

  // Build detail rows
  const isBill = typeUpper === 'BILL_PAYMENT'
  const bill = tx?.bill || null
  const billMeta = meta
  const internal = meta?.delivery === 'internal'
  const feeVal = Number(tx?.fee || 0)
  const feeTxt = feeVal > 0 ? `$${feeVal.toFixed(2)}` : 'Free'
  const dateValue = new Date(tx?.createdAt || tx?.date || Date.now()).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
  const fromParty = meta.fromTag
    ? `@${meta.fromTag}${meta.senderName ? ` · ${meta.senderName}` : ''}`
    : null
  const toParty = meta.toTag
    ? `@${meta.toTag}${meta.recipientName ? ` · ${meta.recipientName}` : ''}`
    : null
  const isSend = typeUpper === 'SEND'
  const network = meta.network || tx?.network || 'ARC'
  const displayNetwork = isSend ? (meta.destinationNetwork || network) : network

  const rows: { label: string; value: string; mono?: boolean; accent?: boolean }[] = swap
    ? [
        { label: 'You swapped', value: `${currencySymbol(swap.from)}${formatAmount(swap.fromAmount)} ${swap.from}` },
        { label: 'You received', value: `${currencySymbol(swap.to)}${formatAmount(swap.toAmount)} ${swap.to}`, accent: true },
        ...(swap.rate ? [{ label: 'Rate', value: `1 ${swap.from} = ${formatAmount(swap.rate, 6)} ${swap.to}` }] : []),
        { label: 'Fee', value: feeTxt },
        { label: 'Reference', value: tx?.reference || '—', mono: true },
        { label: 'Date', value: dateValue },
      ]
    : isBill
      ? [
          { label: 'Invoice No', value: tx?.reference || '—', mono: true, accent: true },
          { label: 'Service', value: `${bill?.provider || billMeta.provider || 'Bill'} ${bill?.type === 'data' ? 'Data' : 'Airtime'}` },
          { label: 'Recipient', value: bill?.recipient || '—', mono: true },
          ...(bill?.type === 'data' && billMeta.planName ? [{ label: 'Plan', value: `${billMeta.planName}${billMeta.planValidity ? ` · ${billMeta.planValidity}` : ''}` }] : []),
          { label: 'Amount Paid', value: `₦${formatAmount(Number(bill?.amount ?? tx?.amount ?? 0))}`, accent: true },
          { label: 'USDC', value: `$${formatAmount(Number(tx?.amount || 0))}` },
          ...(billMeta.rate ? [{ label: 'Rate', value: `₦${formatAmount(billMeta.rate)} / USDC` }] : []),
          ...(meta.smartspeed?.reference ? [{ label: 'Provider Ref', value: meta.smartspeed.reference, mono: true }] : []),
          ...(meta.error ? [{ label: 'Error', value: meta.error }] : []),
          { label: 'Date', value: dateValue },
        ]
      : internal
        ? [
            ...(typeUpper === 'RECEIVE' && fromParty ? [{ label: 'From', value: fromParty, accent: true }] : []),
            ...(typeUpper !== 'RECEIVE' && toParty ? [{ label: 'To', value: toParty, accent: true }] : []),
            { label: 'Delivery', value: 'Instant · SureX Tag' },
            { label: 'Reference', value: tx?.reference || '—', mono: true },
            { label: 'Amount', value: `${symbol}${formatAmount(Number(tx?.amount || 0))}` },
            { label: 'Fee', value: feeTxt },
            { label: 'Date', value: dateValue },
          ]
        : [
            { label: 'Reference', value: tx?.reference || '—', mono: true },
            { label: 'Amount', value: `${symbol}${formatAmount(Number(tx?.amount || 0))}${tx?.currency && tx?.currency !== 'USDT' ? ` ${tx?.currency}` : ' USD'}`, accent: true },
            { label: 'Fee', value: feeTxt },
            { label: 'Network', value: displayNetwork },
            { label: 'Date', value: dateValue },
            ...(meta.sourceAddress ? [{ label: 'From Address', value: meta.sourceAddress, mono: true }] : []),
            ...(meta.destinationAddress || tx?.recipient ? [{ label: 'To Address', value: meta.destinationAddress || tx?.recipient, mono: true }] : []),
            ...(meta.txHash ? [{ label: 'Transaction Hash', value: meta.txHash, mono: true }] : []),
          ]

  if (rows.length && typeof meta.note === 'string' && meta.note.trim()) {
    if (meta.channel === 'manual_deposit') {
      rows.unshift({ label: 'Narration', value: meta.note.trim() })
      rows.unshift({ label: 'Channel', value: 'Admin deposit' })
    } else {
      rows.unshift({ label: 'Narration', value: meta.note.trim() })
    }
  }

  // ── Layout pass (compute total height) ──
  let y = PY
  y += 32 + 22 // header + gap
  y += 24 + 18 // status row + gap
  y += panelH + 24 // amount panel + gap

  if (isFailed) {
    y += 14 + 13 + failLines.length * 17 + 13 + 24
  }

  const rowsTop = y
  y += 20
  const rowLines: { label: string; lines: string[]; mono: boolean; accent: boolean }[] = []
  for (const row of rows) {
    const vf = row.mono ? `600 11px ${mono}` : `600 11px ${font}`
    const lf = `500 11px ${font}`
    const labelW = measure(row.label, lf)
    const lines = wrap(row.value, vf, Math.max(80, CW - labelW - 16))
    rowLines.push({ label: row.label, lines, mono: !!row.mono, accent: !!row.accent })
    y += Math.max(15, lines.length * 16) + 12
  }

  // NO Explorer Link block drawn here (User receipts carry NO Explorer button)
  y += 24 + 18 + 32
  const H = y + PY

  // ── Render pass ──
  const canvas = document.createElement('canvas')
  const S = 2
  canvas.width = W * S
  canvas.height = H * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)
  ctx.fillStyle = '#060608'
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
    const widths = [...text].map((ch) => cx.measureText(ch).width)
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

  // Header: logo + wordmark
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

  // Type pill row (Credit / Debit / Swap / Failed)
  const statusY = PY + 32 + 22
  const typeLabel = typePill.label
  const typeW = measure(typeLabel, `700 10px ${font}`) + 12 + 8 + 10 + 12
  roundRect(PX, statusY, typeW, 24, 999)
  ctx.fillStyle = typePill.bg
  ctx.fill()
  roundRect(PX, statusY, typeW, 24, 999)
  ctx.strokeStyle = typePill.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(PX + 14, statusY + 12, 3, 0, Math.PI * 2)
  ctx.fillStyle = typePill.dot
  ctx.fill()
  ctx.font = `700 10px ${font}`
  ctx.fillStyle = typePill.text
  ctx.fillText(typeLabel, PX + 22, statusY + 15.5)
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
  spaced(amountLabel, `700 9px ${font}`, W / 2, panelY + labelOff, '#64748B', 2.5, 'center')
  ctx.font = `900 ${amountSize}px ${font}`
  ctx.fillStyle = '#ffffff'
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

  // Failure box
  if (isFailed) {
    const fy = panelY + panelH + 14
    const fh = 13 + 13 + failLines.length * 17
    roundRect(PX, fy, CW, fh, 12)
    ctx.fillStyle = 'rgba(239,68,68,0.08)'
    ctx.fill()
    roundRect(PX, fy, CW, fh, 12)
    ctx.strokeStyle = 'rgba(239,68,68,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = `700 11px ${font}`
    ctx.fillStyle = '#F87171'
    ctx.fillText('Transaction Failed', PX + 14, fy + 20)
    ctx.font = `400 11px ${font}`
    ctx.fillStyle = '#FDA4AF'
    failLines.forEach((line, i) => ctx.fillText(line, PX + 14, fy + 20 + 13 + i * 17))
  }

  // Detail rows
  let ry = rowsTop + 20
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PX, rowsTop + 10)
  ctx.lineTo(W - PX, rowsTop + 10)
  ctx.stroke()
  for (const row of rowLines) {
    const lf = `500 11px ${font}`
    const vf = row.mono ? `600 11px ${mono}` : `600 11px ${font}`
    const labelW = measure(row.label, lf)
    ctx.font = lf
    ctx.fillStyle = '#64748B'
    ctx.fillText(row.label, PX, ry + 13)
    ctx.font = vf
    ctx.fillStyle = row.accent ? accentHex : '#ffffff'
    ctx.textAlign = 'right'
    row.lines.forEach((line, i) => ctx.fillText(line, W - PX, ry + 13 + i * 16))
    ctx.textAlign = 'left'
    ry += Math.max(15, row.lines.length * 16) + 12
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