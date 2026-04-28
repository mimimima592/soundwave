const { contextBridge } = require('electron');

// Canvas fingerprinting: реальный шум через XOR пикселей
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attributes) {
  const ctx = originalGetContext.call(this, type, attributes);
  if (type === '2d' && ctx) {
    const originalGetImageData = ctx.getImageData.bind(ctx);
    ctx.getImageData = function(x, y, w, h) {
      const data = originalGetImageData(x, y, w, h);
      for (let i = 0; i < data.data.length; i += 100) {
        data.data[i] = data.data[i] ^ 1;
      }
      return data;
    };
  }
  return ctx;
};

// Override screen parameters to avoid detection
Object.defineProperty(window.screen, 'width', { get: () => 1920 });
Object.defineProperty(window.screen, 'height', { get: () => 1080 });
Object.defineProperty(window.screen, 'availWidth', { get: () => 1920 });
Object.defineProperty(window.screen, 'availHeight', { get: () => 1040 });

// Override navigator.webdriver to undefined to avoid detection
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
});

// Override Chrome object with more methods
window.chrome = {
  runtime: {},
  loadTimes: function() {},
  csi: function() {},
};

// Override hardwareConcurrency
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 8,
});

// Override deviceMemory
Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
});

// Override languages
Object.defineProperty(navigator, 'languages', {
  get: () => ['ru-RU', 'ru', 'en-US', 'en'],
});

// Override platform to match User-Agent (Windows)
Object.defineProperty(navigator, 'platform', {
  get: () => 'Win32',
});

// Override appVersion to match User-Agent
Object.defineProperty(navigator, 'appVersion', {
  get: () => '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

// Override Intl timezone
Object.defineProperty(Intl.DateTimeFormat().resolvedOptions(), 'timeZone', {
  get: () => 'Europe/Moscow',
});

// Override Permissions API with human-like response
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);

// Override plugins
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5],
});

// Override connection
Object.defineProperty(navigator, 'connection', {
  get: () => ({
    effectiveType: '4g',
    rtt: 100,
    downlink: 10,
  }),
});

// Client Hints - match headers
if (navigator.userAgentData) {
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: 'Chromium', version: '131' },
        { brand: 'Not:A-Brand', version: '24' },
        { brand: 'Google Chrome', version: '131' }
      ],
      mobile: false,
      platform: 'Windows'
    })
  });
}

// Clear session storage to remove old bot markers
try {
  } catch (e) {
  // Ignore if sessionStorage is not available
}
