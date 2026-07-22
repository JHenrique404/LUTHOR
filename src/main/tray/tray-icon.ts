import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'

/**
 * Ícone de bandeja ORIGINAL do LUTHOR, gerado em código a partir de um mapa
 * de pixels (nenhum asset externo; funciona igual em dev e no empacotamento,
 * pois não depende de caminho de arquivo).
 *
 * Legenda: '.' transparente | p roxo (orquestração) | n azul-noite |
 * c ciano (execução) | w branco
 */
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

/** RGBA por caractere do mapa. */
const PALETTE: Record<string, [number, number, number, number]> = {
  p: [0xa5, 0x83, 0xff, 0xff],
  n: [0x0b, 0x10, 0x20, 0xff],
  c: [0x45, 0xd8, 0xe8, 0xff],
  w: [0xe8, 0xec, 0xf8, 0xff]
}

/**
 * Converte o mapa em bitmap raw no layout esperado por
 * nativeImage.createFromBitmap (BGRA no Windows), com fator de escala inteiro.
 */
function toBitmap(map: string[], scale: number): Buffer {
  const size = map.length * scale
  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = map[Math.floor(y / scale)][Math.floor(x / scale)]
      const rgba = PALETTE[ch]
      const offset = (y * size + x) * 4
      if (!rgba) continue // transparente (alpha 0 do alloc)
      const [r, g, b, a] = rgba
      buffer[offset] = b
      buffer[offset + 1] = g
      buffer[offset + 2] = r
      buffer[offset + 3] = a
    }
  }
  return buffer
}

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromBitmap(toBitmap(MAP16, 1), { width: 16, height: 16 })
  // Representação 2x para escalas de DPI altas do Windows.
  image.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: toBitmap(MAP16, 2)
  })
  return image
}

/**
 * Ícone da JANELA (taskbar/alt-tab), evoluído da mesma fonte visual da
 * bandeja — nada de ícone padrão do Electron. Gerado em código: vale em dev
 * e no build. O instalador usa build/icon.ico (mesmo desenho, ver
 * scripts/generate-icon.mjs).
 */
export function createWindowIcon(): NativeImage {
  const image = nativeImage.createFromBitmap(toBitmap(MAP16, 2), { width: 32, height: 32 })
  image.addRepresentation({
    scaleFactor: 2,
    width: 64,
    height: 64,
    buffer: toBitmap(MAP16, 4)
  })
  return image
}

/** Fonte visual compartilhada (mapa + paleta) para o gerador do .ico. */
export const TRAY_PIXEL_MAP = MAP16
export const TRAY_PIXEL_PALETTE = PALETTE
