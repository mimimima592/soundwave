/**
 * Система тем.
 *
 * Тема = набор CSS-переменных + опциональный фон (цвет/GIF/картинка).
 * Переменные задаются в формате "R G B" (без rgb()), чтобы Tailwind
 * мог применять <alpha-value> (см. tailwind.config.js).
 */

export interface ThemeColors {
  bg: string;           // основной фон приложения
  surface: string;      // карточки, панели
  surfaceAlt: string;   // hover, выделение
  border: string;       // границы
  text: string;         // основной текст
  textDim: string;      // вторичный текст
  accent: string;       // акцентный цвет (кнопка play, активная вкладка)
  accentHover: string;
}

export interface Theme {
  id: string;
  name: string;
  author?: string;
  isDark: boolean;
  colors: ThemeColors;
  // Дополнительные кастомизации
  blur?: number;           // blur на стеклянных поверхностях (px)
  radius?: number;         // радиус скругления (px)
  surfaceOpacity?: number; // прозрачность сайдбара и плеера (0–1, default 0.95)
  playerBlur?: number;     // blur плеера (px, default = blur)
}

// Формат "R G B" — см. комментарий выше
export const BUILT_IN_THEMES: Theme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    isDark: true,
    colors: {
      bg: '10 10 12',
      surface: '20 20 24',
      surfaceAlt: '32 32 38',
      border: '42 42 50',
      text: '245 245 250',
      textDim: '150 150 160',
      accent: '255 85 0',       // SoundCloud orange
      accentHover: '255 110 30',
    },
    blur: 20,
    radius: 12,
  },
  {
    id: 'lavender',
    name: 'Lavender Dream',
    isDark: true,
    colors: {
      bg: '18 14 28',
      surface: '28 22 44',
      surfaceAlt: '42 32 64',
      border: '56 44 82',
      text: '245 240 255',
      textDim: '170 160 200',
      accent: '180 130 255',
      accentHover: '200 155 255',
    },
    blur: 24,
    radius: 16,
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    isDark: true,
    colors: {
      bg: '16 8 32',
      surface: '26 14 50',
      surfaceAlt: '40 22 72',
      border: '70 40 110',
      text: '255 240 250',
      textDim: '200 150 200',
      accent: '255 80 180',
      accentHover: '255 110 200',
    },
    blur: 28,
    radius: 8,
  },
  {
    id: 'forest',
    name: 'Deep Forest',
    isDark: true,
    colors: {
      bg: '8 18 14',
      surface: '16 28 22',
      surfaceAlt: '24 42 32',
      border: '40 60 48',
      text: '230 245 235',
      textDim: '140 170 150',
      accent: '120 220 140',
      accentHover: '150 240 170',
    },
    blur: 16,
    radius: 12,
  },
  {
    id: 'paper',
    name: 'Paper',
    isDark: false,
    colors: {
      bg: '248 245 240',
      surface: '255 253 248',
      surfaceAlt: '240 235 225',
      border: '220 210 195',
      text: '30 28 24',
      textDim: '110 105 95',
      accent: '210 100 30',
      accentHover: '190 85 20',
    },
    blur: 12,
    radius: 6,
  },
];

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-bg', theme.colors.bg);
  root.style.setProperty('--theme-surface', theme.colors.surface);
  root.style.setProperty('--theme-surface-alt', theme.colors.surfaceAlt);
  root.style.setProperty('--theme-border', theme.colors.border);
  root.style.setProperty('--theme-text', theme.colors.text);
  root.style.setProperty('--theme-text-dim', theme.colors.textDim);
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-accent-hover', theme.colors.accentHover);
  // accent-fg = чёрный только если акцент очень светлый (белый, светло-серый)
  // Порог 0.85 — срабатывает только на почти белых цветах
  const [ar, ag, ab] = theme.colors.accent.trim().split(' ').map(Number);
  const lum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  root.style.setProperty('--theme-accent-fg', lum > 0.85 ? '0 0 0' : '255 255 255');
  root.style.setProperty('--theme-blur', `${theme.blur ?? 12}px`);
  root.style.setProperty('--theme-radius', `${theme.radius ?? 12}px`);
  root.style.setProperty('--theme-surface-opacity', `${theme.surfaceOpacity ?? 0.95}`);
  root.style.setProperty('--theme-player-blur', `${theme.playerBlur ?? theme.blur ?? 12}px`);
  root.dataset.theme = theme.id;
  root.dataset.themeMode = theme.isDark ? 'dark' : 'light';
}

export function createCustomTheme(base: Theme, overrides: Partial<Theme>): Theme {
  return {
    ...base,
    ...overrides,
    colors: { ...base.colors, ...(overrides.colors ?? {}) },
    id: overrides.id ?? `custom-${Date.now()}`,
  };
}
