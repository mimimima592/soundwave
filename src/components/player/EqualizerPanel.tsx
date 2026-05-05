import { useState, useRef, useEffect, useCallback } from 'react';
import { X, SlidersHorizontal, RotateCcw, Power } from 'lucide-react';
import { useEqualizer, EQ_BANDS, EQ_PRESETS, getFilters, getAudioContext } from '@/hooks/useEqualizer';
import { cn } from '@/utils/format';
import { useT } from '@/store/i18n';

// ── Frequency response canvas ─────────────────────────────────────────────────
function FreqCurve({ gains, enabled }: { gains: number[]; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid — горизонтальные линии по dB
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = H / 2 - (db / 12) * (H / 2 - 6);
      ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = db === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

      if (db !== 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '8px system-ui';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px system-ui';
    ctx.fillText('0dB', 3, H / 2 - 3);

    if (!enabled) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const filters = getFilters();
    const audioCtx = getAudioContext();
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme-accent').trim() || '255 100 0';
    const [r, g, b] = accent.split(' ').map(Number);

    let pts: { x: number; y: number }[] = [];

    if (filters.length && audioCtx) {
      const N = W;
      const freqs = new Float32Array(N);
      const mags  = new Float32Array(N);
      const phase = new Float32Array(N);
      for (let i = 0; i < N; i++) freqs[i] = 20 * Math.pow(1000, i / (N - 1));

      const total = new Float32Array(N).fill(1);
      filters.forEach((f, fi) => {
        f.gain.value = gains[fi] ?? 0;
        f.getFrequencyResponse(freqs, mags, phase);
        for (let i = 0; i < N; i++) total[i] *= mags[i];
      });

      pts = Array.from({ length: N }, (_, i) => {
        const db = 20 * Math.log10(Math.max(total[i], 1e-6));
        const y = H / 2 - (db / 12) * (H / 2 - 6);
        return { x: i, y: Math.max(2, Math.min(H - 2, y)) };
      });
    } else {
      pts = EQ_BANDS.map((band, i) => {
        const x = ((Math.log10(band.freq) - Math.log10(20)) / Math.log10(1000)) * W;
        const y = H / 2 - ((gains[i] ?? 0) / 12) * (H / 2 - 6);
        return { x, y };
      });
    }

    if (!pts.length) return;

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0.02)`);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [gains, enabled]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={72}
      className="w-full rounded-xl"
      style={{ background: 'rgb(var(--theme-bg) / 0.6)', display: 'block' }}
    />
  );
}

// ── Вертикальный слайдер ──────────────────────────────────────────────────────
function BandSlider({ label, gain, onChange, enabled }: {
  label: string; gain: number; onChange: (v: number) => void; enabled: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const getGain = useCallback((clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round((pct * 24 - 12) * 2) / 2;
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    onChange(getGain(e.clientY));
    const move = (ev: MouseEvent) => onChange(getGain(ev.clientY));
    const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const thumbPct = 1 - (gain + 12) / 24;
  const isActive = gain !== 0;

  return (
    <div className="flex flex-col items-center gap-1.5 select-none" style={{ flex: 1 }}>
      {/* Значение */}
      <span
        className="text-[10px] font-mono tabular-nums"
        style={{ color: isActive ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim) / 0.5)', minWidth: 28, textAlign: 'center' }}
      >
        {gain > 0 ? `+${gain}` : gain === 0 ? '0' : gain}
      </span>

      {/* Трек */}
      <div
        ref={trackRef}
        className="relative rounded-full cursor-pointer"
        style={{
          width: 4,
          height: 100,
          background: 'rgb(var(--theme-border) / 0.4)',
          opacity: enabled ? 1 : 0.35,
        }}
        onMouseDown={onMouseDown}
      >
        {/* Заливка */}
        {isActive && (
          <div
            className="absolute left-0 right-0 rounded-full"
            style={{
              background: 'rgb(var(--theme-accent) / 0.8)',
              top:    gain >= 0 ? `${thumbPct * 100}%` : '50%',
              bottom: gain <  0 ? `${(1 - thumbPct) * 100}%` : '50%',
            }}
          />
        )}
        {/* Thumb — wrapper позиционирует через translate, внутренний div масштабируется */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${thumbPct * 100}%` }}
        >
          <div
            className="rounded-full transition-transform hover:scale-125 active:scale-110"
            style={{
              width: 13, height: 13,
              background: isActive ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim) / 0.4)',
              boxShadow: isActive ? '0 0 10px rgb(var(--theme-accent) / 0.6)' : 'none',
              cursor: enabled ? 'grab' : 'default',
            }}
          />
        </div>
      </div>

      {/* Частота */}
      <span className="text-[10px]" style={{ color: 'rgb(var(--theme-text-dim) / 0.6)' }}>
        {label}
      </span>
    </div>
  );
}

