const fs = require('fs')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const TICKET_DESIGN_DEFAULT = {
  paperWidthMm: 80,
  subtitle: 'Salditos Monserrat',
  footerText: 'Gracias por tu compra',
  showItemCodes: true,
  showCreditSignature: true,
}

function normalizeTicketDesign(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const width = Number(src.paperWidthMm)
  return {
    ...TICKET_DESIGN_DEFAULT,
    ...src,
    paperWidthMm: width === 58 ? 58 : 80,
    subtitle: String(src.subtitle ?? TICKET_DESIGN_DEFAULT.subtitle).trim(),
    footerText: String(src.footerText ?? TICKET_DESIGN_DEFAULT.footerText).trim(),
    showItemCodes: src.showItemCodes !== false,
    showCreditSignature: src.showCreditSignature !== false,
  }
}

/**
 * Genera un PDF de ticket con alto dinámico para evitar desperdicio de papel térmico.
 * Diseñado para papel térmico estándar de 80mm de ancho.
 *
 * @param {string} outPath - Ruta donde se guardará el archivo PDF.
 * @param {object} payload - Estructura de la venta.
 * @returns {Promise<{ok: boolean, path: string}>}
 */
async function renderTicketPdf(outPath, payload) {
  const pdf = await PDFDocument.create()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const design = normalizeTicketDesign(payload?.ticketDesign)
  
  const width = (72 * design.paperWidthMm) / 25.4
  const margin = 12
  const contentWidth = width - 2 * margin

  const blocks = []
  
  // Helper para añadir texto y medir su altura de antemano
  function addText(text, isBold = false, size = 8, align = 'left', spacingAfter = 4) {
    const font = isBold ? bold : reg
    const lines = wrapText(text, font, size, contentWidth)
    const lineHeight = size * 1.2
    const blockHeight = (lines.length * lineHeight) + spacingAfter
    
    blocks.push({
      height: blockHeight,
      render: (page, yTop) => {
        let currentY = yTop
        for (const line of lines) {
          const textWidth = font.widthOfTextAtSize(line, size)
          let x = margin
          if (align === 'center') {
            x = margin + (contentWidth - textWidth) / 2
          } else if (align === 'right') {
            x = margin + contentWidth - textWidth
          }
          page.drawText(line, {
            x,
            y: currentY - size,
            size,
            font,
            color: rgb(0.08, 0.08, 0.09)
          })
          currentY -= lineHeight
        }
      }
    })
  }

  // Ajusta y corta líneas largas respetando el ancho máximo en puntos
  function wrapText(text, font, size, maxWidth) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const lines = []
    let currentLine = ''
    
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      const width = font.widthOfTextAtSize(candidate, size)
      if (width <= maxWidth) {
        currentLine = candidate
      } else {
        if (currentLine) {
          lines.push(currentLine)
        }
        let wWidth = font.widthOfTextAtSize(word, size)
        if (wWidth > maxWidth) {
          let chunk = ''
          for (const char of word) {
            const charCand = chunk + char
            if (font.widthOfTextAtSize(charCand, size) <= maxWidth) {
              chunk = charCand
            } else {
              lines.push(chunk)
              chunk = char
            }
          }
          currentLine = chunk
        } else {
          currentLine = word
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine)
    }
    return lines
  }

  // Divisor continuo o punteado
  function addSeparator(thickness = 0.5, spacingBefore = 4, spacingAfter = 4, isDotted = false) {
    const blockHeight = spacingBefore + thickness + spacingAfter
    blocks.push({
      height: blockHeight,
      render: (page, yTop) => {
        const lineY = yTop - spacingBefore - thickness / 2
        page.drawLine({
          start: { x: margin, y: lineY },
          end: { x: width - margin, y: lineY },
          thickness,
          color: rgb(0.75, 0.75, 0.77),
          dashArray: isDotted ? [2, 2] : undefined
        })
      }
    })
  }

  function addSpace(amount) {
    blocks.push({
      height: amount,
      render: () => {}
    })
  }

  // Añadir un renglón detallado de producto
  function addItemRow(qty, name, price, total) {
    const qtyStr = `${qty}x`
    const priceStr = `$${Number(price).toFixed(2)}`
    const totalStr = `$${Number(total).toFixed(2)}`
    
    const indent = 15
    const nameMaxWidth = contentWidth - indent
    const nameLines = wrapText(name, reg, 8, nameMaxWidth)
    const lineHeight = 9.5
    
    // Altura del bloque: líneas de nombre + línea de detalles + padding
    const blockHeight = (nameLines.length * lineHeight) + lineHeight + 3
    
    blocks.push({
      height: blockHeight,
      render: (page, yTop) => {
        let currentY = yTop
        
        // Cantidad a la izquierda
        page.drawText(qtyStr, {
          x: margin,
          y: currentY - 8,
          size: 8,
          font: bold,
          color: rgb(0.08, 0.08, 0.09)
        })
        
        // Nombre del producto (identado)
        for (const line of nameLines) {
          page.drawText(line, {
            x: margin + indent,
            y: currentY - 8,
            size: 8,
            font: reg,
            color: rgb(0.08, 0.08, 0.09)
          })
          currentY -= lineHeight
        }
        
        // Renglón de precios unitarios e importe total
        page.drawText(`  @ ${priceStr}`, {
          x: margin + indent,
          y: currentY - 8,
          size: 7.5,
          font: italic,
          color: rgb(0.4, 0.4, 0.45)
        })
        
        const totalWidth = bold.widthOfTextAtSize(totalStr, 8)
        page.drawText(totalStr, {
          x: margin + contentWidth - totalWidth,
          y: currentY - 8,
          size: 8,
          font: bold,
          color: rgb(0.08, 0.08, 0.09)
        })
      }
    })
  }

  // Cabecera
  const shopName = payload.empresa || 'MY LITTLE BAZAR'
  addText(shopName, true, 11, 'center', 2)
  if (design.subtitle) addText(design.subtitle, false, 7, 'center', 4)
  addSeparator(0.5, 2, 4, true)
  
  addText(`Folio Venta: #${payload.ventaId || '0000'}`, true, 8, 'left', 2)
  const dateStr = payload.created_at || new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
  addText(`Fecha: ${dateStr}`, false, 7.5, 'left', 4)
  addSeparator(0.5, 4, 6)

  // Productos
  const items = Array.isArray(payload.items) ? payload.items : []
  for (const item of items) {
    const totalItem = (Number(item.precio_snapshot || item.precio) || 0) * (Number(item.cantidad) || 1)
    const baseName = item.nombre_snapshot || item.nombre || item.descripcion || item.codigo || 'Prenda'
    const code = item.codigo_snapshot || item.codigo || ''
    const nameItem = design.showItemCodes && code ? `${baseName} · ${code}` : baseName
    addItemRow(item.cantidad, nameItem, item.precio_snapshot || item.precio, totalItem)
  }
  
  addSeparator(0.5, 4, 6)

  // Totales
  const totalVal = `$${Number(payload.total || 0).toFixed(2)}`
  blocks.push({
    height: 14,
    render: (page, yTop) => {
      page.drawText('TOTAL:', {
        x: margin + 30,
        y: yTop - 10,
        size: 9.5,
        font: bold,
        color: rgb(0.08, 0.08, 0.09)
      })
      const totalWidth = bold.widthOfTextAtSize(totalVal, 10)
      page.drawText(totalVal, {
        x: margin + contentWidth - totalWidth,
        y: yTop - 10,
        size: 10,
        font: bold,
        color: rgb(0.08, 0.08, 0.09)
      })
    }
  })

  addText(`Método de Pago: ${String(payload.metodo || 'efectivo').toUpperCase()}`, false, 8, 'left', 4)
  
  if (String(payload.metodo).toLowerCase() === 'efectivo' && payload.pago_con != null) {
    const pagStr = `$${Number(payload.pago_con).toFixed(2)}`
    const camStr = `$${Number(payload.cambio || 0).toFixed(2)}`
    addText(`Recibido: ${pagStr}`, false, 7.5, 'left', 2)
    addText(`Cambio: ${camStr}`, true, 8, 'left', 4)
  }

  // Si es Crédito y se incluye información del cliente
  if (String(payload.metodo).toLowerCase() === 'credito' && payload.cliente) {
    addSeparator(0.5, 4, 6, true)
    addText('DETALLE DE CRÉDITO', true, 8, 'center', 4)
    addText(`Cliente: ${payload.cliente.nombre || 'Cliente'}`, false, 8, 'left', 2)
    const saldo = Number(payload.cliente.saldo_pendiente || 0)
    addText(`Saldo Anterior: $${(saldo - (payload.total || 0)).toFixed(2)}`, false, 7.5, 'left', 1)
    addText(`Cargo de Hoy: $${Number(payload.total || 0).toFixed(2)}`, false, 7.5, 'left', 1)
    addText(`Saldo Pendiente Total: $${saldo.toFixed(2)}`, true, 8.5, 'left', 6)
    
    if (design.showCreditSignature) {
      addSpace(25)
      blocks.push({
        height: 25,
        render: (page, yTop) => {
          const lineW = Math.min(120, contentWidth - 20)
          const startX = margin + (contentWidth - lineW) / 2
          page.drawLine({
            start: { x: startX, y: yTop - 5 },
            end: { x: startX + lineW, y: yTop - 5 },
            thickness: 0.5,
            color: rgb(0.08, 0.08, 0.09)
          })
          const sigLbl = 'Firma de conformidad'
          const lblW = reg.widthOfTextAtSize(sigLbl, 6.5)
          page.drawText(sigLbl, {
            x: margin + (contentWidth - lblW) / 2,
            y: yTop - 13,
            size: 6.5,
            font: reg,
            color: rgb(0.4, 0.4, 0.4)
          })
        }
      })
    }
  }

  // Notas
  if (payload.notas && String(payload.notes || payload.notas).trim()) {
    addSeparator(0.5, 4, 4, true)
    addText(`Notas: ${payload.notas}`, false, 7, 'left', 4)
  }

  // Pie de ticket
  addSeparator(0.5, 6, 6, true)
  addText(design.footerText || 'Gracias por tu compra', true, 7.5, 'center', 10)

  // Calcular la altura total del lienzo
  let totalHeight = blocks.reduce((sum, b) => sum + b.height, 0)
  totalHeight += 20 // Buffer superior/inferior adicional

  // Generar la página del tamaño exacto calculado
  const page = pdf.addPage([width, totalHeight])
  
  // Dibujar los bloques desde arriba hacia abajo
  let currentY = totalHeight - 10
  for (const block of blocks) {
    block.render(page, currentY)
    currentY -= block.height
  }

  fs.writeFileSync(outPath, await pdf.save())
  return { ok: true, path: outPath }
}

module.exports = { renderTicketPdf }
