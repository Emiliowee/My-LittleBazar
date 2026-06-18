import { useCallback, useEffect, useState } from 'react'
import { registerAppConfirm } from '@/lib/appConfirm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function AppConfirmProvider({ children }) {
  const [req, setReq] = useState(null)

  const ask = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setReq({
        message,
        description: typeof opts.description === 'string' ? opts.description : '',
        title: opts.title ?? 'Confirmar',
        destructive: Boolean(opts.destructive),
        confirmLabel: opts.confirmLabel ?? (opts.destructive ? 'Eliminar' : 'Aceptar'),
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        resolve,
      })
    })
  }, [])

  useEffect(() => {
    registerAppConfirm(ask)
    return () => registerAppConfirm(null)
  }, [ask])

  const finish = useCallback(
    (value) => {
      const r = req?.resolve
      setReq(null)
      r?.(value)
    },
    [req],
  )

  return (
    <>
      {children}
      <Dialog
        open={req != null}
        onOpenChange={(open) => {
          if (!open) finish(false)
        }}
      >
        <DialogContent className="z-[300] sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="text-[15px]">{req?.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                {req?.message ? (
                  <p className="whitespace-pre-wrap text-foreground/90">{req.message}</p>
                ) : null}
                {req?.description ? <p className="whitespace-pre-wrap">{req.description}</p> : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => finish(false)}>
              {req?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={req?.destructive ? 'destructive' : 'default'}
              onClick={() => finish(true)}
            >
              {req?.confirmLabel ?? 'Aceptar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
