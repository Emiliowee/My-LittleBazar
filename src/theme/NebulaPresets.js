/**
 * Temas predeterminados del sistema de personalización.
 * Cada preset debe cubrir TODOS los --mlb-* tokens para evitar
 * mezclas entre los tokens del esquema base (dark/light).
 */
export const NEBULA_PRESETS = [
  {
    id: 'notion-clean-light',
    name: 'Notion Claro',
    scheme: 'light',
    description: 'Superficies pulidas en blanco y gris neutro al estilo Notion.',
    css: `
      --mlb-bg-desktop: #fcfcfc;
      --mlb-bg-app: #ffffff;
      --mlb-bg-panel: #fafafa;
      --mlb-bg-panel-dark: #f4f4f5;
      --mlb-bg-input: #f4f4f5;
      --mlb-bg-hover: #efeff1;
      --mlb-bg-active: #e4e4e7;

      --mlb-text-primary: #18181b;
      --mlb-text-secondary: #52525b;
      --mlb-text-muted: #8e8e93;

      --mlb-accent: #2563eb;
      --mlb-accent-hover: #1d4ed8;
      --mlb-accent-soft: rgba(37, 99, 235, 0.08);
      --mlb-accent-ring: rgba(37, 99, 235, 0.25);
      --mlb-success: #16a34a;
      --mlb-danger: #dc2626;

      --mlb-border: #e4e4e7;
      --mlb-border-strong: #d4d4d8;
      --mlb-border-focus: #2563eb;

      --background: #ffffff;
      --foreground: #18181b;
      --card: #fafafa;
      --card-foreground: #18181b;
      --popover: #ffffff;
      --popover-foreground: #18181b;
      --primary: #2563eb;
      --primary-foreground: #ffffff;
      --border: #e4e4e7;
      --muted-foreground: #71717a;
    `
  },
  {
    id: 'notion-clean-dark',
    name: 'Notion Oscuro',
    scheme: 'dark',
    description: 'Tonos grises oscuros profundos y limpios con acento blanco marfil.',
    css: `
      --mlb-bg-desktop: #121212;
      --mlb-bg-app: #191919;
      --mlb-bg-panel: #202020;
      --mlb-bg-panel-dark: #161616;
      --mlb-bg-input: #252525;
      --mlb-bg-hover: #2a2a2a;
      --mlb-bg-active: #353535;

      --mlb-text-primary: #f4f4f5;
      --mlb-text-secondary: #a1a1aa;
      --mlb-text-muted: #71717a;

      --mlb-accent: #e4e4e7;
      --mlb-accent-hover: #ffffff;
      --mlb-accent-soft: rgba(255, 255, 255, 0.08);
      --mlb-accent-ring: rgba(255, 255, 255, 0.2);
      --mlb-success: #22c55e;
      --mlb-danger: #ef4444;

      --mlb-border: #2a2a2a;
      --mlb-border-strong: #3f3f46;
      --mlb-border-focus: #e4e4e7;

      --background: #191919;
      --foreground: #f4f4f5;
      --card: #202020;
      --card-foreground: #f4f4f5;
      --popover: #202020;
      --popover-foreground: #f4f4f5;
      --primary: #e4e4e7;
      --primary-foreground: #18181b;
      --border: #2a2a2a;
      --muted-foreground: #a1a1aa;
    `
  },
  {
    id: 'duolingo-green',
    name: 'Duolingo Verde',
    scheme: 'light',
    description: 'Estilo juguetón y premium con el verde vibrante de Duolingo.',
    css: `
      --mlb-bg-desktop: #f7f8fa;
      --mlb-bg-app: #ffffff;
      --mlb-bg-panel: #ffffff;
      --mlb-bg-panel-dark: #f1f2f6;
      --mlb-bg-input: #f1f2f6;
      --mlb-bg-hover: #e5e8f0;
      --mlb-bg-active: #d4d9e6;

      --mlb-text-primary: #3c3c3c;
      --mlb-text-secondary: #777777;
      --mlb-text-muted: #afafaf;

      --mlb-accent: #58cc02;
      --mlb-accent-hover: #46a302;
      --mlb-accent-soft: rgba(88, 204, 2, 0.12);
      --mlb-accent-ring: rgba(88, 204, 2, 0.3);
      --mlb-success: #58cc02;
      --mlb-danger: #ea2b2b;

      --mlb-border: #e5e5e5;
      --mlb-border-strong: #d4d4d4;
      --mlb-border-focus: #58cc02;

      --background: #ffffff;
      --foreground: #3c3c3c;
      --card: #ffffff;
      --card-foreground: #3c3c3c;
      --popover: #ffffff;
      --popover-foreground: #3c3c3c;
      --primary: #58cc02;
      --primary-foreground: #ffffff;
      --border: #e5e5e5;
      --muted-foreground: #777777;
    `
  }
]
