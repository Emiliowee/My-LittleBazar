export const formatPrice = (amount) => {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return String(dateStr)
  }
}

export const formatCode = (code) => code ?? ''
