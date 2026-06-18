import { ThemeProvider } from '@/theme/ThemeProvider.jsx'
import { AppConfirmProvider } from '@/components/shell/AppConfirmProvider.jsx'
import { Toaster } from '@/components/ui/sonner'
import { PdvView } from '@/views/PdvView.jsx'
import { MlbChromeHeader } from '@/components/shell/MlbChromeHeader.jsx'
import { useScannerKeymapFix } from '@/hooks/useScannerKeymapFix'

/**
 * Shell de la segunda ventana (hash `#pdv`). La ventana principal sigue abierta.
 */
export function PdvWindowRoot() {
  const showChrome =
    typeof window !== 'undefined' && window.bazar?.runtime?.platform !== 'darwin'
  useScannerKeymapFix()

  return (
    <ThemeProvider>
      <AppConfirmProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--mlb-bg-app)] text-[var(--mlb-text-primary)]">
          {showChrome ? <MlbChromeHeader>Punto de venta</MlbChromeHeader> : null}
          <main className="min-h-0 flex-1 overflow-hidden">
            <PdvView />
          </main>
          <Toaster position="bottom-right" />
        </div>
      </AppConfirmProvider>
    </ThemeProvider>
  )
}
