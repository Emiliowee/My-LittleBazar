import { useEffect, useRef } from 'react'

const SHIFTED_DIGIT = {
  0: ')',
  1: '!',
  2: '@',
  3: '#',
  4: '$',
  5: '%',
  6: '^',
  7: '&',
  8: '*',
  9: '(',
}

const PUNCT = {
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Backquote: ['`', '~'],
  Space: [' ', ' '],
}

const NUMPAD_SYM = {
  NumpadDivide: '/',
  NumpadMultiply: '*',
  NumpadSubtract: '-',
  NumpadAdd: '+',
  NumpadDecimal: '.',
}

/**
 * Mapea `e.code` a su carácter US-layout (lo que el escáner intenta enviar).
 * Devuelve `null` si la tecla no es imprimible.
 */
function usCharFromCode(code, shift) {
  if (!code) return null
  if (/^Key[A-Z]$/.test(code)) {
    const L = code.slice(3)
    return shift ? L : L.toLowerCase()
  }
  if (/^Digit\d$/.test(code)) {
    const d = code.slice(5)
    return shift ? SHIFTED_DIGIT[d] || d : d
  }
  if (/^Numpad\d$/.test(code)) return code.slice(6)
  if (NUMPAD_SYM[code]) return NUMPAD_SYM[code]
  if (PUNCT[code]) return PUNCT[code][shift ? 1 : 0]
  return null
}

/**
 * Lector HID global. Detecta ráfagas (escáner) por tiempo entre teclas y
 * dispara automáticamente cuando termina la ráfaga, aunque el escáner no
 * envíe Enter. Para no falsear con el tipeo humano, se descarta el buffer
 * en cuanto una tecla llega más lenta que `burstMs`.
 *
 * El carácter se deriva de `e.code` (layout US) en vez de `e.key`, así un
 * escáner que pulsa la tecla "Minus" se lee como `-` aunque Windows esté
 * en español (donde esa misma tecla escribe `'`).
 *
 * @param {(code: string) => void} onScan
 * @param {{ minLength?: number, timeout?: number, burstMs?: number }} [options]
 */
export function useBarcode(onScan, options = {}) {
  const { minLength = 3, timeout: commitDelay = 80, burstMs = 35 } = options
  const buffer = useRef('')
  const timer = useRef(null)
  const lastTs = useRef(0)

  useEffect(() => {
    const reset = () => {
      buffer.current = ''
      lastTs.current = 0
    }

    const fire = () => {
      const code = buffer.current
      reset()
      if (code.length >= minLength) onScan(code)
    }

    const handleKeydown = (e) => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest('[data-no-barcode="true"]')) {
        return
      }
      const t = e.target
      if (t instanceof HTMLElement && t.closest('[data-no-barcode="true"]')) {
        return
      }
      if (
        t &&
        (t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement ||
          (t instanceof HTMLElement && t.isContentEditable))
      ) {
        return
      }

      if (e.key === 'Enter') {
        if (typeof document !== 'undefined' && document.querySelector('[data-no-barcode="true"]')) {
          reset()
          return
        }
        clearTimeout(timer.current)
        fire()
        return
      }

      if (e.repeat) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const fromCode = usCharFromCode(e.code, e.shiftKey)
      const ch = fromCode ?? (e.key && e.key.length === 1 ? e.key : null)
      if (!ch) return

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = lastTs.current ? now - lastTs.current : 0
      if (lastTs.current && dt > burstMs) {
        // Tecla lenta: tipeo humano. Reiniciamos el buffer para evitar
        // armar un "código" pegando keystrokes manuales.
        buffer.current = ''
      }
      buffer.current += ch
      lastTs.current = now

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        fire()
      }, commitDelay)
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      clearTimeout(timer.current)
    }
  }, [onScan, minLength, commitDelay, burstMs])
}
