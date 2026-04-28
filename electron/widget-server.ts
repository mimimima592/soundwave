import http from 'http';
import fs from 'fs';
import path from 'path';

export const WIDGET_PORT = 9988;

export interface NowPlayingData {
  title: string;
  artist: string;
  artwork: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  accentColor: string;   // "R G B" format, e.g. "255 85 0"
  bgUrl: string;         // GIF/image URL from app settings
  overlayOpacity: number; // 0-1, how dark the overlay is
  bgBlur: number;        // blur radius in px for background
  bgType: string;        // 'artwork' | 'plain'
}

let currentData: NowPlayingData = {
  title: '',
  artist: '',
  artwork: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  accentColor: '255 85 0',
  bgUrl: '',
  overlayOpacity: 0.6,
  bgBlur: 40,
  bgType: 'artwork',
};

let server: http.Server | null = null;

const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Soundwave Widget</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    /*
     * OBS Browser Source: set Width=640, Height=160
     * Then scale to 50% in OBS Transform for 2x crisp rendering (visual 320x80).
     */
    *, *::before, *::after {
      margin: 0; padding: 0; box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    html, body {
      background: transparent;
      overflow: hidden;
      width: 640px;
      height: 160px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    /* Blur OBS: элемент СНАРУЖИ .card, поэтому не обрезается overflow:hidden.
       backdrop-filter здесь размывает всё что находится под виджетом в OBS сцене.
       border-radius через clip-path — он не конфликтует с backdrop-filter. */
    #blur-overlay {
      display: none;
      position: absolute;
      inset: 0;
      border-radius: 28px;
      clip-path: inset(0 round 28px);
      z-index: 0;
      pointer-events: none;
    }

    .card {
      position: relative;
      width: 640px;
      height: 160px;
      border-radius: 28px;
      overflow: hidden;
      opacity: 0;
      transition: opacity 0.4s ease;
      z-index: 1;
    }
    .card.show { opacity: 1; }

    /* Blurred background layer */
    .bg {
      position: absolute;
      inset: -80px;
      background-size: cover;
      background-position: center;
    }

    /* Semi-transparent dark overlay */
    .ov {
      position: absolute;
      inset: 0;
    }

    /* ── Layout: artwork left, info right ── */
    .inner {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: stretch;
      padding: 16px;
      gap: 18px;
    }

    /* Square artwork — fills padded height exactly */
    .art-box {
      flex-shrink: 0;
      width: 128px;
      height: 128px; /* 160 - 16*2 = 128 */
      border-radius: 16px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.06);
    }
    .art-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .art-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Info column */
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 4px 0 2px;
    }

    .title {
      font-size: 30px;
      font-weight: 700;
      color: rgba(252, 252, 255, 0.97);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.03em;
      line-height: 1.15;
    }
    .artist {
      font-size: 22px;
      font-weight: 400;
      color: rgba(190, 190, 205, 0.82);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 6px;
    }

    /* Progress row: time — bar — time */
    .prog {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .time {
      font-size: 20px;
      font-weight: 500;
      color: rgba(200, 200, 215, 0.75);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .bar {
      flex: 1;
      height: 5px;
      background: rgba(255, 255, 255, 0.14);
      border-radius: 3px;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s linear;
    }
  </style>
</head>
<body>
  <!-- Blur OBS: живёт снаружи .card чтобы backdrop-filter не обрезался overflow:hidden -->
  <div id="blur-overlay"></div>

  <div class="card" id="card">
    <div class="bg"  id="bg"></div>
    <div class="ov"  id="ov"></div>

    <div class="inner">
      <div class="art-box" id="art-box">
        <img id="art" alt="" style="display:none"/>
        <div class="art-ph" id="ph">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none"
               id="ph-icon" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
      </div>

      <div class="info">
        <div>
          <div class="title"  id="title">—</div>
          <div class="artist" id="artist">—</div>
        </div>
        <div class="prog">
          <span class="time" id="cur">0:00</span>
          <div class="bar"><div class="fill" id="fill" style="width:0%"></div></div>
          <span class="time" id="dur">0:00</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    function fmt(s) {
      if (!isFinite(s) || s < 0) return '0:00';
      s = Math.floor(s);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function parseRGB(str) {
      return (str || '255, 85, 0').split(',').map(x => parseInt(x.trim(), 10));
    }

    let lastArt = '', lastBg = '', lastAc = '', lastOv = -1, lastBlur = -1;

    function applyAccent(ac) {
      const [r, g, b] = parseRGB(ac);
      document.getElementById('fill').style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
      const ph = document.getElementById('ph-icon');
      if (ph) ph.style.stroke = 'rgba(' + r + ',' + g + ',' + b + ',0.55)';
      document.getElementById('art-box').style.background = 'rgba(' + r + ',' + g + ',' + b + ',0.1)';
    }

    function update(d) {
      const card = document.getElementById('card');
      if (!d || !d.title) { card.classList.remove('show'); return; }
      card.classList.add('show');

      // Accent
      if (d.accentColor && d.accentColor !== lastAc) {
        lastAc = d.accentColor;
        applyAccent(d.accentColor);
      }

      // Overlay opacity
      const opacity = d.overlayOpacity !== undefined ? d.overlayOpacity : 0.6;
      if (opacity !== lastOv) {
        lastOv = opacity;
        document.getElementById('ov').style.background = 'rgba(8,8,12,' + opacity + ')';
      }

      // Background + blur
      const blur = d.bgBlur !== undefined ? d.bgBlur : 40;
      const bgt  = d.bgType || 'artwork';
      const bgEl = document.getElementById('bg');
      const ovEl = document.getElementById('ov');
      const blurOverlay = document.getElementById('blur-overlay');

      if (bgt === 'blur') {
        // Blur OBS mode: backdrop-filter на внешнем wrapper'е поверх overflow:hidden карточки.
        // backdrop-filter не работает внутри overflow:hidden — поэтому используем отдельный
        // элемент СНАРУЖИ .card с той же геометрией, он и размывает то что под виджетом.
        bgEl.style.display = 'none';
        card.style.backdropFilter = 'none';
        card.style.webkitBackdropFilter = 'none';
        blurOverlay.style.display = 'block';
        blurOverlay.style.backdropFilter = 'blur(' + blur + 'px)';
        blurOverlay.style.webkitBackdropFilter = 'blur(' + blur + 'px)';
        ovEl.style.background = 'rgba(8,8,12,' + opacity + ')';
        lastBlur = blur; lastBg = 'blur';
      } else {
        // Art Blur mode: blurred artwork as background
        blurOverlay.style.display = 'none';
        blurOverlay.style.backdropFilter = 'none';
        blurOverlay.style.webkitBackdropFilter = 'none';
        bgEl.style.display = '';
        card.style.backdropFilter = 'none';
        card.style.webkitBackdropFilter = 'none';
        if (blur !== lastBlur) {
          lastBlur = blur;
          bgEl.style.filter = 'blur(' + blur + 'px) brightness(0.6) saturate(2.5)';
        }
        const newBgKey = 'artwork:' + (d.artwork || '');
        if (newBgKey !== lastBg) {
          lastBg = newBgKey;
          bgEl.style.backgroundImage = d.artwork ? 'url("' + d.artwork + '")' : 'none';
        }
      }

      // Artwork thumbnail
      const artEl = document.getElementById('art');
      const phEl  = document.getElementById('ph');
      if (d.artwork && d.artwork !== lastArt) {
        lastArt = d.artwork;
        artEl.src = d.artwork;
        artEl.style.display = 'block';
        phEl.style.display  = 'none';
      } else if (!d.artwork) {
        artEl.style.display = 'none';
        phEl.style.display  = 'flex';
      }

      document.getElementById('title').textContent  = d.title  || '—';
      document.getElementById('artist').textContent = d.artist || '—';

      const pct = d.duration > 0 ? Math.min((d.currentTime / d.duration) * 100, 100) : 0;
      document.getElementById('fill').style.width = pct + '%';
      document.getElementById('cur').textContent  = fmt(d.currentTime);
      document.getElementById('dur').textContent  = fmt(d.duration);
    }

    async function poll() {
      try { update(await (await fetch('/api/now-playing')).json()); } catch (_) {}
    }

    poll();
    setInterval(poll, 500);
  </script>
</body>
</html>`;

export function updateWidgetData(data: Partial<NowPlayingData>): void {
  currentData = { ...currentData, ...data };
}

export function startWidgetServer(): number {
  if (server) return WIDGET_PORT;

  server = http.createServer((req, res): void => {
    const url = req.url ?? '/';

    if (url === '/api/now-playing') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
      });
      res.end(JSON.stringify(currentData));
      return;
    }

    if (url === '/widget' || url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(WIDGET_HTML);
      return;
    }

    // Proxy for background GIF/image — handles both HTTP URLs and local file paths
    if (url?.startsWith('/bg')) {
      const bgUrl = currentData.bgUrl;
      if (!bgUrl) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (bgUrl.startsWith('http://') || bgUrl.startsWith('https://')) {
        res.writeHead(302, { Location: bgUrl });
        res.end();
        return;
      }
      // Local file
      try {
        const ext = path.extname(bgUrl).toLowerCase().slice(1);
        const mime = ext === 'gif' ? 'image/gif'
                   : ext === 'webp' ? 'image/webp'
                   : ext === 'png'  ? 'image/png'
                   : 'image/jpeg';
        const data = fs.readFileSync(bgUrl);
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (err) => {
    console.error('[Widget] Server error:', err);
    server = null;
  });

  server.listen(WIDGET_PORT, '127.0.0.1');
  console.log('[Widget] Server started on http://127.0.0.1:' + WIDGET_PORT + '/widget');
  return WIDGET_PORT;
}

export function stopWidgetServer(): void {
  if (server) {
    server.close();
    server = null;
    console.log('[Widget] Server stopped');
  }
}

export function isWidgetServerRunning(): boolean {
  return server !== null;
}
