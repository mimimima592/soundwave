import { useState } from 'react';
import { Trash2, Save, X } from 'lucide-react';
import type { Theme, ThemeColors } from '@/themes/themes';
import { useUIStore } from '@/store/ui';

interface Props {
  initial: Theme;
  onClose: () => void;
  isNew: boolean;
}

const COLOR_LABELS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'bg',          label: 'Основной фон',        hint: 'Фон приложения' },
  { key: 'surface',     label: 'Поверхность',          hint: 'Карточки, панели' },
  { key: 'surfaceAlt',  label: 'Поверхность (hover)',  hint: 'Наведение, выделение' },
  { key: 'border',      label: 'Границы',              hint: 'Разделители и контуры' },
  { key: 'text',        label: 'Основной текст',       hint: 'Заголовки, важный текст' },
  { key: 'textDim',     label: 'Вторичный текст',      hint: 'Подписи, приглушённый текст' },
  { key: 'accent',      label: 'Акцент',               hint: 'Кнопка play, активные элементы' },
  { key: 'accentHover', label: 'Акцент (hover)',       hint: 'Наведение на акцентные элементы' },
];

function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.split(' ').map(Number);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function hexToRgb(hex: string): string {
  const v = hex.replace('#', '');
  return `${parseInt(v.slice(0,2),16)} ${parseInt(v.slice(2,4),16)} ${parseInt(v.slice(4,6),16)}`;
}



const label = (text: string) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] mb-2.5"
     style={{ color: 'rgb(var(--theme-text-dim))' }}>
    {text}
  </p>
);

