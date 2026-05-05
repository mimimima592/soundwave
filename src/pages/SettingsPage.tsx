import { useState, useEffect } from 'react';
import {
  Palette, LogIn, LogOut, Check, X, Plus, Edit2, ImageIcon,
  Disc3, Tv2, Copy, CheckCheck, ChevronDown, Send, Zap, RefreshCw, Globe,
} from 'lucide-react';
import { useUIStore, type BackgroundType } from '@/store/ui';
import type { Theme } from '@/themes/themes';
import { ThemeEditor } from '@/components/settings/ThemeEditor';
import { PageHeader } from '@/components/common/UI';
import { scAPI } from '@/api/soundcloud';
import { cn } from '@/utils/format';
import { useI18nStore, useT } from '@/store/i18n';

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold" style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.025em' }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-8" style={{ background: 'rgb(var(--theme-surface) / 0.7)', border: '1px solid rgb(var(--theme-border) / 0.4)' }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-4" style={{ height: 1, background: 'rgb(var(--theme-border) / 0.3)' }} />;
}

export function SettingsPage() {
  const t = useT();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const themes = useUIStore((s) => s.themes);
  const activeThemeId = useUIStore((s) => s.activeThemeId);
  const setActiveTheme = useUIStore((s) => s.setActiveTheme);
  const bgType = useUIStore((s) => s.backgroundType);
  const bgUrl = useUIStore((s) => s.backgroundUrl);
  const bgBlur = useUIStore((s) => s.backgroundBlur);
  const bgOpacity = useUIStore((s) => s.backgroundOpacity);
  const setBackground = useUIStore((s) => s.setBackground);
  const discordRpcEnabled = useUIStore((s) => s.discordRpcEnabled);
  const setDiscordRpcEnabled = useUIStore((s) => s.setDiscordRpcEnabled);
  const obsWidgetEnabled = useUIStore((s) => s.obsWidgetEnabled);
  const setObsWidgetEnabled = useUIStore((s) => s.setObsWidgetEnabled);
  const widgetOverlayOpacity = useUIStore((s) => s.widgetOverlayOpacity);
  const setWidgetOverlayOpacity = useUIStore((s) => s.setWidgetOverlayOpacity);
  const widgetBgBlur = useUIStore((s) => s.widgetBgBlur);
  const setWidgetBgBlur = useUIStore((s) => s.setWidgetBgBlur);
  const widgetAccentColor = useUIStore((s) => s.widgetAccentColor);
  const setWidgetAccentColor = useUIStore((s) => s.setWidgetAccentColor);
  const widgetBgType = useUIStore((s) => s.widgetBgType);
  const setWidgetBgType = useUIStore((s) => s.setWidgetBgType);
  const oauthToken = useUIStore((s) => s.oauthToken);
  const setOAuthToken = useUIStore((s) => s.setOAuthToken);
  const recentGifs = useUIStore((s) => s.recentGifs);
  const clearRecentGifs = useUIStore((s) => s.clearRecentGifs);
  const performanceMode = useUIStore((s) => s.performanceMode);
  const setPerformanceMode = useUIStore((s) => s.setPerformanceMode);

  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [editorMode, setEditorMode] = useState<'new' | 'edit'>('edit');
  const [tokenInput, setTokenInput] = useState('');
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hoveredGif, setHoveredGif] = useState<string | null>(null);
  const [staticFrames, setStaticFrames] = useState<Record<string, string>>({});
  const [cookiesInput, setCookiesInput] = useState('');
  const [widgetUrlCopied, setWidgetUrlCopied] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null);

  const handleSaveToken = () => {
    const t = tokenInput.trim(); if (!t) return;
    setOAuthToken(t); scAPI.setOAuthToken(t); setTokenInput('');
  };
  const handleLogout = () => { setOAuthToken(null); scAPI.setOAuthToken(null); };
  const handleClearSession = async () => {
    try {
      const success = await window.electron?.auth.clearCookies();
      if (success) { setOAuthToken(null); scAPI.setOAuthToken(null); alert(t('session_cleared')); }
      else alert(t('session_clear_error'));
    } catch { alert(t('session_clear_error')); }
  };
  const handleAuth = async () => {
    setIsAuthenticating(true);
    try {
      const hasCookies = cookiesInput.trim().length > 0;
      if (!hasCookies) await window.electron?.auth.clearCookies();
      if (hasCookies) await window.electron?.auth.importCookies(cookiesInput);
      const token = await window.electron?.auth.soundcloud(hasCookies);
      if (token) { setOAuthToken(token); scAPI.setOAuthToken(token); setCookiesInput(''); }
    } catch { } finally { setIsAuthenticating(false); }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setUpdateCheckResult(null);
    try {
      const result = await window.electron?.updater?.checkForUpdates();
      const remoteVersion = result?.updateInfo?.version;
      const currentVersion = result?.currentVersion;
      // electron-updater возвращает updateInfo даже если версия та же — сравниваем явно
      if (remoteVersion && currentVersion && remoteVersion !== currentVersion) {
        setUpdateCheckResult(`Загружается обновление ${remoteVersion}…`);
      } else {
        setUpdateCheckResult(t('settings_no_updates'));
      }
    } catch (err) {
      setUpdateCheckResult(t('settings_update_error'));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  useEffect(() => {
    const h = (e: CustomEvent<string>) => { setOAuthToken(e.detail); scAPI.setOAuthToken(e.detail); };
    window.addEventListener('auth:tokenDetected', h as EventListener);
    return () => window.removeEventListener('auth:tokenDetected', h as EventListener);
  }, []);

  const extractStaticFrame = (url: string): Promise<string> => new Promise((resolve) => {
    const img = document.createElement('img'); img.crossOrigin = 'anonymous';
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); if (ctx) { ctx.drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); } else resolve(url); };
    img.onerror = () => resolve(url); img.src = url;
  });

  useEffect(() => {
    recentGifs.forEach((gifUrl) => {
      if (!staticFrames[gifUrl]) extractStaticFrame(gifUrl).then((s) => setStaticFrames(p => ({ ...p, [gifUrl]: s })));
    });
  }, [recentGifs]);

  const bgOpts: { id: BackgroundType; label: string; icon: React.ReactNode }[] = [
    { id: 'none', label: t('settings_bg_none_label'), icon: <X size={13} /> },
    { id: 'gif', label: 'GIF / URL', icon: <ImageIcon size={13} /> },
    { id: 'artwork', label: t('settings_bg_artwork_label'), icon: <Disc3 size={13} /> },
    { id: 'color', label: t('settings_bg_color_label'), icon: <Palette size={13} /> },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('settings_title')} subtitle={t('settings_subtitle')} />

      <SectionTitle action={
        <button onClick={() => { setEditorMode('new'); setEditingTheme(themes.find(th => th.id === activeThemeId) ?? themes[0]); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all hover:scale-105"
          style={{ background: 'rgb(var(--theme-surface-alt))', border: '1px solid rgb(var(--theme-border) / 0.5)' }}>
          <Plus size={13} /> {t('settings_new_theme')}
        </button>
      }>{t('settings_section_appearance')}</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {themes.map((theme) => (
          <ThemePreviewCard key={theme.id} theme={theme} active={theme.id === activeThemeId}
            onSelect={() => setActiveTheme(theme.id)}
            onEdit={() => { setEditorMode('edit'); setEditingTheme(theme); }} />
        ))}
      </div>

      <SectionTitle>{t('settings_bg_section')}</SectionTitle>
      <SettingsCard>
        <label className="block text-[12px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: 'rgb(var(--theme-text-dim) / 0.7)' }}>{t('settings_bg_type')}</label>
        <div className="flex gap-2 mb-0">
          {bgOpts.map(opt => (
            <button key={opt.id} onClick={() => setBackground({ type: opt.id })}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={bgType === opt.id ? { background: 'rgb(var(--theme-accent))', color: 'rgb(var(--theme-accent-fg))', boxShadow: '0 2px 12px rgb(var(--theme-accent)/0.3)' } : { background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
              {opt.icon}<span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
        {(bgType === 'gif' || bgType === 'color') && (<>
          <Divider />
          <label className="block text-[12px] font-semibold uppercase tracking-[0.1em] mb-2" style={{ color: 'rgb(var(--theme-text-dim) / 0.7)' }}>
            {bgType === 'gif' ? t('settings_bg_url_label') : t('settings_bg_color_label_full')}
          </label>
          <input type="text" value={bgUrl} onChange={(e) => setBackground({ url: e.target.value })}
            placeholder={bgType === 'gif' ? 'https://example.com/cool.gif' : '#ff0080 или linear-gradient(...)'}
            className="w-full px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgb(var(--theme-bg))', border: '1px solid rgb(var(--theme-border)/0.5)', color: 'rgb(var(--theme-text))' }} />
        </>)}
        {bgType === 'gif' && recentGifs.length > 0 && (<>
          <Divider />
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>{t('settings_recent_gifs')}</label>
            <button onClick={clearRecentGifs} className="text-[11.5px] hover:text-accent transition-colors" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('settings_clear_gifs')}</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {recentGifs.map((gifUrl) => (
              <button key={gifUrl} onClick={() => setBackground({ url: gifUrl })}
                onMouseEnter={() => setHoveredGif(gifUrl)} onMouseLeave={() => setHoveredGif(null)}
                className="aspect-square rounded-xl overflow-hidden transition-all hover:scale-105"
                style={{ border: bgUrl === gifUrl ? '2px solid rgb(var(--theme-accent))' : '2px solid rgb(var(--theme-border)/0.4)' }}>
                <img src={hoveredGif === gifUrl || bgUrl === gifUrl ? gifUrl : (staticFrames[gifUrl] || gifUrl)} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </>)}
        {bgType !== 'none' && (<>
          <Divider />
          <div className="space-y-4">
            <SliderRow label={t('settings_bg_opacity')} value={bgOpacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v*100)}%`} onChange={(v) => setBackground({ opacity: v })} />
            {bgType !== 'color' && <SliderRow label={t('settings_bg_blur_label')} value={bgBlur} min={0} max={50} step={1} format={(v) => `${v}px`} onChange={(v) => setBackground({ blur: v })} />}
          </div>
        </>)}
      </SettingsCard>

      <SectionTitle>{t('settings_section_auth')}</SectionTitle>
      <SettingsCard>
        {oauthToken ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: '#4ade80' }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#4ade8020' }}><Check size={11} strokeWidth={3} style={{ color: '#4ade80' }} /></div>
                {t('settings_authorized')}
              </div>
              <div className="text-[12px] mt-1" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('settings_auth_available')}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleClearSession} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                <X size={13} /> {t('settings_auth_clear')}
              </button>
              <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                <LogOut size={13} /> {t('settings_auth_logout')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('settings_auth_desc')}</p>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>{t('settings_cookies_label')}</label>
              <textarea value={cookiesInput} onChange={(e) => setCookiesInput(e.target.value)}
                placeholder='[{"domain":".soundcloud.com","name":"oauth_token","value":"..."}]'
                className="w-full px-4 py-3 rounded-xl text-[12px] font-mono h-20 resize-none"
                style={{ background: 'rgb(var(--theme-bg))', border: '1px solid rgb(var(--theme-border)/0.5)', color: 'rgb(var(--theme-text))' }} />
            </div>
            <button onClick={handleAuth} disabled={isAuthenticating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-all disabled:opacity-50"
              style={{ background: 'rgb(var(--theme-accent))' }}>
              <LogIn size={15} />{isAuthenticating ? t('authorizing') : t('auth_via_sc')}
            </button>
            <Divider />
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>{t('settings_token_label')}</label>
              <div className="flex gap-2">
                <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveToken()}
                  placeholder="OAuth токен..." className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-mono"
                  style={{ background: 'rgb(var(--theme-bg))', border: '1px solid rgb(var(--theme-border)/0.5)', color: 'rgb(var(--theme-text))' }} />
                <button onClick={handleSaveToken} disabled={!tokenInput.trim()}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-medium text-white disabled:opacity-40"
                  style={{ background: 'rgb(var(--theme-accent))' }}><Send size={15} /></button>
              </div>
            </div>
          </div>
        )}
      </SettingsCard>

      <SectionTitle>{t('settings_section_obs')}</SectionTitle>
      <SettingsCard>
        <ToggleRow label={t('settings_obs_enabled')} description={t('settings_obs_desc')} checked={obsWidgetEnabled} onChange={setObsWidgetEnabled} icon={<Tv2 size={15} />} />
        {obsWidgetEnabled && (<>
          <Divider />
          <button onClick={() => setWidgetSettingsOpen(v => !v)} className="flex items-center justify-between w-full py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-text" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>
            <span>{t('settings_widget_settings')}</span>
            <ChevronDown size={13} className={cn('transition-transform duration-200', widgetSettingsOpen && 'rotate-180')} />
          </button>
          {widgetSettingsOpen && (
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>{t('settings_obs_link_label')}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-xl text-[12.5px] font-mono truncate" style={{ background: 'rgb(var(--theme-bg))', border: '1px solid rgb(var(--theme-border)/0.4)', color: 'rgb(var(--theme-accent))' }}>
                    http://127.0.0.1:9988/widget
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText('http://127.0.0.1:9988/widget'); setWidgetUrlCopied(true); setTimeout(() => setWidgetUrlCopied(false), 2000); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium flex-shrink-0"
                    style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                    {widgetUrlCopied ? <><CheckCheck size={13} style={{ color: '#4ade80' }} /> {t('copied')}</> : <><Copy size={13} /> {t('copy')}</>}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px]" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('settings_obs_accent')}</span>
                <input type="color" value={widgetAccentColor} onChange={(e) => setWidgetAccentColor(e.target.value)} className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent p-0.5" style={{ colorScheme: 'dark' }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px]" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('settings_obs_bg')}</span>
                <div className="flex rounded-xl overflow-hidden text-[12px] font-medium" style={{ border: '1px solid rgb(var(--theme-border)/0.4)' }}>
                  {(['artwork', 'blur'] as const).map(bgT => (
                    <button key={bgT} onClick={() => setWidgetBgType(bgT)} className="px-3 py-1.5 transition-colors"
                      style={widgetBgType === bgT ? { background: 'rgb(var(--theme-accent))', color: 'rgb(var(--theme-accent-fg))' } : { background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                      {bgT === 'artwork' ? t('settings_obs_bg_art') : t('settings_obs_bg_blur_label')}
                    </button>
                  ))}
                </div>
              </div>
              <SliderRow label={t('settings_obs_bg_blur')} value={widgetBgBlur} min={0} max={80} step={1} onChange={setWidgetBgBlur} format={v => v + 'px'} />
              <SliderRow label={t('settings_obs_overlay_opacity')} value={widgetOverlayOpacity} min={0.3} max={0.97} step={0.01} onChange={setWidgetOverlayOpacity} format={v => Math.round(v*100) + '%'} />
              <div className="rounded-xl p-3.5 space-y-2 text-[12px]" style={{ background: 'rgb(var(--theme-bg))', color: 'rgb(var(--theme-text-dim))' }}>
                <div className="flex items-center gap-1.5 font-semibold mb-2" style={{ color: 'rgb(var(--theme-text))' }}>{t('settings_obs_how_title')}</div>
                <div>{t('settings_obs_step1')} <code className="px-1.5 py-0.5 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))' }}>Browser</code></div>
                <div>{t('settings_obs_step2')}</div>
                <div>{t('settings_obs_step3_prefix')} <code className="px-1.5 py-0.5 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))' }}>640</code>{t('settings_obs_step3_suffix')} <code className="px-1.5 py-0.5 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))' }}>160</code></div>
                <div>{t('settings_obs_step4')} <code className="px-1.5 py-0.5 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))' }}>50%</code></div>
              </div>
            </div>
          )}
        </>)}
      </SettingsCard>

      <SectionTitle>{t('settings_section_discord')}</SectionTitle>
      <SettingsCard>
        <ToggleRow label={t('settings_discord_label')} description={t('settings_discord_desc')} checked={discordRpcEnabled} onChange={setDiscordRpcEnabled} icon={<Disc3 size={15} />} />
      </SettingsCard>

      <SectionTitle>{t('settings_section_performance')}</SectionTitle>
      <SettingsCard>
        <ToggleRow
          label={t('settings_perf_mode')}
          description={t('settings_perf_mode_desc')}
          checked={performanceMode}
          onChange={setPerformanceMode}
          icon={<Zap size={15} />}
        />
      </SettingsCard>

      <SectionTitle>{t('settings_section_updates')}</SectionTitle>
      <SettingsCard>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{
                background: isCheckingUpdates ? 'rgb(var(--theme-accent) / 0.15)' : 'rgb(var(--theme-surface-alt))',
                color: isCheckingUpdates ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim))'
              }}>
              <RefreshCw size={15} className={isCheckingUpdates ? 'animate-spin' : ''} />
            </div>
            <div>
              <div className="text-[13.5px] font-medium">{t('settings_check_updates')}</div>
              <div className="text-[12px] mt-0.5" style={{
                color: updateCheckResult?.startsWith('Загружается') || updateCheckResult?.startsWith('Downloading') ? 'rgb(var(--theme-accent))'
                  : updateCheckResult?.startsWith('Ошибка') || updateCheckResult?.startsWith('Error') ? '#f87171'
                  : 'rgb(var(--theme-text-dim))'
              }}>
                {updateCheckResult || t('settings_check_updates')}
              </div>
            </div>
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={isCheckingUpdates}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex-shrink-0"
            style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}
          >
            <RefreshCw size={13} className={isCheckingUpdates ? 'animate-spin' : ''} />
            {isCheckingUpdates ? t('settings_checking') : t('check')}
          </button>
        </div>
      </SettingsCard>

      {/* Язык / Language */}
      <SectionTitle><Globe size={16} className="inline mr-2 opacity-70" />{t('settings_section_language')}</SectionTitle>
      <SettingsCard>
        <div className="flex items-center gap-3">
          {(['ru', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: language === lang ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-surface-alt))',
                color: language === lang ? 'white' : 'rgb(var(--theme-text-dim))',
                boxShadow: language === lang ? '0 4px 12px rgb(var(--theme-accent) / 0.3)' : undefined,
              }}
            >
              <span>{lang === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
              <span>{lang === 'ru' ? t('settings_language_ru') : t('settings_language_en')}</span>
              {language === lang && <Check size={13} />}
            </button>
          ))}
        </div>
      </SettingsCard>

      {editingTheme && <ThemeEditor initial={editingTheme} isNew={editorMode === 'new'} onClose={() => setEditingTheme(null)} />}
    </div>
  );
}

function ThemePreviewCard({ theme, active, onSelect, onEdit }: { theme: Theme; active: boolean; onSelect: () => void; onEdit: () => void }) {
  const c = theme.colors;
  return (
    <div onClick={onSelect} className={cn('relative rounded-2xl overflow-hidden cursor-pointer transition-colors duration-200')}
      style={{
        border: active ? '2px solid rgb(var(--theme-accent))' : '1px solid rgb(var(--theme-border)/0.4)',
        boxShadow: active ? '0 4px 20px rgb(var(--theme-accent)/0.25)' : undefined,
        transform: active ? 'scale(1.02)' : undefined,
        transition: 'transform var(--dur-base) var(--ease-ios), border-color var(--dur-base) var(--ease-ios), box-shadow var(--dur-base) var(--ease-ios)',
      }}>
      <div className="aspect-[16/10] relative" style={{ background: `rgb(${c.bg})` }}>
        <div className="absolute top-2 left-2 right-2 bottom-7 rounded-xl" style={{ background: `rgb(${c.surface})` }} />
        <div className="absolute top-3.5 left-3.5 w-8 h-1.5 rounded-full" style={{ background: `rgb(${c.accent})` }} />
        <div className="absolute top-6 left-3.5 w-14 h-1 rounded-full" style={{ background: `rgb(${c.text})` }} />
        <div className="absolute top-8 left-3.5 w-10 h-0.5 rounded-full opacity-50" style={{ background: `rgb(${c.textDim})` }} />
        <div className="absolute top-2 left-2 bottom-7 w-3 rounded-l-xl" style={{ background: `rgb(${c.surfaceAlt})` }} />
        <div className="absolute bottom-0 left-0 right-0 h-6 rounded-b" style={{ background: `rgb(${c.surface})` }} />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full" style={{ background: `rgb(${c.accent})` }} />
      </div>
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: `rgb(${c.surface})` }}>
        <span className="text-[12px] font-semibold" style={{ color: `rgb(${c.text})`, fontFamily: "'Inter', system-ui, sans-serif" }}>{theme.name}</span>
        <div className="flex items-center gap-1">
          {active && <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `rgb(${c.accent})` }}><Check size={9} className="text-white" strokeWidth={3} /></div>}
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 rounded-lg transition-colors hover:bg-black/20" style={{ color: `rgb(${c.textDim})` }}><Edit2 size={11} /></button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--theme-text-dim)/0.7)' }}>{label}</label>
        <span className="text-[11.5px] font-mono" style={{ color: 'rgb(var(--theme-text-dim))' }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: 'rgb(var(--theme-accent))' }} />
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, icon }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{ background: checked ? 'rgb(var(--theme-accent) / 0.15)' : 'rgb(var(--theme-surface-alt))', color: checked ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim))' }}>
            {icon}
          </div>
        )}
        <div>
          <div className="text-[13.5px] font-medium">{label}</div>
          {description && <div className="text-[12px] mt-0.5" style={{ color: 'rgb(var(--theme-text-dim))' }}>{description}</div>}
        </div>
      </div>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0"
        style={checked ? { background: 'rgb(var(--theme-accent))' } : { background: 'rgb(var(--theme-surface-alt))' }}>
        <span className={cn('absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}
