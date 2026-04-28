# Soundwave

Современный десктопный клиент SoundCloud с кастомными темами, анимированными фонами и интеграцией Discord Rich Presence.

**Стек:** Electron · React 18 · TypeScript · Tailwind · Zustand · Vite

---

## Возможности

- **Нативный плеер** — полностью свой UI поверх SoundCloud API (не WebView)
- **5 встроенных тем** (Midnight, Lavender, Synthwave, Forest, Paper) + редактор кастомных тем с color-picker для каждого цвета
- **Фоны:** GIF по URL, артворк текущего трека, сплошной цвет/градиент, с регулировкой blur и прозрачности
- **Discord Rich Presence** с прогресс-баром, обложкой трека и кнопкой "Listen on SoundCloud"
- **Чарты и тренды** по жанрам
- **Поиск** с debounce
- **Очередь** с shuffle/repeat
- **Горячие клавиши** и поддержка медиа-клавиш
- **Frameless окно** с кастомным titlebar
- **Персистентность** — настройки, тема, токен сохраняются между запусками

---

## Быстрый старт

```bash
npm install
npm run dev
```

Это запустит Vite dev-сервер и Electron одновременно. При первом запуске приложение само извлечёт `client_id` из публичной веб-версии SoundCloud — авторизация не нужна, чтобы играть треки и видеть чарты.

### Сборка дистрибутива

```bash
npm run build         # под текущую платформу
npm run build:win     # Windows (.exe, NSIS-инсталлер)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (AppImage + .deb)
```

Готовый установщик окажется в папке `release/`.

---

## Настройка Discord Rich Presence

RPC не заработает "из коробки" — ему нужен собственный Application ID в Discord. Это разовая настройка на 2 минуты:

1. Зайди на https://discord.com/developers/applications и нажми **New Application**. Назови его как хочешь (имя покажется в Discord как "Играет в [NAME]")
2. Скопируй **Application ID** со страницы **General Information**
3. Открой `electron/discord-rpc.ts` и замени значение константы:
   ```ts
   const DISCORD_CLIENT_ID = 'ТВОЙ_APPLICATION_ID';
   ```
4. Вернись на сайт Discord, перейди в **Rich Presence → Art Assets** и загрузи три изображения с именами (ключами):
   - `logo` — большая иконка в правой части presence (рекомендую 512×512, логотип Soundwave или твой)
   - `play` — маленькая иконка статуса "играет" (треугольник)
   - `pause` — маленькая иконка статуса "на паузе"
5. Перезапусти приложение. Discord должен быть запущен.

> Если Discord выключен, Soundwave просто молча пропустит обновления RPC и переподключится, когда Discord запустится.

---

## Авторизация SoundCloud (опционально)

Базовое воспроизведение и поиск работают без авторизации. Авторизация нужна только для: ленты подписок, своих плейлистов, лайков.

Официальная регистрация сторонних приложений в SoundCloud **закрыта с 2021 года**. Единственный рабочий способ получить OAuth-токен — извлечь свой же токен из веб-версии:

1. Открой https://soundcloud.com в браузере и залогинься
2. Открой DevTools (`F12`) → вкладка **Application** (Chrome) или **Storage** (Firefox)
3. Слева раскрой **Cookies → https://soundcloud.com**
4. Найди cookie с именем `oauth_token` и скопируй его значение
5. В Soundwave открой **Настройки → Авторизация SoundCloud**, вставь токен, нажми **Войти**

Токен шифруется и сохраняется локально через electron-store. Он действует пока ты не вышел из аккаунта в браузере.

---

## Клавиатурные шорткаты

| Действие              | Клавиши              |
| --------------------- | -------------------- |
| Play / Pause          | `Space`              |
| Следующий / предыдущий | `Shift + ←/→`      |
| Перемотка ±10 сек     | `Ctrl/Cmd + ←/→`    |
| Громкость ±5%         | `Ctrl/Cmd + ↑/↓`    |
| Mute                  | `Ctrl/Cmd + M`       |

