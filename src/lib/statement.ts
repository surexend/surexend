import { jsPDF } from 'jspdf'
import { currencySymbol, formatAmount, getSwapInfo } from '@/lib/utils'

export interface StatementTx {
  id: string
  reference: string
  type: string
  status: string
  amount: number
  fee: number
  currency: string
  createdAt: string | Date
  metadata?: any
}

export interface StatementUser {
  name: string
  email: string
  surexTag?: string
  accountNumber?: string
}

export interface GenerateStatementOpts {
  user: StatementUser
  transactions: StatementTx[]
  periodLabel: string
  variant: 'gold' | 'lemon'
  accentHex: string
}

/**
 * Format currency amounts safely for standard PDF fonts (Helvetica).
 * Standard PDF Helvetica fonts do not include Unicode glyphs like Naira (₦),
 * Cedi (GH₵), or Shilling (KSh), causing PDF engines to output broken '¦' symbols.
 * Using standard ISO codes or safe symbols ensures 100% crisp, uncorrupted output.
 */
export function formatPdfAmount(amount: number, currency: string = 'USD'): string {
  const code = (currency || 'USD').toUpperCase()
  const numStr = formatAmount(amount)
  if (code === 'USD') return `$${numStr}`
  if (code === 'USDC' || code === 'USDT') return `$${numStr} ${code}`
  if (code === 'EUR') return `€${numStr}`
  if (code === 'GBP') return `£${numStr}`
  return `${numStr} ${code}`
}

