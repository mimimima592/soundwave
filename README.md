# Soundwave

> Неофициальный десктопный клиент SoundCloud с кастомными темами, эквалайзером, синхронным прослушиванием и интеграцией с Discord и OBS.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Stack](https://img.shields.io/badge/stack-Electron%20%B7%20React%20%B7%20TypeScript-informational)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Возможности

### Плеер
- Полностью кастомный UI поверх SoundCloud API — никакого WebView
- Очередь со shuffle и тремя режимами повтора
- Перемотка, регулировка громкости, медиа-клавиши
- История прослушивания
- Вставка ссылки на трек/плейлист прямо в приложение

### Темы и кастомизация
- 5 встроенных тем: Midnight, Lavender, Synthwave, Forest, Paper
- Редактор тем с color-picker по 8 токенам (фон, поверхность, акцент, текст и др.)
- Фон окна: GIF по URL, артворк текущего трека, сплошной цвет или CSS-градиент
- Регулировка blur и прозрачности фона

### Эквалайзер
- 7-полосный параметрический эквалайзер через Web Audio API
- Встроенные пресеты: Flat, Bass Boost, Treble, Rock

### Текст песни
- Синхронизированные тексты с подсветкой текущей строки (LRC)
- Фолбэк на обычный текст если синхронизации нет

### Listen Party
- Совместное прослушивание через PeerJS (WebRTC, peer-to-peer)
- Хост управляет треком и очередью, слушатели синхронизируются в реальном времени
- Heartbeat для контроля соединения

### Discord Rich Presence
- Отображает трек, артиста, прогресс и обложку прямо в профиле Discord
- Кнопка «Listen on SoundCloud» для друзей
- Автопереподключение если Discord был закрыт

### OBS Widget
- HTTP-сервер на порту `9988` с виджетом Now Playing для OBS Browser Source
- Кастомный акцент-цвет, blur фона, прозрачность оверлея
- Синхронизируется с плеером в реальном времени

### Автообновление
- Обновления через GitHub Releases — проверяет при старте и каждые 30 минут
- Ручная проверка в настройках
- Silent install без участия пользователя

---

## Установка

Скачай последний установщик со страницы [Releases](../../releases/latest):

| Платформа | Файл |
|-----------|------|
| Windows   | `Soundwave-Setup-x.x.x.exe` |
| macOS     | `Soundwave-x.x.x.dmg` |
| Linux     | `Soundwave-x.x.x.AppImage` или `.deb` |

---

## Сборка из исходников

```bash
git clone https://github.com/mimimima592/soundwave.git
cd soundwave
npm install
npm run dev
```

При первом запуске `client_id` для SoundCloud API извлекается автоматически — авторизация не нужна для воспроизведения треков и просмотра чартов.

### Сборка дистрибутива

```bash
npm run build:win     # Windows (.exe, NSIS)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (AppImage + .deb)
```

Готовый установщик окажется в папке `release/`.

---

## Авторизация SoundCloud

Базовое воспроизведение и поиск работают без авторизации. Авторизация нужна для: ленты подписок, плейлистов, лайков, подписчиков.

Официальная регистрация сторонних приложений в SoundCloud закрыта с 2021 года. Способ получить токен — извлечь свой из веб-версии:

1. Залогинься на [soundcloud.com](https://soundcloud.com) в браузере
2. Открой DevTools (`F12`) → **Application → Cookies → soundcloud.com**
3. Найди cookie `oauth_token`, скопируй значение
4. В Soundwave: **Настройки → Авторизация SoundCloud** → вставь токен

Либо нажми **Авторизоваться через SoundCloud** — откроется браузер и токен подхватится автоматически.

---

## Discord Rich Presence

RPC требует собственного Discord Application ID:

1. Создай приложение на [discord.com/developers](https://discord.com/developers/applications)
2. Скопируй **Application ID**
3. В `electron/discord-rpc.ts` замени:
   ```ts
   const DISCORD_CLIENT_ID = 'ТВОЙ_ID';
   ```
4. В **Rich Presence → Art Assets** загрузи три картинки с ключами: `logo`, `play`, `pause`

---

## Горячие клавиши

| Действие | Клавиши |
|----------|---------|
| Play / Pause | `Space` |
| Следующий / предыдущий трек | `Shift + →/←` |
| Перемотка ±10 сек | `Ctrl + →/←` |
| Громкость ±5% | `Ctrl + ↑/↓` |
| Mute | `Ctrl + M` |

Медиа-клавиши на клавиатуре (Play/Pause/Next/Prev) тоже работают.

---

## Стек

| Слой | Технологии |
|------|-----------|
| Оболочка | Electron 30 |
| UI | React 18, TypeScript, Tailwind CSS |
| Состояние | Zustand |
| Сборка | Vite, electron-builder |
| P2P | PeerJS (WebRTC) |
| Audio | Web Audio API |
| Хранилище | electron-store |

---

## Дисклеймер

Soundwave — неофициальный клиент, никак не связанный с SoundCloud Inc. Использует внутренний `api-v2` endpoint, не предназначенный для сторонних приложений. SoundCloud может в любой момент изменить API.
