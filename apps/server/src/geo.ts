export interface GeoResult {
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

const cache = new Map<string, GeoResult>();
const EMPTY: GeoResult = { city: '', region: '', country: '', lat: 0, lon: 0 };

const PRIVATE_IP = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|localhost|0\.0\.0\.0)/;

let requestCount = 0;
let windowStart = Date.now();

export async function resolveLocation(ip: string): Promise<GeoResult> {
  if (!ip || PRIVATE_IP.test(ip)) return EMPTY;

  const cached = cache.get(ip);
  if (cached) return cached;

  // ip-api.com allows 45 requests per minute
  const now = Date.now();
  if (now - windowStart > 60_000) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= 40) return EMPTY;

  try {
    requestCount++;
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=city,regionName,countryCode,lat,lon`,
    );
    if (!res.ok) return EMPTY;

    const data = await res.json() as { city?: string; regionName?: string; countryCode?: string; lat?: number; lon?: number };
    const result: GeoResult = {
      city: data.city || '',
      region: data.regionName || '',
      country: data.countryCode || '',
      lat: data.lat || 0,
      lon: data.lon || 0,
    };
    cache.set(ip, result);
    return result;
  } catch {
    return EMPTY;
  }
}

export function formatRegion(geo: GeoResult): string {
  if (!geo.country) return '';
  if (geo.city) return `${geo.city}, ${geo.country}`;
  if (geo.region) return `${geo.region}, ${geo.country}`;
  return geo.country;
}
