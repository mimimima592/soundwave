import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

interface SettingsSchema {
  activeTheme: string;
  customThemes: Record<string, unknown>;
  backgroundType: 'none' | 'gif' | 'color' | 'artwork';
  backgroundUrl: string;
  backgroundBlur: number;
  backgroundOpacity: number;
  volume: number;
  lastTrackId: number | null;
  soundCloudClientId: string | null;
  discordRpcEnabled: boolean;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = ['oauthToken'] as const;
type SensitiveKey = typeof SENSITIVE_KEYS[number];

const defaults: Partial<SettingsSchema> = {
  activeTheme: 'midnight',
  customThemes: {},
  backgroundType: 'none',
  backgroundUrl: '',
  backgroundBlur: 20,
  backgroundOpacity: 0.4,
  volume: 0.7,
  lastTrackId: null,
  discordRpcEnabled: true,
  soundCloudClientId: null,
};

export class SettingsStore {
  private store: Store<SettingsSchema>;
  private sensitiveDir: string;

  constructor() {
    // Миграция: если существует старый стор зашифрованный hardcoded ключом —
    // читаем его, переносим данные в новый формат и удаляем старый файл.
    this.migrateFromEncryptedStore();

    this.store = new Store<SettingsSchema>({
      name: 'soundwave-settings',
      defaults: defaults as SettingsSchema,
      // Без encryptionKey — чувствительные данные теперь в safeStorage отдельно
    });

    this.sensitiveDir = path.join(app.getPath('userData'), 'secure');
    if (!fs.existsSync(this.sensitiveDir)) {
      fs.mkdirSync(this.sensitiveDir, { recursive: true });
    }

    // Если после миграции в сторе лежит oauthToken в открытом виде — перенести в safeStorage
    this.migrateSensitiveFromStore();
  }

  // Читаем старый зашифрованный файл и сохраняем данные в новый незашифрованный стор.
  // electron-store при encryptionKey использует aes-256-cbc с pbkdf2-ключом из строки.
  private migrateFromEncryptedStore(): void {
    const oldStorePath = path.join(app.getPath('userData'), 'soundwave-settings.json');
    if (!fs.existsSync(oldStorePath)) return;

    try {
      // Пробуем прочитать как обычный JSON — если уже мигрировали, всё ок
      const raw = fs.readFileSync(oldStorePath, 'utf-8');
      JSON.parse(raw);
      // Парсится нормально — миграция не нужна
    } catch {
      // Файл зашифрован старым ключом — читаем через electron-store с тем же ключом
      try {
        const oldStore = new Store<SettingsSchema>({
          name: 'soundwave-settings',
          encryptionKey: 'soundwave-v1-default-key-replace-me',
        });

        const oldData = oldStore.store;
        console.log('[SettingsStore] Migrating from encrypted store, keys:', Object.keys(oldData));

        // Удаляем старый зашифрованный файл
        fs.unlinkSync(oldStorePath);

        // Создаём новый незашифрованный стор и записываем данные
        const newStore = new Store<SettingsSchema>({
          name: 'soundwave-settings',
          defaults: defaults as SettingsSchema,
        });

        for (const [key, value] of Object.entries(oldData)) {
          if (value !== undefined && value !== null) {
            newStore.set(key, value);
          }
        }

        console.log('[SettingsStore] Migration complete');
      } catch (err) {
        // Старый файл повреждён или ключ не тот — просто удаляем его
        console.error('[SettingsStore] Migration failed, deleting corrupted store:', err);
        try { fs.unlinkSync(oldStorePath); } catch {}
      }
    }
  }

  // Если oauthToken попал в обычный стор (до safeStorage) — переносим в safeStorage
  private migrateSensitiveFromStore(): void {
    try {
      const token = this.store.get('oauthToken' as any) as string | null;
      if (token && typeof token === 'string') {
        console.log('[SettingsStore] Migrating oauthToken to safeStorage');
        this.writeSensitive('oauthToken', token);
        this.store.delete('oauthToken' as never);
      }
    } catch (err) {
      console.error('[SettingsStore] Failed to migrate oauthToken:', err);
    }
  }

  private isSensitive(key: string): key is SensitiveKey {
    return (SENSITIVE_KEYS as readonly string[]).includes(key);
  }

  private sensitiveFilePath(key: SensitiveKey): string {
    return path.join(this.sensitiveDir, `${key}.enc`);
  }

  private readSensitive(key: SensitiveKey): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback — читаем из обычного стора (незашифрованный)
        return this.store.get(key as any) as string | null ?? null;
      }
      const filePath = this.sensitiveFilePath(key);
      if (!fs.existsSync(filePath)) return null;
      const encrypted = fs.readFileSync(filePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  }

  private writeSensitive(key: SensitiveKey, value: string | null): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback — пишем в обычный стор
        if (value === null) this.store.delete(key as never);
        else this.store.set(key, value);
        return;
      }
      const filePath = this.sensitiveFilePath(key);
      if (value === null) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return;
      }
      const encrypted = safeStorage.encryptString(value);
      fs.writeFileSync(filePath, encrypted);
    } catch (err) {
      console.error(`[SettingsStore] Failed to write sensitive key "${key}":`, err);
    }
  }

  get<K extends string>(key: K): unknown {
    if (this.isSensitive(key)) return this.readSensitive(key);
    return this.store.get(key);
  }

  set(key: string, value: unknown): void {
    if (this.isSensitive(key)) {
      this.writeSensitive(key, value as string | null);
      return;
    }
    this.store.set(key, value);
  }

  getAll(): Record<string, unknown> {
    const all: Record<string, unknown> = { ...this.store.store };
    for (const key of SENSITIVE_KEYS) {
      delete all[key];
    }
    return all;
  }

  delete(key: string): void {
    if (this.isSensitive(key)) {
      this.writeSensitive(key, null);
      return;
    }
    this.store.delete(key as never);
  }
}
