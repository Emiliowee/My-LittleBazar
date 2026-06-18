import { useEffect } from 'react'

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
}

const NUMPAD_SYM = {
  NumpadDivide: '/',
  NumpadMultiply: '*',
  NumpadSubtract: '-',
  NumpadAdd: '+',
  NumpadDecimal: '.',
}

/**
 * Devuelve el carácter US-layout correspondiente al `e.code` (lo que el
 * escáner intentó "tipear"). Letras y dígitos coinciden entre layouts;
 * la divergencia importante está en los signos de puntuación.
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
 * Setter nativo: hace que React detecte el cambio de `value` y dispare
 * onChange. Sin esto, React ignora la mutación porque rastrea `value`
 * con un descriptor propio.
 */
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  const setter = desc && desc.set
  if (setter) setter.call(el, value)
  else el.value = value
}

function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  setNativeValue(el, next)
  const pos = start + text.length
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    /* algunos type=email/number no soportan setSelectionRange */
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const SCANNABLE_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'password', 'email'])

/**
 * Corrige el layout del teclado para escáneres HID que emulan teclado US
 * cuando Windows está en español. Detecta la ráfaga (varias teclas en
 * <`burstMs` ms) y, una vez confirmada, reemplaza el carácter del SO por
 * el carácter US-layout derivado de `e.code` directamente en el input
 * que tiene foco.
 *
 * El primer keystroke de la ráfaga puede "filtrar" un carácter mal
 * mapeado al input — pero en los códigos típicos (MSR-000026, EAN13,
 * etc.) las primeras posiciones son letras/dígitos, que coinciden
 * entre layouts. Los signos llegan después, cuando la ráfaga ya está
 * confirmada.
 */
export function useScannerKeymapFix(options = {}) {
  const { burstMs = 35, idleMs = 140 } = options

  useEffect(() => {
    let lastTs = 0
    let burst = false
    let idleTimer = null

    const reset = () => {
      lastTs = 0
      burst = false
    }

    const handler = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.isComposing) return
      if (e.key === 'Enter' || e.key === 'Tab') {
        reset()
        return
      }

      const usChar = usCharFromCode(e.code, e.shiftKey)
      if (!usChar) return

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = lastTs ? now - lastTs : Infinity
      if (dt <= burstMs) burst = true
      lastTs = now
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(reset, idleMs)

      if (!burst) return
      if (usChar === e.key) return

      const target = e.target
      const skip = target instanceof HTMLElement && target.closest?.('[data-no-scanner-fix="true"]')
      if (skip) return

      if (target instanceof HTMLInputElement) {
        const type = (target.type || '').toLowerCase()
        if (target.readOnly || target.disabled) return
        if (!SCANNABLE_INPUT_TYPES.has(type)) return
        e.preventDefault()
        e.stopPropagation()
        insertAtCursor(target, usChar)
        return
      }
      if (target instanceof HTMLTextAreaElement) {
        if (target.readOnly || target.disabled) return
        e.preventDefault()
        e.stopPropagation()
        insertAtCursor(target, usChar)
        return
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        e.preventDefault()
        e.stopPropagation()
        try {
          document.execCommand('insertText', false, usChar)
        } catch {
          /* algunos contenedores no aceptan execCommand */
        }
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [burstMs, idleMs])
}
