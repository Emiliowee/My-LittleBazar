export {}

declare global {
  interface Window {
    bazar?: {
      runtime: {
        platform: NodeJS.Platform
        /** IPC desde main tras ventas a cuenta / movimientos de cuenta (todas las ventanas). */
        subscribeCuentasChanged?: (listener: () => void) => (() => void) | undefined
      }
      db: {
        getProducts: (filters?: Record<string, unknown>) => Promise<unknown[]>
        checkRequiredTagsForProduct: (
          map: Record<string, unknown>,
        ) => Promise<{
          ok: boolean
          missing: string[]
          ruleConflict?: boolean
          ruleMessage?: string
        }>
        addProduct: (product: Record<string, unknown>) => Promise<unknown>
        updateProduct: (product: Record<string, unknown>) => Promise<unknown>
        deleteProduct: (id: number) => Promise<unknown>
        searchProducts: (query: string) => Promise<unknown[]>
        nextCodigoMsr: () => Promise<string>
        getMonserratDbPath: () => Promise<string>
        resetToFactorySeed: () => Promise<
          { ok: true; path: string; productCount: number } | { ok: false; message: string }
        >
        getTagGroupsForProduct: () => Promise<
          Array<{
            id: number
            name: string
            required: boolean
            display_order: number
            notion_color?: string
            options: Array<{
              id: number
              name: string
              is_price_rule?: boolean
              notion_color?: string
              tag_icon?: string | null
            }>
          }>
        >
        getProductById: (
          id: number,
        ) => Promise<
          | (Record<string, unknown> & {
              tagsByGroup?: Record<number, number>
              venta_items_count?: number
            })
          | null
        >
        getProductByCodigo: (
          codigo: string,
        ) => Promise<
          | (Record<string, unknown> & {
              tagsByGroup?: Record<number, number>
              venta_items_count?: number
            })
          | null
        >
        getInventoryList: (filters: {
          search?: string
          estadoIndex?: number
          vistaIndex?: number
          listTab?: 'main' | 'stale'
        }) => Promise<
          Array<
            Record<string, unknown> & {
              tags?: string
              fecha_ingreso?: string | null
              venta_items_count?: number
            }
          >
        >
        getTagLabelsForMap: (map: Record<number, number>) => Promise<string[]>
        suggestNombreFromTags: (payload: {
          tagsByGroup?: Record<number, number>
          excludeCodigo?: string
        }) => Promise<string | null>
        getNombreEtiquetaDesdeTags: (payload: { tagsByGroup?: Record<number, number> }) => Promise<string>
        suggestPrecioFromTags: (payload: {
          tagsByGroup?: Record<number, number>
          mode?: string
          excludeCodigo?: string
        }) => Promise<number | null>
        getReferenceRows: (payload: Record<string, unknown>) => Promise<Array<[string, string, string]>>
        getReferenceSnapshot: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
        getSales: (filters?: Record<string, unknown>) => Promise<unknown[]>
        addSale: (sale: Record<string, unknown>) => Promise<unknown>
        suggestByTags: (tags: string[]) => Promise<unknown>
        getWelcomeSnapshot: () => Promise<{
          productosTotal: number
          productosDisponibles: number
          clientesTotal: number
          clientesConSaldo: number
          saldoTotalPendiente: number
        }>
        getBanquetaSidebarSnapshot: () => Promise<{
          enBanqueta: number
          disponibles: number
          planos: Array<{ nombre: string; cnt: number }>
        }>
        listBanquetaSalidas: () => Promise<
          Array<{
            id: number
            nombre: string
            estado: string
            notas: string
            created_at: string | null
            activated_at: string | null
            closed_at: string | null
            item_count: number
          }>
        >
        getActiveBanquetaSalida: () => Promise<{
          id: number
          nombre: string
          estado: string
          created_at: string | null
          activated_at: string | null
          item_count: number
        } | null>
        createBanquetaSalida: (payload?: { nombre?: string }) => Promise<{ id: number }>
        updateBanquetaSalida: (payload: {
          id: number
          nombre?: string
          notas?: string
        }) => Promise<{ ok: boolean }>
        getBanquetaSalidaDetail: (id: number) => Promise<{
          salida: Record<string, unknown>
          items: Array<Record<string, unknown>>
        } | null>
        addProductToBanquetaSalida: (payload: {
          salidaId: number
          codigo: string
        }) => Promise<{ salida: Record<string, unknown>; items: Array<Record<string, unknown>> } | null>
        removeBanquetaSalidaItem: (itemId: number) => Promise<{ ok: boolean }>
        activateBanquetaSalida: (id: number) => Promise<{
          salida: Record<string, unknown>
          items: Array<Record<string, unknown>>
        } | null>
        closeBanquetaSalida: (id: number) => Promise<{ ok: boolean }>
        deleteBanquetaSalida: (id: number) => Promise<{ ok: boolean }>
        reorderBanquetaSalidaItems: (payload: {
          salidaId: number
          orderedItemIds: number[]
        }) => Promise<{ salida: Record<string, unknown>; items: Array<Record<string, unknown>> } | null>
        removeBanquetaSalidaItemsBulk: (
          itemIds: number[],
        ) => Promise<{ ok: boolean; detail: { salida: Record<string, unknown>; items: unknown[] } | null }>
        previewPriceAdjust: (payload: Record<string, unknown>) => Promise<{
          total: number
          truncated: boolean
          rows: Array<{
            id: number
            codigo: string
            descripcion: string
            precioActual: number
            precioNuevo: number
          }>
        }>
        applyPriceAdjust: (payload: Record<string, unknown>) => Promise<{ ok: boolean; updated: number }>
        getReferencePatternStats: (payload: Record<string, unknown>) => Promise<{
          encontrado: boolean
          mensaje: string
          stats: { n: number; min: number; max: number; avg: number; median: number } | null
          productos: Array<{ codigo: string; descripcion: string; precio: number; estado: string }>
        }>
        getCuadernoTagGroups: () => Promise<
          Array<{
            id: number
            name: string
            required: boolean
            display_order: number
            use_in_price: number | null
            notion_color?: string
            option_count: number
            options: Array<{
              id: number
              name: string
              active: boolean
              is_price_rule?: boolean
              notion_color?: string
              tag_icon?: string | null
            }>
          }>
        >
        getTagCatalogForManager: () => Promise<
          Array<{
            id: number
            name: string
            required: boolean
            display_order: number
            use_in_price: number | null
            group_active: boolean
            notion_color?: string
            option_count: number
            options: Array<{
              id: number
              name: string
              active: boolean
              is_price_rule?: boolean
              notion_color?: string
              tag_icon?: string | null
            }>
          }>
        >
        cuadernoRenameTagGroup: (payload: { id: number; name: string }) => Promise<{ ok: boolean }>
        cuadernoDeleteTagOption: (payload: { id: number }) => Promise<{ ok: boolean }>
        cuadernoDeleteTagGroup: (payload: { id: number }) => Promise<{ ok: boolean }>
        countProductsByTagOption: (optionId: number) => Promise<number>
        listPriceRulesAdmin: () => Promise<
          Array<{
            id: number
            name: string
            price_min: number
            price_max: number
            priority: number
            active: boolean
            notes: string
            conditions: Array<{
              group_id: number
              option_id: number
              group_name: string
              option_name: string
            }>
          }>
        >
        cuadernoAddTagGroup: (payload: { name: string; notionColor?: string }) => Promise<{ ok: boolean; id: number }>
        cuadernoAddTagOption: (payload: {
          groupId: number
          name: string
          notionColor?: string
          tagIcon?: string | null
        }) => Promise<{ ok: boolean; id: number }>
        cuadernoMoveTagOption: (payload: {
          optionId: number
          groupId: number
        }) => Promise<{ ok: boolean }>
        cuadernoRenameTagOption: (payload: { id: number; name: string }) => Promise<{ ok: boolean }>
        cuadernoSetTagOptionActive: (payload: { id: number; active: boolean }) => Promise<{ ok: boolean }>
        cuadernoSetTagGroupStyle: (payload: { id: number; notionColor: string }) => Promise<{ ok: boolean }>
        cuadernoSetTagOptionStyle: (payload: {
          id: number
          notionColor: string
          tagIcon?: string | null
        }) => Promise<{ ok: boolean }>
        cuadernoReorderTagGroups: (payload: { orderedIds: number[] }) => Promise<{ ok: boolean }>
        cuadernoUpsertPriceRule: (payload: Record<string, unknown>) => Promise<{ ok: boolean; id: number }>
        cuadernoDeletePriceRule: (payload: { id: number }) => Promise<{ ok: boolean }>
        listTagPriceRulesSummary: () => Promise<
          Array<{ id: number; option_name: string; group_name: string; combo_count: number }>
        >
        listTagPriceRulesForCuaderno: () => Promise<
          Array<{
            anchor_option_id: number
            option_name: string
            group_name: string
            notion_color?: string
            tag_icon?: string | null
            lines: Array<{ summaryLabel: string; price: number | null }>
          }>
        >
        setTagOptionPriceRule: (payload: {
          optionId: number
          isRule: boolean
          rulePriority?: number
        }) => Promise<{ ok: boolean }>
        getPriceCombosForAnchor: (payload: { anchorOptionId: number }) => Promise<
          Array<{ id: number; price: number | null; companionIds: number[]; companionLabels: string[] }>
        >
        replacePriceCombosForAnchor: (payload: {
          anchorOptionId: number
          combos: Array<{ companionIds: number[]; price: number | string | null }>
        }) => Promise<{ ok: boolean }>
        listInvPricingRules: () => Promise<
          Array<{
            id: number
            name: string
            anchor_option_id: number
            anchor_label: string
            scope_all: boolean
            active: boolean
            row_count: number
            custom_field_count?: number
          }>
        >
        getInvPricingRule: (payload: { id: number }) => Promise<{
          id: number
          name: string
          anchor_option_id: number
          scope_all: boolean
          active: boolean
          notes: string
          scopeGroupIds: number[]
          rows: Array<{ companionIds: number[]; price: string }>
          customFields?: Array<{
            id: string
            type: 'text' | 'select' | 'number' | 'image' | 'checkbox'
            name: string
            required: boolean
            options?: string[]
          }>
        }>
        upsertInvPricingRule: (payload: {
          id?: number | null
          name: string
          anchorOptionId: number
          scopeAll: boolean
          scopeGroupIds?: number[]
          rows: Array<{ companionIds: number[]; price?: string | number | null }>
          active?: boolean
          notes?: string
          customFields?: Array<{
            id: string
            type: 'text' | 'select' | 'number' | 'image' | 'checkbox'
            name: string
            required: boolean
            options?: string[]
          }>
        }) => Promise<{ ok: boolean; id: number }>
        deleteInvPricingRule: (payload: { id: number }) => Promise<{ ok: boolean }>
      }
      assets?: {
        /** Ruta absoluta del archivo → data URL (PNG) para vista previa en SVG. */
        logoDataUrl: (absPath: string) => Promise<{ ok: boolean; dataUrl?: string; message?: string }>
      }
      settings: {
        get: () => Promise<{
          theme?: 'system' | 'light' | 'dark'
          devicePrinterLabelsName?: string
          devicePrinterTicketsName?: string
          altaAutoFillMode?: 'cuaderno' | 'patrones' | 'off'
          altaAutofillPrecioCuaderno?: boolean
          altaAutofillPrecioPatrones?: boolean
          altaAutofillNombreDesdeTags?: boolean
          altaAutofillCodigoMsrNuevo?: boolean
          printLabelAfterSave?: boolean
          /** Carpeta para PDFs de etiqueta; vacío = Descargas del sistema */
          labelPdfSavePath?: string
          workspaceDisplayName?: string
          workspaceLogoPath?: string
          labelLogoStyle?: 'thermal' | 'original'
          labelLogoWarmth?: number
          labelLogoContrast?: number
          labelLogoSaturation?: number
          navBanquetaFolderOpen?: boolean
          sidebarCollapsed?: boolean
          /** Barra lateral oculta por completo (peek al hover en el borde) */
          sidebarHidden?: boolean
          /** Efecto vidrio en la sesión (sidebar + centro). false = colores planos */
          shellGlassEnabled?: boolean
        }>
        set: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>
        pickLabelPdfFolder: () => Promise<{ cancelled: boolean; path?: string }>
      }
      printers: {
        list: () => Promise<string[]>
        diagnostic: () => Promise<string>
        testPrint: (printerName?: string) => Promise<{ ok: boolean; message: string }>
        printLabel: (payload: {
          codigo: string
          nombre?: string
          precio?: number
        }) => Promise<{ ok: boolean; message?: string; path?: string; barcodeOk?: boolean }>
      }
      banqueta: {
        printSheet: (detail: { salida: Record<string, unknown>; items: Array<Record<string, unknown>> }) =>
          Promise<{ ok: boolean; message?: string; path?: string }>
      }
      labels: {
        list: () => Promise<{ activeId: string; templates: Array<Record<string, unknown>> }>
        getActive: () => Promise<Record<string, unknown> | null>
        upsert: (template: Record<string, unknown>) => Promise<Record<string, unknown>>
        remove: (id: string) => Promise<{ activeId: string; templates: Array<Record<string, unknown>> }>
        setActive: (id: string) => Promise<{ activeId: string; templates: Array<Record<string, unknown>> }>
        duplicate: (id: string) => Promise<Record<string, unknown>>
        restoreDefault: () => Promise<{ activeId: string; templates: Array<Record<string, unknown>> }>
      }
      productImage: {
        pick: () => Promise<{ ok: boolean; cancelled: boolean; path: string }>
      }
      tagIconImage: {
        pick: () => Promise<{ ok: boolean; cancelled: boolean; path: string }>
      }
      devices: {
        open: () => Promise<boolean>
      }
      rive: {
        open: () => Promise<boolean>
      }
      pdv: {
        open: () => Promise<boolean>
      }
      window: {
        isMaximized: () => Promise<boolean>
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<void>
        close: () => Promise<void>
        openPdvWindow: () => Promise<boolean>
        setWelcomeMode: (compact: boolean) => Promise<boolean>
        setShellSize: (size: { width: number; height: number }) => Promise<boolean>
        onState: (cb: (state: { maximized: boolean }) => void) => () => void
      }
    }
  }
}