// ── Основная панель ───────────────────────────────────────────────────────────
export function EqualizerPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { eqEnabled, eqGains, setEqEnabled, setBand, applyPreset } = useEqualizer();
  const [activePreset, setActivePreset] = useState<string>(() => {
    // Определяем активный пресет по текущим gains
    for (const [name, gains] of Object.entries(EQ_PRESETS)) {
      if (gains.every((g, i) => g === eqGains[i])) return name;
    }
    return 'Custom';
  });

  const handlePreset = (name: string) => {
    setActivePreset(name);
    applyPreset(name);
  };

  const handleBand = (i: number, v: number) => {
    setBand(i, v);
    setActivePreset('Custom');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Панель */}
      <div
        className="fixed left-0 right-0 z-50 flex justify-center px-4 animate-slide-up"
        style={{ bottom: 100 }}
      >
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{
            maxWidth: 640,
            background: 'rgb(var(--theme-surface))',
            border: '1px solid rgb(var(--theme-border) / 0.5)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgb(var(--theme-border) / 0.3)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgb(var(--theme-accent) / 0.15)' }}
              >
                <SlidersHorizontal size={13} style={{ color: 'rgb(var(--theme-accent))' }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: 'rgb(var(--theme-text))' }}>
                {t('eq_title')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Power toggle */}
              <button
                onClick={() => setEqEnabled(!eqEnabled)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: eqEnabled ? 'rgb(var(--theme-accent) / 0.15)' : 'rgb(var(--theme-surface-alt))',
                  color: eqEnabled ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim))',
                  boxShadow: eqEnabled
                    ? 'inset 0 0 0 1px rgb(var(--theme-accent) / 0.35)'
                    : 'inset 0 0 0 1px rgb(var(--theme-border) / 0.4)',
                }}
              >
                <Power size={11} />
                {eqEnabled ? t('eq_enabled') : t('eq_disabled')}
              </button>

              {/* Reset */}
              <button
                onClick={() => handlePreset('Flat')}
                className="w-7 h-7 rounded-full flex items-center justify-center opacity-70 hover:opacity-100"
                style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}
                title={t('eq_reset')}
              >
                <RotateCcw size={12} />
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center opacity-70 hover:opacity-100"
                style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="px-5 pt-4 pb-5 space-y-5">
            {/* Frequency curve */}
            <FreqCurve gains={eqGains} enabled={eqEnabled} />

            {/* Слайдеры */}
            <div
              className="flex items-end gap-1 px-2"
              style={{ opacity: eqEnabled ? 1 : 0.5, transition: 'opacity var(--dur-base) var(--ease-ios)' }}
            >
              {EQ_BANDS.map((band, i) => (
                <BandSlider
                  key={band.freq}
                  label={band.label}
                  gain={eqGains[i] ?? 0}
                  onChange={v => handleBand(i, v)}
                  enabled={eqEnabled}
                />
              ))}
            </div>

            {/* Пресеты */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2.5"
                style={{ color: 'rgb(var(--theme-text-dim) / 0.6)' }}
              >
                {t('eq_presets')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(EQ_PRESETS).map(name => {
                  const active = activePreset === name;
                  return (
                    <button
                      key={name}
                      onClick={() => handlePreset(name)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
                      style={{
                        background: active ? 'rgb(var(--theme-accent) / 0.15)' : 'rgb(var(--theme-surface-alt))',
                        color: active ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim))',
                        // box-shadow вместо border — не вызывает layout recalculation при hover
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgb(var(--theme-accent) / 0.4), 0 0 12px rgb(var(--theme-accent) / 0.15)'
                          : 'inset 0 0 0 1px rgb(var(--theme-border) / 0.3)',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
