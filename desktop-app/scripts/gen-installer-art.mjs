// Generates the two NSIS installer brand bitmaps (header + sidebar) from the
// canonical vector assets in website/public. sharp renders the SVGs white on
// the #4D6BFE brand background, then a minimal 24-bit BGR BMP encoder writes
// the MUI2 bitmaps (sharp does not output BMP). Run `pnpm run gen-installer-art`
// after changing the brand assets; the committed .bmp files are what the
// installer build consumes.
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const websitePublic = join(desktopRoot, '..', 'website', 'public')
const outDir = join(desktopRoot, 'src-tauri', 'icons', 'installer')

const faviconSvg = join(websitePublic, 'favicon.svg')
const wordmarkSvg = join(websitePublic, 'wordmark.svg')

// #4D6BFE — the brand blue used by the favicon.
const BRAND = { r: 77, g: 107, b: 254 }

function recolorWhite(svg) {
  return svg
    .replaceAll('fill="currentColor"', 'fill="#FFFFFF"')
    .replaceAll('fill="#4D6BFE"', 'fill="#FFFFFF"')
}

async function renderSvgWhite(svgPath, width) {
  const svg = recolorWhite(readFileSync(svgPath, 'utf8'))
  // Render the vector at high density so the later downscale stays crisp.
  return sharp(Buffer.from(svg), { density: 600 })
    .resize({ width })
    .png()
    .toBuffer()
}

// Writes a bottom-up, 24-bit BGR BMP (rows padded to 4 bytes). NSIS MUI reads
// 24-bit BMPs reliably for header and welcome/finish bitmaps.
function encodeBmp24(width, height, rgba) {
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const header = Buffer.alloc(54)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + pixelDataSize, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(0, 30)
  header.writeUInt32LE(pixelDataSize, 34)
  header.writeInt32LE(2835, 38)
  header.writeInt32LE(2835, 42)
  const pixels = Buffer.alloc(pixelDataSize)
  for (let y = 0; y < height; y++) {
    const dstRow = height - 1 - y
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4
      const di = dstRow * rowSize + x * 3
      pixels[di] = rgba[si + 2]
      pixels[di + 1] = rgba[si + 1]
      pixels[di + 2] = rgba[si]
    }
  }
  return Buffer.concat([header, pixels])
}

async function writeBitmap(name, width, height, layers) {
  const composites = []
  for (const layer of layers) {
    const input = await renderSvgWhite(layer.svgPath, layer.width)
    composites.push({ input, left: layer.left, top: layer.top })
  }
  const base = sharp({
    create: { width, height, channels: 4, background: { ...BRAND, alpha: 1 } },
  })
  const raw = await base
    .composite(composites.map(({ input, left, top }) => ({ input, left, top })))
    .raw()
    .toBuffer()
  const path = join(outDir, name)
  writeFileSync(path, encodeBmp24(width, height, raw))
  console.log('wrote ' + path)
}

mkdirSync(outDir, { recursive: true })

// Header (150x57): white wordmark centered on the brand blue.
await writeBitmap('headerImage.bmp', 150, 57, [
  { svgPath: wordmarkSvg, width: 138, left: 6, top: 18 },
])

// Sidebar (164x314): white whale logo upper-center, wordmark lower-center.
await writeBitmap('sidebarImage.bmp', 164, 314, [
  { svgPath: faviconSvg, width: 120, left: 22, top: 55 },
  { svgPath: wordmarkSvg, width: 150, left: 7, top: 250 },
])
