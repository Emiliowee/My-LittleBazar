import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const LabelEditorImmersionContext = createContext(null)

export function LabelEditorImmersionProvider({ children }) {
  const [count, setCount] = useState(0)
  const request = useCallback(() => {
    setCount((c) => c + 1)
  }, [])
  const release = useCallback(() => {
    setCount((c) => Math.max(0, c - 1))
  }, [])
  const value = useMemo(
    () => ({
      active: count > 0,
      request,
      release,
    }),
    [count, request, release],
  )
  return (
    <LabelEditorImmersionContext.Provider value={value}>
      {children}
    </LabelEditorImmersionContext.Provider>
  )
}

export function useLabelEditorImmersion() {
  const ctx = useContext(LabelEditorImmersionContext)
  if (!ctx) {
    throw new Error('useLabelEditorImmersion debe usarse dentro de LabelEditorImmersionProvider')
  }
  return ctx
}
