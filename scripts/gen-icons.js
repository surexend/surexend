// Regenerate every PWA icon + favicon from the real SureXend gold logo mark.
//   node scripts/gen-icons.js
// Sources: public/logo-mark-gold.png (gold mark, transparent background)
// Output:  public/icons/*, public/favicon.png
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const SRC = path.join(__dirname, '..', 'public', 'logo-mark-gold.png')
const OUT = path.join(__dirname, '..', 'public', 'icons')

const BG_TOP = [10, 15, 30]    // #0A0F1E
const BG_BOT = [22, 32, 58]    // #16203A
const GLOW = [255, 215, 0]     // gold

function load(src) {
  const png = PNG.sync.read(fs.readFileSync(src))
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  const w = maxX - minX + 1, h = maxY - minY + 1
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * png.width + (minX + x)) * 4
      const di = (y * w + x) * 4
      data[di] = png.data[si]; data[di + 1] = png.data[si + 1]
      data[di + 2] = png.data[si + 2]; data[di + 3] = png.data[si + 3]
    }
  return { data, w, h }
}

// Area-average resample — best quality for downscaling logos to icon sizes.
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  const sx = sw / dw, sy = sh / dh
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * sy, y1 = Math.min((dy + 1) * sy, sh)
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * sx, x1 = Math.min((dx + 1) * sx, sw)
      let r = 0, g = 0, b = 0, a = 0, wsum = 0
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++)
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const w = (Math.min(x1, px + 1) - Math.max(x0, px)) * (Math.min(y1, py + 1) - Math.max(y0, py))
          const i = (py * sw + px) * 4
          r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += src[i + 3] * w
          wsum += w
        }
      const oi = (dy * dw + dx) * 4
      out[oi] = Math.round(r / wsum)
      out[oi + 1] = Math.round(g / wsum)
      out[oi + 2] = Math.round(b / wsum)
      out[oi + 3] = Math.round(a / wsum)
    }
  }
  return out
}

function compose(size, markScale, opts = {}) {
  const { glow = true, rounded = false, radius = 0 } = opts
  const buf = Buffer.alloc(size * size * 4)
  const c = size / 2
  const r = rounded ? radius || size * 0.22 : 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-corner mask for favicons
      let inR = true
      if (r > 0) {
        const dx = x < r ? r - x : x > size - r ? x - (size - r) : 0
        const dy = y < r ? r - y : y > size - r ? y - (size - r) : 0
        if (dx && dy && dx * dx + dy * dy > r * r) inR = false
      }
      const i = (y * size + x) * 4
      if (!inR) { buf[i + 3] = 0; continue }
      const t = y / (size - 1)
      let bgR = BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t
      let bgG = BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t
      let bgB = BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t
      if (glow) {
        const d = Math.hypot(x - c, y - c) / c // 0 centre → 1 edge
        const f = Math.max(0, 1 - d) * 0.16
        bgR += GLOW[0] * f; bgG += GLOW[1] * f; bgB += GLOW[2] * f
      }
      buf[i] = Math.min(255, bgR) | 0
      buf[i + 1] = Math.min(255, bgG) | 0
      buf[i + 2] = Math.min(255, bgB) | 0
      buf[i + 3] = 255
    }
  }
  // draw mark
  const mw = mark.w, mh = mark.h
  const scale = (size * markScale) / Math.max(mw, mh)
  const dw = Math.round(mw * scale), dh = Math.round(mh * scale)
  const markRes = resize(mark.data, mw, mh, dw, dh)
  const ox = Math.round((size - dw) / 2), oy = Math.round((size - dh) / 2)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const si = (y * dw + x) * 4
      const sa = markRes[si + 3] / 255
      if (sa <= 0) continue
      const di = ((oy + y) * size + (ox + x)) * 4
      buf[di] = markRes[si] * sa + buf[di] * (1 - sa)
      buf[di + 1] = markRes[si + 1] * sa + buf[di + 1] * (1 - sa)
      buf[di + 2] = markRes[si + 2] * sa + buf[di + 2] * (1 - sa)
      buf[di + 3] = Math.max(buf[di + 3], markRes[si + 3])
    }
  }
  return PNG.sync.write({ width: size, height: size, data: buf })
}

const mark = load(SRC)
console.log(`source mark: ${mark.w}x${mark.h}`)
fs.mkdirSync(OUT, { recursive: true })

const sizes = [512, 384, 192, 152, 144, 128, 96, 72, 48, 32, 16]
for (const s of sizes) fs.writeFileSync(path.join(OUT, `icon-${s}.png`), compose(s, s <= 32 ? 0.72 : 0.62, { rounded: s <= 32 }))
fs.writeFileSync(path.join(OUT, 'maskable-512.png'), compose(512, 0.5, { glow: true }))
fs.writeFileSync(path.join(OUT, 'maskable-192.png'), compose(192, 0.5, { glow: true }))
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), compose(180, 0.64, { rounded: true, radius: 40 }))
for (const name of ['shortcut-send', 'shortcut-convert', 'shortcut-bills']) {
  fs.writeFileSync(path.join(OUT, `${name}.png`), compose(96, 0.62))
}
fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.png'), compose(32, 0.72, { rounded: true }))
console.log('done — all icons regenerated from the real SureXend mark')
