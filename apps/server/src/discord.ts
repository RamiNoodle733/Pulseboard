import { config } from './env.js';

type EventType = 'user_join' | 'user_leave' | 'streak_milestone' | 'streak_record';

interface UserMeta {
  ordinal: number;
  color: string;
  ip: string;
  userAgent: string;
  userCount: number;
  extra?: Record<string, string | number>;
}

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  color: number;
  fields: EmbedField[];
  timestamp: string;
  footer: { text: string };
}

function hexToDecimal(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function parseUA(ua: string): string {
  if (!ua || ua === 'unknown') return 'unknown';

  let browser = 'unknown';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

const EVENT_CONFIG: Record<EventType, { title: string; color: number }> = {
  user_join: { title: 'user joined', color: 0x00ff41 },
  user_leave: { title: 'user left', color: 0x666666 },
  streak_milestone: { title: 'streak milestone', color: 0xffb000 },
  streak_record: { title: 'new streak record', color: 0xffd700 },
};

function buildEmbed(event: EventType, meta: UserMeta): DiscordEmbed {
  const { title, color } = EVENT_CONFIG[event];

  const fields: EmbedField[] = [
    { name: 'user', value: `User${meta.ordinal}`, inline: true },
    { name: 'color', value: meta.color, inline: true },
    { name: 'online', value: String(meta.userCount), inline: true },
  ];

  if (meta.ip && meta.ip !== 'unknown') {
    fields.push({ name: 'ip', value: meta.ip, inline: true });
  }

  if (meta.userAgent && meta.userAgent !== 'unknown') {
    fields.push({ name: 'device', value: parseUA(meta.userAgent), inline: true });
  }

  if (meta.extra) {
    for (const [key, value] of Object.entries(meta.extra)) {
      fields.push({ name: key, value: String(value), inline: true });
    }
  }

  return {
    title,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'pulseboard' },
  };
}

export async function notifyDiscord(event: EventType, meta: UserMeta): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const embed = buildEmbed(event, meta);

  try {
    await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err: unknown) {
    console.error('[discord] webhook failed:', err);
  }
}
