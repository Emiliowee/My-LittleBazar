import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'

/**
 * @typedef {{
 *   title?: string
 *   destructive?: boolean
 *   confirmLabel?: string
 *   cancelLabel?: string
 *   description?: string
 * }} AppConfirmOptions
 */

/** @type {null | ((message: string, opts?: AppConfirmOptions) => Promise<boolean>)} */
let impl = null

export function registerAppConfirm(fn) {
  impl = fn
}

/**
 * Confirmación in-app cuando hay `AppConfirmProvider`; si no, fallback a `window.confirm`.
 */
export async function appConfirm(message, opts = {}) {
  if (impl) {
    try {
      return await impl(message, opts)
    } finally {
      queueMicrotask(() => releaseModalBodyLocks())
    }
  }
  const full = opts.description ? `${message}\n\n${opts.description}` : message
  const ok = window.confirm(full)
  queueMicrotask(() => releaseModalBodyLocks())
  return ok
}
