import 'react'

declare module 'react' {
  interface CSSProperties {
    /** Electron: ventana arrastrable desde la barra */
    WebkitAppRegion?: 'drag' | 'no-drag' | (string & {})
  }
}