export function ThemeEditor({ initial, onClose, isNew }: Props) {
  const addCustomTheme    = useUIStore((s) => s.addCustomTheme);
  const updateCustomTheme = useUIStore((s) => s.updateCustomTheme);
  const deleteCustomTheme = useUIStore((s) => s.deleteCustomTheme);
  const setActiveTheme    = useUIStore((s) => s.setActiveTheme);

  const [draft, setDraft] = useState<Theme>(() => ({
    ...initial,
    id:     isNew ? `custom-${Date.now()}` : initial.id,
    name:   isNew ? `${initial.name} (копия)` : initial.name,
    colors: { ...initial.colors },
  }));

  const updateColor = (key: keyof ThemeColors, value: string) => {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
    // Live update accent-fg при смене акцентного цвета
    if (key === 'accent') {
      const [r, g, b] = value.trim().split(' ').map(Number);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const fg = lum > 0.85 ? '0 0 0' : '255 255 255';
      document.documentElement.style.setProperty('--theme-accent-fg', fg);
      document.documentElement.style.setProperty('--theme-accent', value);
    }
    if (key === 'bg' || key === 'surface' || key === 'border' || key === 'text' || key === 'textDim') {
      const cssKey = key === 'textDim' ? '--theme-text-dim'
        : key === 'surfaceAlt' ? '--theme-surface-alt'
        : `--theme-${key}`;
      document.documentElement.style.setProperty(cssKey, value);
    }
  };

  const handleSave = () => {
    if (isNew) { addCustomTheme(draft); setActiveTheme(draft.id); }
    else        { updateCustomTheme(draft); }
    onClose();
  };

  const handleDelete = () => {
    if (!isNew && draft.id.startsWith('custom-')) {
      if (confirm(`Удалить тему "${draft.name}"?`)) {
        deleteCustomTheme(draft.id);
        onClose();
      }
    }
  };

  const isCustom = draft.id.startsWith('custom-');
  const canEdit  = isCustom || isNew;

  // ── Стили ──────────────────────────────────────────────────────────────────
  const S = {
    overlay: {
      background:     'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(14px)',
    } as React.CSSProperties,
    modal: {
      background:     'rgb(var(--theme-surface))',
      border:         '1px solid rgb(var(--theme-border) / 0.35)',
      boxShadow:      '0 32px 80px rgba(0,0,0,0.6)',
    } as React.CSSProperties,
    header: {
      background:   'rgb(var(--theme-surface))',
      borderBottom: '1px solid rgb(var(--theme-border) / 0.25)',
    } as React.CSSProperties,
    footer: {
      background:  'rgb(var(--theme-surface))',
      borderTop:   '1px solid rgb(var(--theme-border) / 0.25)',
    } as React.CSSProperties,
    input: {
      background: 'rgb(var(--theme-bg) / 0.8)',
      border:     '1px solid rgb(var(--theme-border) / 0.5)',
      color:      'rgb(var(--theme-text))',
    } as React.CSSProperties,
    card: {
      background: 'rgb(var(--theme-bg) / 0.5)',
      border:     '1px solid rgb(var(--theme-border) / 0.25)',
    } as React.CSSProperties,
  };

  const Slider = ({
    label: lbl, min, max, value, onChange, left, right,
  }: {
    label: string; min: number; max: number;
    value: number; onChange: (v: number) => void;
    left?: string; right?: string;
  }) => (
    <div className="p-3.5 rounded-xl" style={S.card}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text))' }}>{lbl}</span>
        <span className="text-xs font-mono" style={{ color: 'rgb(var(--theme-text-dim))' }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => canEdit && onChange(Number(e.target.value))}
        disabled={!canEdit}
        className="w-full disabled:opacity-40"
        style={{ accentColor: 'rgb(var(--theme-accent))' }}
      />
      {(left || right) && (
        <div className="flex justify-between mt-1" style={{ color: 'rgb(var(--theme-text-dim) / 0.6)', fontSize: 10 }}>
          <span>{left}</span><span>{right}</span>
        </div>
      )}
    </div>
  );

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={S.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal — фиксированная высота с внутренним скроллом */}
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{ ...S.modal, width: 560, maxWidth: 'calc(100vw - 32px)', height: 'min(680px, calc(100vh - 80px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — фиксирован */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={S.header}>
          <h2 className="text-base font-semibold" style={{ color: 'rgb(var(--theme-text))' }}>
            {isNew ? 'Новая тема' : 'Редактирование темы'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:opacity-70"
            style={{ color: 'rgb(var(--theme-text-dim))', background: 'rgb(var(--theme-border) / 0.3)' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: 'thin' }}>

          {/* Название */}
          <div>
            {label('Название')}
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={!canEdit}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none disabled:opacity-40 transition-colors"
              style={S.input}
            />
          </div>



          {/* Цветовая палитра */}
          <div>
            {label('Цветовая палитра')}
            <div className="space-y-1.5">
              {COLOR_LABELS.map(({ key, label: lbl, hint }) => (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                  style={S.card}
                >
                  {/* Color swatch — кликабельная обёртка над input[type=color] */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-lg ring-1 ring-black/20 cursor-pointer"
                      style={{ background: rgbToHex(draft.colors[key]) }}
                    />
                    <input
                      type="color"
                      value={rgbToHex(draft.colors[key])}
                      onChange={(e) => updateColor(key, hexToRgb(e.target.value))}
                      disabled={!canEdit}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none mb-0.5" style={{ color: 'rgb(var(--theme-text))' }}>{lbl}</p>
                    <p className="text-xs leading-none" style={{ color: 'rgb(var(--theme-text-dim))' }}>{hint}</p>
                  </div>
                  <code className="text-[11px] font-mono flex-shrink-0" style={{ color: 'rgb(var(--theme-text-dim))' }}>
                    {rgbToHex(draft.colors[key])}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Форма и прозрачность */}
          <div>
            {label('Форма и прозрачность')}
            <div className="space-y-2">
              <Slider
                label="Прозрачность сайдбара / плеера" min={20} max={100}
                value={Math.round((draft.surfaceOpacity ?? 0.95) * 100)}
                onChange={(v) => {
                  setDraft((d) => ({ ...d, surfaceOpacity: v / 100 }));
                  document.documentElement.style.setProperty('--theme-surface-opacity', String(v / 100));
                }}
                left="Прозрачный" right="Непрозрачный"
              />
              <Slider
                label="Скругление углов" min={0} max={28}
                value={draft.radius ?? 12}
                onChange={(v) => {
                  setDraft((d) => ({ ...d, radius: v }));
                  document.documentElement.style.setProperty('--theme-radius', `${v}px`);
                }}
                left="Квадратные" right="Круглые"
              />
            </div>
          </div>
        </div>

        {/* Footer — фиксирован */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3.5" style={S.footer}>
          <div>
            {isCustom && !isNew && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-75"
                style={{ color: 'rgb(239 68 68)', background: 'rgb(239 68 68 / 0.1)' }}
              >
                <Trash2 size={13} /> Удалить
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-75"
              style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text))' }}
            >
              Отмена
            </button>
            {canEdit && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'rgb(var(--theme-accent))', color: `rgb(var(--theme-accent-fg))`, boxShadow: '0 2px 14px rgb(var(--theme-accent) / 0.4)' }}
              >
                <Save size={13} /> Сохранить
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
