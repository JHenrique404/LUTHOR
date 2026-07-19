// Gera build/icon.ico (256x256, PNG embutido) a partir da arte pixel do LUTHOR.
// Nenhum asset externo: o desenho é o MESMO de src/main/tray/tray-icon.ts
// (mantenha os dois mapas em sincronia ao evoluir o ícone).
// Uso: npm run generate:icon
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAP16 = [
  '................',
  '..pppppppppppp..',
  '.pnnnnnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccnnnnnnnnp.',
  '.pnnccccccccnnp.',
  '.pnnccccccccnnp.',
  '.pnnnnnnnnnnnnp.',
  '.pnnnnnnnnwwnnp.',
  '..pppppppppppp..',
  '................'
]

const PALETTE = {
  p: [0xa5, 0x83, 0xff, 0xff],
  n: [0x0b, 0x10, 0x20, 0xff],
  c: [0x45, 0xd8, 0xe8, 0xff],
  w: [0xe8, 0xec, 0xf8, 0xff]
}

// ── PNG mínimo (RGBA 8-bit, filtro 0) ──────────────────────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(size, scale) {
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4)
    raw[row] = 0 // filtro none
    for (let x = 0; x < size; x++) {
      const ch = MAP16[Math.floor(y / scale)][Math.floor(x / scale)]
      const rgba = PALETTE[ch] ?? [0, 0, 0, 0]
      raw.set(rgba, row + 1 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ── ICO com PNG embutido (formato Vista+) ──────────────────────────────────
function buildIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // tipo: icon
  header.writeUInt16LE(1, 4) // 1 imagem
  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // 0 = 256
  entry[1] = size >= 256 ? 0 : size
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12) // offset (6 + 16)
  return Buffer.concat([header, entry, png])
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')
mkdirSync(outDir, { recursive: true })
const png = encodePng(256, 16)
writeFileSync(join(outDir, 'icon.ico'), buildIco(png, 256))
console.log('build/icon.ico gerado (256x256, PNG embutido)')
