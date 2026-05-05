import { create } from 'zustand';

export type Language = 'ru' | 'en';

const translations = {
  ru: {
    // Sidebar nav
    nav_home: 'Главная',
    nav_search: 'Поиск',
    nav_wave: 'Волна',
    nav_feed: 'Лента',
    nav_history: 'История',
    nav_library: 'Библиотека',
    nav_likes: 'Любимое',
    nav_profile: 'Профиль',
    nav_settings: 'Настройки',

    // Common
    loading: 'Загрузка...',
    error: 'Ошибка',
    error_loading: 'Ошибка загрузки',
    nothing_found: 'Ничего не найдено',
    show_all: 'Показать всё',
    collapse: 'Свернуть',
    copy: 'Копировать',
    copied: 'Скопировано',
    check: 'Проверить',
    connect: 'Подключиться',
    play: 'Играть',
    like: 'Лайкнуть',
    unlike: 'Убрать лайк',
    user: 'Пользователь',
    playlist: 'Плейлист',
    track: 'Трек',

    // Auth
    auth_required: 'Требуется авторизация',
    auth_via_sc: 'Авторизоваться через SoundCloud',
    authorizing: 'Авторизация...',
    session_cleared: 'Сессия очищена',
    session_clear_error: 'Ошибка очистки сессии',

    // HomePage
    home_title: 'Добро пожаловать',
    home_subtitle: 'Открой для себя что-то новое сегодня',
    home_recent: 'Недавно прослушано',
    home_recommendations: 'Ещё по вкусу',
    home_my_tracks: 'Мои треки',
    home_no_data: 'Нет данных',
    home_login_hint: 'Войдите в аккаунт, чтобы увидеть персональные рекомендации',

    // SearchPage
    search_title: 'Поиск',
    search_subtitle: 'Найди любой трек на SoundCloud',
    search_placeholder: 'Название трека, исполнитель или ссылка SoundCloud...',
    search_start: 'Начни писать',
    search_start_hint: 'Введи минимум 2 символа, чтобы начать поиск',
    search_error: 'Ошибка поиска',
    search_empty: 'Ничего не найдено',
    search_invalid_link: 'Неверная ссылка SoundCloud',
    search_tab_all: 'Всё',
    search_tab_tracks: 'Треки',
    search_tab_people: 'Люди',
    search_tab_albums: 'Альбомы',
    search_tab_playlists: 'Плейлисты',
    search_section_tracks: 'Треки',
    search_section_people: 'Люди',
    search_section_albums: 'Альбомы',

    // FeedPage
    feed_title: 'Лента',
    feed_subtitle: 'Треки от тех, на кого ты подписан',
    feed_auth_desc: 'Авторизуйся, чтобы видеть треки от подписок',
    feed_empty_title: 'Лента пуста',
    feed_empty_desc: 'Подпишись на артистов, чтобы видеть их треки',

    // LikesPage
    likes_title: 'Любимое',
    likes_subtitle: 'Лайкнутые треки',
    likes_empty_title: 'Нет лайкнутых треков',
    likes_empty_desc: 'Нажми на сердечко у трека, чтобы добавить его в любимые',

    // LibraryPage
    library_title: 'Библиотека',
    library_auth_title: 'Библиотека',
    library_auth_desc: 'Авторизуйся, чтобы видеть свои плейлисты',

    // HistoryPage
    history_title: 'История прослушивания',
    history_subtitle: 'Твои недавно прослушанные треки',
    history_auth_title: 'История',
    history_auth_desc: 'Авторизуйся через Настройки → Авторизация, чтобы видеть историю прослушивания',
    history_empty_title: 'История пуста',
    history_empty_desc: 'Начни слушать треки, чтобы они появились здесь',

    // UserPage
    user_not_found: 'Пользователь не найден',
    user_profile_error: 'Не удалось загрузить профиль',
    user_auth_required: 'Требуется авторизация для просмотра профиля',
    user_follow_error_sub: 'Ошибка отписки',
    user_follow_error_follow: 'Ошибка подписки',
    user_no_content: 'Здесь пока нет контента',
    user_tab_all: 'Все',
    user_tab_popular: 'Популярное',
    user_tab_tracks: 'Треки',
    user_tab_playlists: 'Плейлисты',
    user_tab_likes: 'Лайки',
    user_followers: 'подписчиков',
    user_following: 'подписок',
    followers_count_1: 'подписчик',
    followers_count_234: 'подписчика',
    followers_count_many: 'подписчиков',

    // FollowersPage / FollowingPage
    followers_title: 'Подписчики',
    following_title: 'Подписки',
    followers_empty_title: 'Нет подписчиков',
    followers_empty_desc: 'У этого пользователя пока нет подписчиков',
    following_empty_title: 'Нет подписок',
    following_empty_desc: 'Этот пользователь пока ни на кого не подписан',
    following_auth_error: 'Требуется авторизация для просмотра подписок',

    // TrackPage
    track_not_found: 'Трек не найден',
    track_load_error: 'Не удалось загрузить трек',
    track_comment_placeholder_current: 'Комментарий к',
    track_comment_placeholder_default: 'Напиши комментарий...',
    track_comment_error: 'Не удалось опубликовать комментарий',
    track_related: 'Похожие треки',

    // PlaylistPage
    playlist_not_found: 'Плейлист не найден',
    playlist_load_error: 'Не удалось загрузить плейлист',
    playlist_empty: 'Плейлист пуст',
    playlist_empty_desc: 'В этом плейлисте пока нет треков',

    // WavePage
    wave_queue: 'В очереди',
    wave_refresh: 'Обновить волну',
    wave_status_generating: 'Подбираю первый трек...',
    wave_status_scanning: 'Анализирую вкусы...',
    wave_status_waiting: 'Ожидание...',
    wave_status_based_on: 'На основе',
    wave_status_likes: 'лайков',

    // LyricsPage
    lyrics_synced: 'Синхронизировано',
    lyrics_unsynced: 'Без синхронизации',
    lyrics_instrumental: 'Инструментальный трек',
    lyrics_not_found: 'Текст не найден',
    lyrics_no_words: 'У этого трека нет слов',
    lyrics_lrclib_error: 'Не удалось найти текст для этого трека на lrclib',

    // PlayerBar
    player_favorites: 'В избранное',
    player_shuffle: 'Перемешать',
    player_previous: 'Предыдущий',
    player_pause: 'Пауза',
    player_play: 'Играть',
    player_next: 'Следующий',
    player_repeat: 'Повтор',
    player_equalizer: 'Эквалайзер',
    player_listen_together: 'Слушать вместе',
    player_lyrics: 'Текст песни',
    player_queue: 'Очередь',
    player_volume: 'Звук',
    player_party_host_control: 'Управление у лидера сессии',

    // ListenParty
    party_your_name: 'Как тебя зовут?',
    party_listener_default: 'Слушатель',
    party_paste_code: 'Вставь код от хоста...',
    party_connecting: 'Подключение...',
    party_connected: 'Подключён к сессии',
    party_waiting: 'Ждём слушателей...',
    party_listener_singular: 'слушатель',
    party_listener_plural: 'слушателя',
    party_find_track: 'Найти трек...',

    // Equalizer
    eq_on: 'Вкл',
    eq_off: 'Выкл',
    eq_reset: 'Сбросить',

    // Settings
    settings_title: 'Настройки',
    settings_subtitle: 'Персонализируй Soundwave под себя',
    settings_section_appearance: 'Внешний вид',
    settings_section_auth: 'Авторизация SoundCloud',
    settings_section_obs: 'OBS Widget',
    settings_section_discord: 'Discord Rich Presence',
    settings_section_performance: 'Производительность',
    settings_section_updates: 'Обновления',
    settings_section_language: 'Язык / Language',
    settings_bg_none: 'Нет',
    settings_bg_artwork: 'Артворк',
    settings_bg_color: 'Цвет',
    settings_bg_opacity: 'Прозрачность',
    settings_bg_blur: 'Размытие',
    settings_obs_enabled: 'Включить виджет Now Playing',
    settings_obs_desc: 'Запускает HTTP сервер с виджетом для OBS Browser Source',
    settings_obs_bg_blur: 'Размытие фона',
    settings_obs_overlay_opacity: 'Прозрачность оверлея',
    settings_discord_label: 'Показывать текущий трек в Discord',
    settings_discord_desc: 'Твои друзья увидят, что ты слушаешь, прямо в профиле Discord',
    settings_freeze_hover: 'Стоп анимаций при скролле',
    settings_freeze_hover_desc: 'Замораживает hover-эффекты во время прокрутки. Снижает нагрузку на GPU при скролле',
    settings_perf_mode: 'Режим производительности',
    settings_perf_mode_desc: 'Отключает плавные анимации hover и переходов. Снижает нагрузку на GPU и DWM при наведении мыши',
    settings_check_updates: 'Проверить наличие новой версии',
    settings_checking: 'Проверка…',
    settings_no_updates: 'Обновлений нет',
    settings_update_error: 'Ошибка проверки обновлений',
    settings_language_ru: 'Русский',
    settings_language_en: 'English',

    // ThemeEditor
    theme_editing: 'Редактирование темы',
    theme_name_label: 'Название',
    theme_color_palette: 'Цветовая палитра',
    theme_shape: 'Форма и прозрачность',
    token_background: 'Фон приложения',
    token_surface: 'Карточки, панели',
    token_surface_alt: 'Наведение, выделение',
    token_border: 'Разделители и контуры',
    token_accent: 'Кнопка play, активные элементы',
    token_accent_hover: 'Наведение на акцентные элементы',
    token_text: 'Заголовки, важный текст',
    token_text_muted: 'Подписи, приглушённый текст',

// HomePage sidebar
    home_interesting_artists: 'Интересные артисты',
    home_no_data_sidebar: 'Нет данных',

    // WavePage
wave_title: 'Волна',
    wave_desc: 'Алгоритм проанализирует твои лайки и соберёт персональный поток музыки.',
    wave_now_playing: 'Сейчас в волне',
    wave_loading: 'Подбираю...',
    wave_start: 'Запустить волну',
    wave_auth_title: 'Нужна авторизация',
    wave_auth_desc: 'Войди в аккаунт чтобы запустить Волну',
    wave_no_tracks_title: 'Треки не найдены',
    wave_no_tracks_desc: 'Попробуй добавить больше лайков',

    // SettingsPage
    settings_bg_blur_label: 'Размытие',
    settings_recent_gifs: 'Последние GIF',
    settings_clear_gifs: 'Очистить',
    settings_auth_available: 'Лента, плейлисты и лайки доступны',
    settings_auth_clear: 'Очистить',
    settings_auth_logout: 'Выйти',
    settings_auth_desc: 'Авторизуйся через SoundCloud — токен будет извлечён автоматически.',
    settings_cookies_label: 'Куки из браузера (JSON, опционально)',
    settings_token_label: 'Или вставь токен вручную',
    settings_widget_settings: 'Настройки виджета',
    settings_obs_link_label: 'Ссылка для OBS',
    settings_obs_accent: 'Акцент цвет',
    settings_obs_bg: 'Фон',
    settings_obs_how_title: 'Как добавить в OBS',
    settings_obs_step1: '1. Добавь источник',
    settings_obs_step2: '2. Вставь ссылку в поле URL',
    settings_obs_step3_prefix: '3. Ширина',
    settings_obs_step3_suffix: ', высота',
    settings_obs_step4: '4. Transform → Scale:',
    settings_bg_type: 'Тип фона',
    settings_bg_section: 'Фон приложения',
    settings_bg_none_label: 'Нет',
    settings_bg_artwork_label: 'Артворк',
    settings_bg_color_label: 'Цвет',
    settings_new_theme: 'Новая',

    // ThemeEditor
    theme_new: 'Новая тема',
    theme_sidebar_opacity: 'Прозрачность сайдбара / плеера',
    theme_transparent: 'Прозрачный',
    theme_opaque: 'Непрозрачный',
    theme_border_radius: 'Скругление углов',
    theme_square: 'Квадратные',
    theme_round: 'Круглые',
    token_bg: 'Основной фон',
    token_surface_label: 'Поверхность',
    token_surface_alt_label: 'Поверхность (hover)',
    token_border_label: 'Границы',
    token_text_label: 'Основной текст',
    token_text_dim: 'Вторичный текст',
    token_accent_label: 'Акцент',
    token_accent_hover_label: 'Акцент (hover)',

    // TrackPage
    track_you: 'Вы',
    track_comment_error_msg: 'Не удалось опубликовать комментарий',
    track_related_label: 'Похожие треки',

    // PlaylistPage
    playlist_section: 'Плейлисты',

    // TrendingPage
    trending_title: 'Тренды',
    trending_subtitle: 'Что сейчас слушают по всему миру',
    trending_all: 'Всё',
    trending_error: 'Ошибка',

    // Titlebar
    titlebar_back: 'Назад',
    titlebar_forward: 'Вперед',
    titlebar_minimize: 'Свернуть',
    titlebar_maximize: 'Развернуть',
    titlebar_close: 'Закрыть',

    // Equalizer
    eq_enabled: 'Вкл',
    eq_disabled: 'Выкл',

    // ListenParty
    party_copied: 'Скопировано',
    party_copy: 'Копировать',
    party_status_connecting: 'Подключение...',
    party_status_connect: 'Подключиться',
    party_status_connected: 'Подключён к сессии',
    party_status_waiting_full: 'Ждём слушателей...',

    // Toast/Paste
    toast_opening: 'Открываем ссылку SoundCloud…',
    toast_open_error: 'Не удалось открыть ссылку',

    // AuthGate
    auth_gate_feed: 'Авторизуйся через Настройки → Авторизация, чтобы видеть ленту подписок',

    // LibraryPage subtitle
    library_subtitle: 'Твои плейлисты и альбомы',

    // UserPage auth error
    user_auth_error: 'Требуется авторизация для просмотра профиля',

// PlaylistPage
    playlist_tracks_header: 'Треки',
    playlist_link_copied: 'Ссылка скопирована',

    // TrackPage
    track_comments: 'Комментарии',
    track_me: 'Я',
    track_link_copied: 'Ссылка скопирована',

    // SearchPage
    search_track_count: 'треков',
    search_see_all: 'Смотреть все',

    // FeedPage
    feed_hide_reposts: 'Скрыть репосты',

    // PlayerBar
    player_no_track: 'Нет трека',

    // Sidebar
    nav_navigation: 'Навигация',

    // ListenParty
    party_create_session: 'Создать сессию',
    party_create_desc: 'Ты выбираешь треки · до',
    party_create_listeners: 'слушателей',
    party_join_session: 'Подключиться',
    party_join_desc: 'Введи код сессии от хоста',
    party_getting_code: 'Получаем код...',
    party_lost_connection: 'Соединение потеряно',
    party_connecting_short: 'Подключаемся...',
    party_default_name: 'Слушатель',

    // SettingsPage OBS bg types
    settings_obs_bg_art: 'Арт',
    settings_obs_bg_blur_label: 'Blur OBS',

    // Sidebar likes/history
    home_sidebar_likes: 'Лайки',
    home_sidebar_history: 'История',

    // SettingsPage auth + bg labels
    settings_authorized: 'Авторизован',
    settings_bg_url_label: 'URL изображения / GIF',
    settings_bg_color_label_full: 'CSS цвет или градиент',

    // Date locale
    date_locale: 'ru-RU',

// WavePage header
    wave_header_title: 'Волна',

    // EqualizerPanel
    eq_title: 'Эквалайзер',
    eq_presets: 'Пресеты',

    // ListenPartyModal
    party_title: 'Слушать вместе',
    party_desc: 'До 5 человек слушают синхронно. P2P соединение — треки воспроизводятся независимо.',
    party_session_code_label: 'Код сессии',
    party_listeners_label: 'Слушатели',
    party_suggestions_label: 'Предложения',
    party_your_name_label: 'Твоё имя',
    party_back: 'Назад',
    party_suggest_track: 'Предложить трек хосту',
    party_end_session: 'Завершить сессию',
    party_minutes_ago: 'мин',

    // PlayerBar queue panel
    queue_title: 'Очередь',
    queue_empty: 'Очередь пуста',
    queue_autoplay: 'Автоплей',
    queue_clear: 'Очистить',

    // UserPage follow buttons
    user_unfollow: 'Отписаться',
    user_follow: 'Подписаться',

    // Common actions
    try_again: 'Попробовать снова',
    something_went_wrong: 'Что-то пошло не так',
    tracks_count: 'треков',

    // Content errors
    content_not_found: 'Не удалось найти контент',
    content_unsupported: 'Неподдерживаемый тип контента',
    link_invalid: 'Неверная ссылка или контент недоступен',
    no_stream: 'Нет доступного стрима для этого трека',
  },

  en: {
    // Sidebar nav
    nav_home: 'Home',
    nav_search: 'Search',
    nav_wave: 'Wave',
    nav_feed: 'Feed',
    nav_history: 'History',
    nav_library: 'Library',
    nav_likes: 'Likes',
    nav_profile: 'Profile',
    nav_settings: 'Settings',

    // Common
    loading: 'Loading...',
    error: 'Error',
    error_loading: 'Loading error',
    nothing_found: 'Nothing found',
    show_all: 'Show all',
    collapse: 'Collapse',
    copy: 'Copy',
    copied: 'Copied',
    check: 'Check',
    connect: 'Connect',
    play: 'Play',
    like: 'Like',
    unlike: 'Unlike',
    user: 'User',
    playlist: 'Playlist',
    track: 'Track',

    // Auth
    auth_required: 'Authorization required',
    auth_via_sc: 'Log in with SoundCloud',
    authorizing: 'Logging in...',
    session_cleared: 'Session cleared',
    session_clear_error: 'Error clearing session',

    // HomePage
    home_title: 'Welcome',
    home_subtitle: 'Discover something new today',
    home_recent: 'Recently played',
    home_recommendations: 'More like this',
    home_my_tracks: 'My tracks',
    home_no_data: 'No data',
    home_login_hint: 'Log in to see your personal recommendations',

    // SearchPage
    search_title: 'Search',
    search_subtitle: 'Find any track on SoundCloud',
    search_placeholder: 'Track name, artist, or SoundCloud link...',
    search_start: 'Start typing',
    search_start_hint: 'Enter at least 2 characters to start searching',
    search_error: 'Search error',
    search_empty: 'Nothing found',
    search_invalid_link: 'Invalid SoundCloud link',
    search_tab_all: 'All',
    search_tab_tracks: 'Tracks',
    search_tab_people: 'People',
    search_tab_albums: 'Albums',
    search_tab_playlists: 'Playlists',
    search_section_tracks: 'Tracks',
    search_section_people: 'People',
    search_section_albums: 'Albums',

    // FeedPage
    feed_title: 'Feed',
    feed_subtitle: 'Tracks from people you follow',
    feed_auth_desc: 'Log in to see tracks from your subscriptions',
    feed_empty_title: 'Feed is empty',
    feed_empty_desc: 'Follow artists to see their tracks here',

    // LikesPage
    likes_title: 'Likes',
    likes_subtitle: 'Liked tracks',
    likes_empty_title: 'No liked tracks',
    likes_empty_desc: 'Tap the heart on a track to add it to your likes',

    // LibraryPage
    library_title: 'Library',
    library_auth_title: 'Library',
    library_auth_desc: 'Log in to see your playlists',

    // HistoryPage
    history_title: 'Listening history',
    history_subtitle: 'Your recently played tracks',
    history_auth_title: 'History',
    history_auth_desc: 'Log in via Settings → Authorization to see your listening history',
    history_empty_title: 'History is empty',
    history_empty_desc: 'Start listening to tracks to see them here',

    // UserPage
    user_not_found: 'User not found',
    user_profile_error: 'Failed to load profile',
    user_auth_required: 'Authorization required to view this profile',
    user_follow_error_sub: 'Error unfollowing',
    user_follow_error_follow: 'Error following',
    user_no_content: 'No content here yet',
    user_tab_all: 'All',
    user_tab_popular: 'Popular',
    user_tab_tracks: 'Tracks',
    user_tab_playlists: 'Playlists',
    user_tab_likes: 'Likes',
    user_followers: 'followers',
    user_following: 'following',
    followers_count_1: 'follower',
    followers_count_234: 'followers',
    followers_count_many: 'followers',

    // FollowersPage / FollowingPage
    followers_title: 'Followers',
    following_title: 'Following',
    followers_empty_title: 'No followers',
    followers_empty_desc: 'This user has no followers yet',
    following_empty_title: 'Not following anyone',
    following_empty_desc: 'This user is not following anyone yet',
    following_auth_error: 'Authorization required to view subscriptions',

    // TrackPage
    track_not_found: 'Track not found',
    track_load_error: 'Failed to load track',
    track_comment_placeholder_current: 'Comment at',
    track_comment_placeholder_default: 'Write a comment...',
    track_comment_error: 'Failed to post comment',
    track_related: 'Related tracks',

    // PlaylistPage
    playlist_not_found: 'Playlist not found',
    playlist_load_error: 'Failed to load playlist',
    playlist_empty: 'Playlist is empty',
    playlist_empty_desc: 'This playlist has no tracks yet',

    // WavePage
    wave_queue: 'Queue',
    wave_refresh: 'Refresh wave',
    wave_status_generating: 'Finding your first track...',
    wave_status_scanning: 'Analyzing your taste...',
    wave_status_waiting: 'Waiting...',
    wave_status_based_on: 'Based on',
    wave_status_likes: 'likes',

    // LyricsPage
    lyrics_synced: 'Synced',
    lyrics_unsynced: 'No sync',
    lyrics_instrumental: 'Instrumental track',
    lyrics_not_found: 'Lyrics not found',
    lyrics_no_words: 'This track has no lyrics',
    lyrics_lrclib_error: 'Could not find lyrics for this track on lrclib',

    // PlayerBar
    player_favorites: 'Add to favorites',
    player_shuffle: 'Shuffle',
    player_previous: 'Previous',
    player_pause: 'Pause',
    player_play: 'Play',
    player_next: 'Next',
    player_repeat: 'Repeat',
    player_equalizer: 'Equalizer',
    player_listen_together: 'Listen together',
    player_lyrics: 'Lyrics',
    player_queue: 'Queue',
    player_volume: 'Volume',
    player_party_host_control: 'Controlled by session host',

    // ListenParty
    party_your_name: 'What\'s your name?',
    party_listener_default: 'Listener',
    party_paste_code: 'Paste host code...',
    party_connecting: 'Connecting...',
    party_connected: 'Connected to session',
    party_waiting: 'Waiting for listeners...',
    party_listener_singular: 'listener',
    party_listener_plural: 'listeners',
    party_find_track: 'Find a track...',

    // Equalizer
    eq_on: 'On',
    eq_off: 'Off',
    eq_reset: 'Reset',

    // Settings
    settings_title: 'Settings',
    settings_subtitle: 'Personalize Soundwave to your taste',
    settings_section_appearance: 'Appearance',
    settings_section_auth: 'SoundCloud Authorization',
    settings_section_obs: 'OBS Widget',
    settings_section_discord: 'Discord Rich Presence',
    settings_section_performance: 'Performance',
    settings_section_updates: 'Updates',
    settings_section_language: 'Language / Язык',
    settings_bg_none: 'None',
    settings_bg_artwork: 'Artwork',
    settings_bg_color: 'Color',
    settings_bg_opacity: 'Opacity',
    settings_bg_blur: 'Blur',
    settings_obs_enabled: 'Enable Now Playing widget',
    settings_obs_desc: 'Starts an HTTP server with a widget for OBS Browser Source',
    settings_obs_bg_blur: 'Background blur',
    settings_obs_overlay_opacity: 'Overlay opacity',
    settings_discord_label: 'Show current track in Discord',
    settings_discord_desc: 'Your friends will see what you\'re listening to directly in your Discord profile',
    settings_freeze_hover: 'Freeze animations on scroll',
    settings_freeze_hover_desc: 'Freezes hover effects while scrolling. Reduces GPU load during scroll',
    settings_perf_mode: 'Performance mode',
    settings_perf_mode_desc: 'Disables smooth hover and transition animations. Reduces GPU and DWM load when hovering',
    settings_check_updates: 'Check for updates',
    settings_checking: 'Checking…',
    settings_no_updates: 'No updates available',
    settings_update_error: 'Error checking for updates',
    settings_language_ru: 'Русский',
    settings_language_en: 'English',

    // ThemeEditor
    theme_editing: 'Edit theme',
    theme_name_label: 'Name',
    theme_color_palette: 'Color palette',
    theme_shape: 'Shape & opacity',
    token_background: 'App background',
    token_surface: 'Cards, panels',
    token_surface_alt: 'Hover, selection',
    token_border: 'Dividers & outlines',
    token_accent: 'Play button, active elements',
    token_accent_hover: 'Hover on accent elements',
    token_text: 'Headings, important text',
    token_text_muted: 'Captions, muted text',

// HomePage sidebar
    home_interesting_artists: 'Interesting artists',
    home_no_data_sidebar: 'No data',

    // WavePage
wave_title: 'Wave',
    wave_desc: 'The algorithm will analyze your likes and build a personalized music stream.',
    wave_now_playing: 'Now in wave',
    wave_loading: 'Finding...',
    wave_start: 'Start wave',
    wave_auth_title: 'Authorization required',
    wave_auth_desc: 'Log in to start the Wave',
    wave_no_tracks_title: 'No tracks found',
    wave_no_tracks_desc: 'Try liking more tracks',

    // SettingsPage
    settings_bg_blur_label: 'Blur',
    settings_recent_gifs: 'Recent GIFs',
    settings_clear_gifs: 'Clear',
    settings_auth_available: 'Feed, playlists and likes available',
    settings_auth_clear: 'Clear',
    settings_auth_logout: 'Log out',
    settings_auth_desc: 'Log in via SoundCloud — token will be extracted automatically.',
    settings_cookies_label: 'Browser cookies (JSON, optional)',
    settings_token_label: 'Or paste token manually',
    settings_widget_settings: 'Widget settings',
    settings_obs_link_label: 'OBS link',
    settings_obs_accent: 'Accent color',
    settings_obs_bg: 'Background',
    settings_obs_how_title: 'How to add to OBS',
    settings_obs_step1: '1. Add source',
    settings_obs_step2: '2. Paste the link in the URL field',
    settings_obs_step3_prefix: '3. Width',
    settings_obs_step3_suffix: ', height',
    settings_obs_step4: '4. Transform → Scale:',
    settings_bg_type: 'Background type',
    settings_bg_section: 'App Background',
    settings_bg_none_label: 'None',
    settings_bg_artwork_label: 'Artwork',
    settings_bg_color_label: 'Color',
    settings_new_theme: 'New',

    // ThemeEditor
    theme_new: 'New theme',
    theme_sidebar_opacity: 'Sidebar / player opacity',
    theme_transparent: 'Transparent',
    theme_opaque: 'Opaque',
    theme_border_radius: 'Border radius',
    theme_square: 'Square',
    theme_round: 'Round',
    token_bg: 'App background',
    token_surface_label: 'Surface',
    token_surface_alt_label: 'Surface (hover)',
    token_border_label: 'Borders',
    token_text_label: 'Primary text',
    token_text_dim: 'Secondary text',
    token_accent_label: 'Accent',
    token_accent_hover_label: 'Accent (hover)',

    // TrackPage
    track_you: 'You',
    track_comment_error_msg: 'Failed to post comment',
    track_related_label: 'Related tracks',

    // PlaylistPage
    playlist_section: 'Playlists',

    // TrendingPage
    trending_title: 'Trending',
    trending_subtitle: 'What the world is listening to right now',
    trending_all: 'All',
    trending_error: 'Error',

    // Titlebar
    titlebar_back: 'Back',
    titlebar_forward: 'Forward',
    titlebar_minimize: 'Minimize',
    titlebar_maximize: 'Maximize',
    titlebar_close: 'Close',

    // Equalizer
    eq_enabled: 'On',
    eq_disabled: 'Off',

    // ListenParty
    party_copied: 'Copied',
    party_copy: 'Copy',
    party_status_connecting: 'Connecting...',
    party_status_connect: 'Connect',
    party_status_connected: 'Connected to session',
    party_status_waiting_full: 'Waiting for listeners...',

    // Toast/Paste
    toast_opening: 'Opening SoundCloud link…',
    toast_open_error: 'Failed to open link',

    // AuthGate
    auth_gate_feed: 'Log in via Settings → Authorization to see your feed',

    // LibraryPage subtitle
    library_subtitle: 'Your playlists and albums',

    // UserPage auth error
    user_auth_error: 'Authorization required to view profile',

// PlaylistPage
    playlist_tracks_header: 'Tracks',
    playlist_link_copied: 'Link copied',

    // TrackPage
    track_comments: 'Comments',
    track_me: 'Me',
    track_link_copied: 'Link copied',

    // SearchPage
    search_track_count: 'tracks',
    search_see_all: 'See all',

    // FeedPage
    feed_hide_reposts: 'Hide reposts',

    // PlayerBar
    player_no_track: 'No track',

    // Sidebar
    nav_navigation: 'Navigation',

    // ListenParty
    party_create_session: 'Create session',
    party_create_desc: 'You choose tracks · up to',
    party_create_listeners: 'listeners',
    party_join_session: 'Join',
    party_join_desc: 'Enter the host session code',
    party_getting_code: 'Getting code...',
    party_lost_connection: 'Connection lost',
    party_connecting_short: 'Connecting...',
    party_default_name: 'Listener',

    // SettingsPage OBS bg types
    settings_obs_bg_art: 'Art',
    settings_obs_bg_blur_label: 'Blur OBS',

    // Sidebar likes/history
    home_sidebar_likes: 'Likes',
    home_sidebar_history: 'History',

    // SettingsPage auth + bg labels
    settings_authorized: 'Authorized',
    settings_bg_url_label: 'Image URL / GIF',
    settings_bg_color_label_full: 'CSS color or gradient',

    // Date locale
    date_locale: 'en-US',

// WavePage header
    wave_header_title: 'Wave',

    // EqualizerPanel
    eq_title: 'Equalizer',
    eq_presets: 'Presets',

    // ListenPartyModal
    party_title: 'Listen together',
    party_desc: 'Up to 5 people listen in sync. P2P — tracks play independently.',
    party_session_code_label: 'Session code',
    party_listeners_label: 'Listeners',
    party_suggestions_label: 'Suggestions',
    party_your_name_label: 'Your name',
    party_back: 'Back',
    party_suggest_track: 'Suggest track to host',
    party_end_session: 'End session',
    party_minutes_ago: 'min',

    // PlayerBar queue panel
    queue_title: 'Queue',
    queue_empty: 'Queue is empty',
    queue_autoplay: 'Autoplay',
    queue_clear: 'Clear',

    // UserPage follow buttons
    user_unfollow: 'Unfollow',
    user_follow: 'Follow',

    // Common actions
    try_again: 'Try again',
    something_went_wrong: 'Something went wrong',
    tracks_count: 'tracks',

    // Content errors
    content_not_found: 'Content not found',
    content_unsupported: 'Unsupported content type',
    link_invalid: 'Invalid link or content unavailable',
    no_stream: 'No stream available for this track',
  },
} as const;

export type TranslationKey = keyof typeof translations.ru;
export type Translations = typeof translations.ru;

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LANG_STORAGE_KEY = 'soundwave_language';

function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {}
  return 'ru';
}

export const useI18nStore = create<I18nState>((set, get) => ({
  language: loadLanguage(),

  setLanguage: (lang: Language) => {
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {}
    set({ language: lang });
  },

  t: (key: TranslationKey) => {
    const lang = get().language;
    return (translations[lang] as Translations)[key] ?? (translations.ru as Translations)[key] ?? key;
  },
}));

// useT подписывается на language явно — это гарантирует перерендер всех компонентов
// при смене языка, даже если сама функция t остаётся тем же объектом
export function useT() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _lang = useI18nStore((s) => s.language); // триггер перерендера
  return useI18nStore((s) => s.t);
}
