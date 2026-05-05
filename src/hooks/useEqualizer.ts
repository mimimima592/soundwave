import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';

// 7 полос эквалайзера
export const EQ_BANDS = [
  { freq: 32,    label: '32',   type: 'lowshelf'  as BiquadFilterType },
  { freq: 125,   label: '125',  type: 'peaking'   as BiquadFilterType },
  { freq: 250,   label: '250',  type: 'peaking'   as BiquadFilterType },
  { freq: 500,   label: '500',  type: 'peaking'   as BiquadFilterType },
  { freq: 1000,  label: '1k',   type: 'peaking'   as BiquadFilterType },
  { freq: 4000,  label: '4k',   type: 'peaking'   as BiquadFilterType },
  { freq: 16000, label: '16k',  type: 'highshelf' as BiquadFilterType },
];

export const EQ_PRESETS: Record<string, number[]> = {
  'Flat':      [0, 0, 0, 0, 0, 0, 0],
  'Bass Boost':[8, 5, 2, 0, 0, 0, 0],
  'Treble':    [0, 0, 0, 0, 2, 5, 8],
  'Rock':      [5, 3, -1, -2, 2, 4, 5],
  'Pop':       [-1, 2, 4, 4, 2, 0, -1],
  'Jazz':      [3, 1, 0, 2, -1, 2, 3],
  'Classical': [4, 2, 0, 0, -1, 1, 4],
  'Electronic':[5, 4, 1, -1, 3, 4, 5],
  'Vocal':     [-2, -1, 3, 5, 3, 1, -1],
};

// Глобальные синглтоны — AudioContext и фильтры создаются один раз
let _ctx: AudioContext | null = null;
let _source: MediaElementAudioSourceNode | null = null;
let _filters: BiquadFilterNode[] = [];
let _gainNode: GainNode | null = null;
let _connected = false;

export function getAudioContext() { return _ctx; }
export function getFilters() { return _filters; }
export function getGainNode() { return _gainNode; }

function ensureContext(audio: HTMLAudioElement): boolean {
  if (_connected) return true;
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume();

    _source = _ctx.createMediaElementSource(audio);
    _gainNode = _ctx.createGain();
    _gainNode.gain.value = 1;

    _filters = EQ_BANDS.map(band => {
      const f = _ctx!.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      f.Q.value = band.type === 'peaking' ? 1.4 : 0.7;
      f.gain.value = 0;
      return f;
    });

    // Цепочка: source → filter[0] → ... → filter[6] → gain → destination
    let node: AudioNode = _source;
    for (const f of _filters) { node.connect(f); node = f; }
    node.connect(_gainNode);
    _gainNode.connect(_ctx.destination);

    _connected = true;
    return true;
  } catch (e) {
    console.error('[EQ] AudioContext error:', e);
    return false;
  }
}

export function useEqualizer() {
  const eqEnabled = useUIStore((s) => s.eqEnabled);
  const eqGains   = useUIStore((s) => s.eqGains);
  const setEqGain = useUIStore((s) => s.setEqGain);
  const setEqEnabled = useUIStore((s) => s.setEqEnabled);
  const initRef   = useRef(false);

  useEffect(() => {
    const audio = usePlayerStore.getState().audioEl;
    if (!audio || initRef.current) return;

    const tryInit = () => {
      if (ensureContext(audio)) {
        initRef.current = true;
        applyAllGains(eqGains, eqEnabled);
        document.removeEventListener('click', tryInit);
      }
    };

    document.addEventListener('click', tryInit);
    return () => document.removeEventListener('click', tryInit);
  }, []); // eslint-disable-line

  useEffect(() => {
    return usePlayerStore.subscribe((state) => {
      if (state.audioEl && !initRef.current) {
        const tryInit = () => {
          if (state.audioEl && ensureContext(state.audioEl)) {
            initRef.current = true;
            applyAllGains(eqGains, eqEnabled);
          }
        };
        document.addEventListener('click', tryInit, { once: true });
      }
    });
  }, [eqEnabled, eqGains]); // eslint-disable-line

  useEffect(() => {
    if (initRef.current) applyAllGains(eqGains, eqEnabled);
  }, [eqGains, eqEnabled]);

  const setBand = useCallback((index: number, gain: number) => {
    setEqGain(index, gain);
  }, [setEqGain]);

  const applyPreset = useCallback((name: string) => {
    const gains = EQ_PRESETS[name];
    if (!gains) return;
    gains.forEach((g, i) => setEqGain(i, g));
  }, [setEqGain]);

  return { eqEnabled, eqGains, setEqEnabled, setBand, applyPreset };
}

function applyAllGains(gains: number[], enabled: boolean) {
  if (!_filters.length) return;
  _filters.forEach((f, i) => {
    f.gain.value = enabled ? (gains[i] ?? 0) : 0;
  });
}
