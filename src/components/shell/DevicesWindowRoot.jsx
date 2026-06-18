import { ThemeProvider } from '@/theme/ThemeProvider.jsx'
import { Toaster } from '@/components/ui/sonner'
import { DevicesApp } from '@/devices/DevicesApp.jsx'
import { useScannerKeymapFix } from '@/hooks/useScannerKeymapFix'

/**
 * `#devices`: ventana de dispositivos abiert desde Ajustes.
 */
export function DevicesWindowRoot() {
  useScannerKeymapFix()
  return (
    <ThemeProvider>
      <div className="h-screen overflow-y-auto bg-background p-4 text-foreground">
        <DevicesApp />
      </div>
      <Toaster position="bottom-right" />
    </ThemeProvider>
  )
}