Медиа-клавиши (Play/Pause/Next/Previous на клавиатуре) тоже работают.

---

## Структура проекта

```
soundwave/
├── electron/              # Main process
│   ├── main.ts           # Electron entry, IPC handlers
│   ├── preload.ts        # Bridge main↔renderer
│   ├── discord-rpc.ts    # Discord RPC manager
│   └── settings-store.ts # electron-store wrapper
├── src/                   # Renderer (React)
│   ├── api/
│   │   └── soundcloud.ts # SoundCloud API клиент + auto-client_id
│   ├── components/
│   │   ├── common/       # Titlebar, BackgroundLayer, UI primitives
│   │   ├── player/       # PlayerBar, TrackCard
│   │   ├── sidebar/      # Sidebar
│   │   └── settings/     # ThemeEditor
│   ├── pages/            # HomePage, SearchPage, SettingsPage, ...
│   ├── store/            # Zustand stores (player, ui)
│   ├── themes/           # Built-in themes + applyTheme
│   ├── hooks/            # useAudio, useDiscordRPC, useKeyboard
│   ├── types/            # SoundCloud API типы + window.electron
│   └── utils/            # format helpers
└── ...configs
```

---

## Как создать свою тему

1. **Настройки → Темы → Новая** — создаст копию активной темы
2. Редактируй цвета через color-picker или вбивай вручную
3. Настрой blur и радиус скругления
4. **Сохранить** — тема сразу применится

Все 8 цветов управляют разными частями UI:
- `bg` — основной фон окна
- `surface` — панели и карточки
- `surface-alt` — hover-состояния
- `border` — контуры и разделители
- `text` / `textDim` — основной и вторичный текст
- `accent` / `accentHover` — кнопка play, активная вкладка, прогресс-бар

Темы хранятся в `electron-store` (JSON в папке пользователя). Экспорт/импорт тем — хорошая идея для следующей версии.

---

## Важные ограничения

### HLS-стримы
SoundCloud всё чаще отдаёт треки только через HLS (не progressive MP3). Текущая реализация пытается сначала найти progressive-транскодинг. Если его нет и есть только HLS — трек может не проиграться. Решение: добавить `hls.js`:

```bash
npm install hls.js
```

И в `src/store/player.ts` в методе `playTrack`, когда `isHls === true`, подключить `Hls` вместо прямого `audio.src = url`. Это небольшая правка на ~15 строк.

### SoundCloud может заблокировать
Использование извлечённого `client_id` — формально серая зона. Десятки опенсорс-клиентов используют этот подход годами, но SoundCloud в любой момент может добавить anti-scraping. Если в один день приложение перестанет работать — скорее всего сломался `fetchClientId()`; придётся обновить регулярку под новый формат их бандлов.

### Discord Client ID обязателен
Без своего Discord Application ID RPC просто не активируется (код это проверяет и тихо пропускает). Нельзя использовать чужой ID — иконки в presence берутся из Art Assets того приложения.

### Шифрование настроек
Для простоты `electron-store` настроен с жёстко прописанным ключом шифрования в `electron/settings-store.ts`. Для production лучше использовать `safeStorage` API Electron (привязан к OS keychain) для хранения OAuth-токена.

---

## Что можно улучшить дальше

- Детальные страницы артиста и плейлиста (сейчас только карточки)
- Impl ленты/библиотеки/лайков (stub-страницы готовы, нужно наполнить API-вызовами)
- Добавить `hls.js` для полной поддержки HLS
- Экспорт/импорт тем через JSON-файлы
- Встроенный OAuth-flow через Electron BrowserWindow (вместо ручного копирования токена)
- Equalizer через Web Audio API
- Скроблинг в Last.fm

---

## Лицензия

MIT. Используй как хочешь.

**Disclaimer:** Soundwave — неофициальный клиент и никак не связан с SoundCloud Inc. Используется внутренний `api-v2` endpoint, формально не предназначенный для сторонних клиентов. SoundCloud может в любой момент изменить API или заблокировать доступ.
