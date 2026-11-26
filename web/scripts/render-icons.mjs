/**
 * Renders every installed-app icon from the one vector source, `branding/cashflow-icon.svg`, the way
 * Ordly does: rasterized at 4x and downsampled with Lanczos so edges are smooth on the Home Screen.
 * The maskable icon keeps the art inside Android's safe zone (the central 80%).
 *
 *   pnpm icons
 *
 * After changing the art, bump APP_ICON_VERSION in lib/app-icon.ts so installed clients refetch it.
 */
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync(new URL('../branding/cashflow-icon.svg', import.meta.url))
const TILE = '#1F3A5C'
const SUPERSAMPLE = 4
const OUTPUTS = [
  ['public/apple-touch-icon.png', 180],
  ['public/apple-touch-icon-precomposed.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/icon-1024.png', 1024],
]

async function render(source, size, output) {
  const raster = size * SUPERSAMPLE
  const large = await sharp(source, { density: (72 * raster) / 1024 }).resize(raster, raster).png().toBuffer()
  await sharp(large).resize(size, size, { kernel: 'lanczos3' }).flatten({ background: TILE }).png({ compressionLevel: 9 }).toFile(output)
  console.log(`${output} (${size}×${size})`)
}

for (const [output, size] of OUTPUTS) await render(svg, size, output)

const source = svg.toString()
const BG = '<rect width="1024" height="1024" fill="#1F3A5C"/>'
if (!source.includes(BG)) throw new Error('render-icons: the tile rect changed; update the maskable step')
const maskable = Buffer.from(source.replace(BG, `${BG}<g transform="translate(102.4 102.4) scale(.8)">`).replace('</svg>', '</g></svg>'))
await render(maskable, 512, 'public/icon-maskable-512.png')
