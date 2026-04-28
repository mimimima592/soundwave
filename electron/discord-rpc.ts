import { Client, Presence } from 'discord-rpc';

// ВАЖНО: это placeholder Client ID. Чтобы Discord RPC заработал:
// 1. Зайти на https://discord.com/developers/applications
// 2. Создать приложение "Soundwave"
// 3. Во вкладке Rich Presence -> Art Assets загрузить иконки:
//    - "logo" (main icon)
//    - "play" и "pause" (small icons)
// 4. Скопировать Application ID сюда
const DISCORD_CLIENT_ID = '1495879499999481876';

export interface RPCData {
  title: string;
  artist: string;
  artwork?: string;
  duration?: number; // в секундах
  startedAt?: number; // unix ms (когда трек начал играть)
  trackUrl?: string;
  isPlaying: boolean;
}

export class DiscordRPCManager {
  private client: Client | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastPresence: RPCData | null = null;
  private intentionalDisconnect = false;

  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    if (this.isConnected) return;

    try {
      this.client = new Client({ transport: 'ipc' });

      this.client.on('ready', () => {
        this.isConnected = true;
        // Если перед этим был presence — восстанавливаем
        if (this.lastPresence) this.updatePresence(this.lastPresence);
      });

      this.client.on('disconnected', () => {
        this.isConnected = false;
        this.scheduleReconnect();
      });

      await this.client.login({ clientId: DISCORD_CLIENT_ID });
    } catch (err) {
      this.isConnected = false;
      this.client = null;
      console.error('[Discord RPC] Connection failed:', err);
      this.scheduleReconnect();
      throw err;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.intentionalDisconnect) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 15_000);
  }

  async updatePresence(data: RPCData): Promise<boolean> {
    if (this.intentionalDisconnect) return false;
    this.lastPresence = data;

    if (!this.isConnected || !this.client) {
      this.connect().catch(() => {});
      return false;
    }

    try {
      const presence: Presence = {
        details: this.truncate(data.title, 128),
        state: this.truncate(`by ${data.artist}`, 128),
        largeImageKey: data.artwork,
        largeImageText: data.isPlaying ? 'Playing' : 'Paused',
        smallImageKey: data.isPlaying ? 'play' : 'pause',
        smallImageText: data.isPlaying ? 'Listening' : 'Paused',
        instance: false,
      };

      // Показать прогресс-бар в Discord всегда (и при паузе тоже)
      // startedAt приходит в миллисекундах, Discord ожидает секунды
      if (data.startedAt && data.duration) {
        presence.startTimestamp = Math.floor(data.startedAt / 1000);
        presence.endTimestamp = Math.floor(data.startedAt / 1000) + data.duration;
      }
      // При паузе timeline будет показывать текущую позицию, но не двигаться
      // т.к. мы не обновляем timestamps постоянно

      if (data.trackUrl) {
        presence.buttons = [
          { label: 'Listen on SoundCloud', url: data.trackUrl },
        ];
      }

      // Патчим transport.send прямо перед отправкой, чтобы вшить type: 2
      // в уже сформированный IPC-payload. Обычный (presence as any).type = 2
      // не работает — discord-rpc выбрасывает кастомные поля при сериализации.
      const transport = (this.client as any).transport;
      const originalSend = transport.send.bind(transport);
      transport.send = (packet: any) => {
        if (packet?.args?.activity) {
          packet.args.activity.type = 2;
        }
        return originalSend(packet);
      };

      await this.client.setActivity(presence);

      // Восстанавливаем оригинальный метод после отправки
      transport.send = originalSend;

      return true;
    } catch (err) {
      // Восстанавливаем на случай ошибки
      const transport = (this.client as any)?.transport;
      if (transport?._originalSend) {
        transport.send = transport._originalSend;
      }
      console.error('[Discord RPC] Failed to update presence:', err);
      return false;
    }
  }

  async clearPresence(): Promise<void> {
    this.lastPresence = null;
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.clearActivity();
    } catch {
      // connection already closing — ignore
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.lastPresence = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      if (this.isConnected) {
        // Await clearActivity BEFORE destroy so the request completes
        try {
          await this.client.clearActivity();
        } catch {
          // ignore
        }
      }
      this.isConnected = false;
      try {
        this.client.destroy();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  private truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }
}