export async function generateStatementPDF(opts: GenerateStatementOpts) {
  const { user, transactions, periodLabel, variant, accentHex } = opts

  // Create A4 PDF (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const W = 210
  const H = 297
  const margin = 14
  const contentW = W - margin * 2

  // Color Palette
  const bgDark = [10, 11, 14] // #0a0b0e
  const cardBg = [18, 20, 25] // #121419
  const textWhite = [255, 255, 255]
  const textMuted = [148, 163, 184] // #94a3b8
  const textDarkMuted = [100, 116, 139] // #64748b
  const greenCol = [52, 211, 153]
  const redCol = [248, 113, 113]

  // Convert Hex to RGB array
  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '')
    const num = parseInt(clean, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }
  const accentRgb = hexToRgb(accentHex)

  // 1. Page Background (Dark Theme)
  doc.setFillColor(bgDark[0], bgDark[1], bgDark[2])
  doc.rect(0, 0, W, H, 'F')

  // Top Accent Line
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2])
  doc.rect(0, 0, W, 2.5, 'F')

  // 2. Header
  // Brand Title: SUREXEND
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('SURE', margin, 18)
  const sureW = doc.getTextWidth('SURE')
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2])
  doc.text('X', margin + sureW, 18)
  const xW = doc.getTextWidth('X')
  doc.setTextColor(255, 255, 255)
  doc.text('END', margin + sureW + xW, 18)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
  doc.text('FINANCIAL SYSTEMS · OFFICIAL ACCOUNT STATEMENT', margin, 24)

  // Document Info (Right Aligned)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('ACCOUNT STATEMENT', W - margin, 17, { align: 'right' })

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
  doc.text(`Period: ${periodLabel}`, W - margin, 22, { align: 'right' })
  doc.text(`Issued: ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`, W - margin, 26, { align: 'right' })

  // Divider
  doc.setDrawColor(40, 44, 52)
  doc.setLineWidth(0.4)
  doc.line(margin, 30, W - margin, 30)

  // 3. User & Summary Header Card
  let curY = 34
  const cardH = 28

  // Container Box
  doc.setFillColor(cardBg[0], cardBg[1], cardBg[2])
  doc.roundedRect(margin, curY, contentW, cardH, 3, 3, 'F')
  doc.setDrawColor(40, 44, 52)
  doc.roundedRect(margin, curY, contentW, cardH, 3, 3, 'S')

  // User Info (Left side)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(textWhite[0], textWhite[1], textWhite[2])
  doc.text(user.name || 'Account Holder', margin + 6, curY + 8)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
  doc.text(`${user.surexTag ? `@${user.surexTag} · ` : ''}${user.email}`, margin + 6, curY + 14)
  doc.text(`Account ID: ${user.accountNumber || user.email}`, margin + 6, curY + 20)

  // Build summaries by currency. A statement must never total USDC and local
  // currencies as if they were all dollars; conversions are exchanges, not an
  // inflow or outflow, and remain fully detailed in the transaction table.
  const credits = new Map<string, number>()
  const debits = new Map<string, number>()
  transactions.forEach((t) => {
    if ((t.status || '').toUpperCase() !== 'COMPLETED') return
    const typeU = (t.type || '').toUpperCase()
    if (typeU === 'CONVERT') return
    const target = typeU === 'RECEIVE' || typeU === 'REFERRAL_EARNING' ? credits : debits
    const currency = (t.currency || 'USDC').toUpperCase()
    target.set(currency, (target.get(currency) || 0) + Number(t.amount || 0))
  })
  const formatBreakdown = (totals: Map<string, number>) => {
    const items = [...totals.entries()].map(([currency, value]) => formatPdfAmount(value, currency))
    return items.length ? items.slice(0, 2).join(' · ') + (items.length > 2 ? ` +${items.length - 2}` : '') : '—'
  }

  // Statement metrics remain currency-safe and printable at a glance.
  const statBoxW = 38
  const rightX = W - margin - 6
  doc.setFontSize(7)
  doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
  doc.text('RECORDS', rightX - statBoxW * 2 - 18, curY + 9, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(textWhite[0], textWhite[1], textWhite[2])
  doc.text(`${transactions.length}`, rightX - statBoxW * 2 - 18, curY + 17, { align: 'right' })

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
  doc.text('INFLOW BY CURRENCY', rightX - statBoxW - 6, curY + 9, { align: 'right' })
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(greenCol[0], greenCol[1], greenCol[2])
  doc.text(formatBreakdown(credits), rightX - statBoxW - 6, curY + 17, { align: 'right' })

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
  doc.text('OUTFLOW BY CURRENCY', rightX, curY + 9, { align: 'right' })
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(redCol[0], redCol[1], redCol[2])
  doc.text(formatBreakdown(debits), rightX, curY + 17, { align: 'right' })

  curY += cardH + 8

  // 4. Ledger Table Header
  const colX = {
    date: margin + 4,
    type: margin + 30,
    ref: margin + 92,
    status: margin + 140,
    amount: W - margin - 4,
  }

  const drawTableHeader = (y: number) => {
    doc.setFillColor(18, 20, 25)
    doc.rect(margin, y, contentW, 7, 'F')
    doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2])
    doc.line(margin, y, W - margin, y)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2])
    doc.text('DATE', colX.date, y + 4.8)
    doc.text('TYPE / DESCRIPTION', colX.type, y + 4.8)
    doc.text('REFERENCE', colX.ref, y + 4.8)
    doc.text('STATUS', colX.status, y + 4.8)
    doc.text('AMOUNT', colX.amount, y + 4.8, { align: 'right' })
  }

  drawTableHeader(curY)
  curY += 7

  // 5. Render Transaction Rows
  const rowHeight = 8
  const maxY = H - 20

  transactions.forEach((tx, i) => {
    // Check if new page needed
    if (curY + rowHeight > maxY) {
      doc.addPage('a4', 'portrait')
      // Fill page background
      doc.setFillColor(bgDark[0], bgDark[1], bgDark[2])
      doc.rect(0, 0, W, H, 'F')

      curY = 16
      drawTableHeader(curY)
      curY += 7
    }

    // Alternating Row BG
    if (i % 2 === 0) {
      doc.setFillColor(14, 16, 21)
      doc.rect(margin, curY, contentW, rowHeight, 'F')
    }

    // Border line bottom
    doc.setDrawColor(25, 28, 36)
    doc.line(margin, curY + rowHeight, W - margin, curY + rowHeight)

    // Data formatting
    const dateStr = new Date(tx.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    })
    const typeUpper = (tx.type || '').toUpperCase()
    const statusUpper = (tx.status || '').toUpperCase()
    const swap = getSwapInfo(tx)

    const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'

    let amountFormatted = ''
    if (swap) {
      amountFormatted = formatPdfAmount(swap.toAmount, swap.to)
    } else {
      amountFormatted = formatPdfAmount(Number(tx.amount || 0), tx.currency)
    }

    // Human-readable transaction detail gives a statement enough context to
    // reconcile without exposing sensitive wallet addresses in full.
    const meta = tx.metadata || {}
    let descText = String(tx.type || 'TRANSACTION').replace(/_/g, ' ')
    if (swap) {
      descText = `Convert ${formatPdfAmount(swap.fromAmount, swap.from)} to ${formatPdfAmount(swap.toAmount, swap.to)}`
    } else if (meta.planName) {
      descText = `${descText} · ${meta.planName}`
    } else if (meta.toTag) {
      descText = `Sent to @${meta.toTag}`
    } else if (meta.fromTag) {
      descText = `Received from @${meta.fromTag}`
    } else if (meta.destinationNetwork || meta.network) {
      descText = `${descText} · ${meta.destinationNetwork || meta.network}`
    } else if (meta.note) {
      descText = `${descText} · ${String(meta.note)}`
    }

    // Date
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text(dateStr, colX.date, curY + 5.2)

    // Type / Description
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(textWhite[0], textWhite[1], textWhite[2])
    doc.text(descText.slice(0, 28), colX.type, curY + 5.2)

    // Reference ID
    doc.setFont('courier', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
    doc.text((tx.reference || '—').slice(0, 22), colX.ref, curY + 5.2)

    // Status Badge
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    if (statusUpper === 'COMPLETED') {
      doc.setTextColor(greenCol[0], greenCol[1], greenCol[2])
      doc.text('COMPLETED', colX.status, curY + 5.2)
    } else if (statusUpper === 'FAILED') {
      doc.setTextColor(redCol[0], redCol[1], redCol[2])
      doc.text('FAILED', colX.status, curY + 5.2)
    } else {
      doc.setTextColor(245, 158, 11)
      doc.text('PENDING', colX.status, curY + 5.2)
    }

    // Amount
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    if (statusUpper === 'FAILED') {
      doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
    } else if (isCredit) {
      doc.setTextColor(greenCol[0], greenCol[1], greenCol[2])
    } else {
      doc.setTextColor(textWhite[0], textWhite[1], textWhite[2])
    }
    doc.text(amountFormatted, colX.amount, curY + 5.2, { align: 'right' })

    curY += rowHeight
  })

  // Footer on Last Page
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(textDarkMuted[0], textDarkMuted[1], textDarkMuted[2])
  doc.text(
    'SureXend Financial Systems · Official Verified Account Statement',
    W / 2,
    H - 8,
    { align: 'center' }
  )

  // Save PDF
  const refSlug = periodLabel.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  doc.save(`surexend-statement-${refSlug}.pdf`)
}
