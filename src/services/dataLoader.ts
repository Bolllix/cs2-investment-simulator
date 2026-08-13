import { CaseMeta, DailyPrice } from '../types/simulator';

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3,
  May: 4, Jun: 5, Jul: 6, Aug: 7,
  Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

export function parseRawDate(rawStr: string): { dateStr: string; timestamp: number } | null {
  // Example format: "Aug 14 2013 01: +0"
  const parts = rawStr.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const mon = parts[0];
  const day = parts[1].padStart(2, '0');
  const year = parts[2];

  const monthNum = MONTH_MAP[mon];
  const monthIdx = MONTH_INDEX[mon];

  if (!monthNum || monthIdx === undefined || isNaN(Number(year)) || isNaN(Number(day))) {
    return null;
  }

  const dateStr = `${year}-${monthNum}-${day}`;
  const timestamp = Date.UTC(Number(year), monthIdx, Number(day));
  return { dateStr, timestamp };
}

export class DataLoader {
  private static casesCache: CaseMeta[] | null = null;
  private static globalTimelineCache: string[] | null = null;

  public static async loadAllCases(): Promise<CaseMeta[]> {
    if (this.casesCache) {
      return this.casesCache;
    }

    const cases: CaseMeta[] = [];
    
    // Import all JSON files using Vite's glob import
    const jsonModules = import.meta.glob('/json/*.json', { eager: true }) as Record<string, any>;

    for (const path in jsonModules) {
      const moduleData = jsonModules[path]?.default || jsonModules[path];
      if (!moduleData || !moduleData.prices || !Array.isArray(moduleData.prices)) {
        continue;
      }

      // Extract filename and name
      // Path format example: "/json/1. CSGO Weapon Case.json"
      const filename = path.split('/').pop() || path;
      const cleanName = filename.replace(/\.json$/i, '');
      
      // Match leading order number if present
      const match = cleanName.match(/^(\d+)\.\s*(.+)$/);
      const orderNumber = match ? parseInt(match[1], 10) : 999;
      const name = match ? match[2] : cleanName;

      // Group raw prices by date (average price per day)
      const dailyMap = new Map<string, { timestamp: number; prices: number[]; volumes: number[] }>();

      for (const entry of moduleData.prices) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const dateParsed = parseRawDate(entry[0]);
        if (!dateParsed) continue;

        const price = typeof entry[1] === 'number' ? entry[1] : parseFloat(entry[1]);
        const volume = entry[2] ? parseInt(entry[2], 10) : 0;

        if (isNaN(price)) continue;

        const existing = dailyMap.get(dateParsed.dateStr);
        if (existing) {
          existing.prices.push(price);
          if (!isNaN(volume)) existing.volumes.push(volume);
        } else {
          dailyMap.set(dateParsed.dateStr, {
            timestamp: dateParsed.timestamp,
            prices: [price],
            volumes: isNaN(volume) ? [0] : [volume]
          });
        }
      }

      const dailyPrices: DailyPrice[] = [];
      let minPrice = Infinity;
      let maxPrice = -Infinity;

      // Convert map to sorted array
      const sortedDates = Array.from(dailyMap.keys()).sort();
      for (const dateStr of sortedDates) {
        const item = dailyMap.get(dateStr)!;
        const avgPrice = item.prices.reduce((a, b) => a + b, 0) / item.prices.length;
        const avgVolume = item.volumes.length > 0 ? Math.round(item.volumes.reduce((a, b) => a + b, 0) / item.volumes.length) : 0;

        if (avgPrice < minPrice) minPrice = avgPrice;
        if (avgPrice > maxPrice) maxPrice = avgPrice;

        dailyPrices.push({
          dateStr,
          timestamp: item.timestamp,
          price: parseFloat(avgPrice.toFixed(4)),
          volume: avgVolume
        });
      }

      if (dailyPrices.length > 0) {
        cases.push({
          id: cleanName,
          filename,
          name,
          orderNumber,
          dailyPrices,
          minPrice: minPrice === Infinity ? 0 : minPrice,
          maxPrice: maxPrice === -Infinity ? 0 : maxPrice,
          currentPrice: dailyPrices[dailyPrices.length - 1].price,
          firstDateStr: dailyPrices[0].dateStr,
          lastDateStr: dailyPrices[dailyPrices.length - 1].dateStr
        });
      }
    }

    // Sort cases by order number or name
    cases.sort((a, b) => a.orderNumber - b.orderNumber);
    this.casesCache = cases;
    return cases;
  }

  public static getGlobalTimeline(cases: CaseMeta[]): string[] {
    if (this.globalTimelineCache) return this.globalTimelineCache;

    const dateSet = new Set<string>();
    for (const c of cases) {
      for (const p of c.dailyPrices) {
        dateSet.add(p.dateStr);
      }
    }

    const sortedTimeline = Array.from(dateSet).sort();
    this.globalTimelineCache = sortedTimeline;
    return sortedTimeline;
  }
}
