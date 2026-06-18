import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PdvWindowRoot } from '@/components/shell/PdvWindowRoot.jsx'
import { DevicesWindowRoot } from '@/components/shell/DevicesWindowRoot.jsx'
import {
  isDevicesStandaloneWindow,
  isPdvStandaloneWindow,
} from '@/lib/pdvStandalone'

function pickRootComponent() {
  if (typeof window !== 'undefined' && isPdvStandaloneWindow()) return PdvWindowRoot
  if (typeof window !== 'undefined' && isDevicesStandaloneWindow()) return DevicesWindowRoot
  return App
}

const Root = pickRootComponent()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
