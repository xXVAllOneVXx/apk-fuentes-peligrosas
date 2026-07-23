import { XMLParser } from 'fast-xml-parser';

export interface GlobalAlert {
  id: string;
  title: string;
  timestamp: number;
  type: 'earthquake' | 'tsunami' | 'news' | 'disaster' | 'terror';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  coordinates?: { lat: number; lng: number };
}

export class GlobalAlertsService {
  // USGS API for recent earthquakes in the past hour (real-time updates)
  private static readonly USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';

  // GDACS API (Global Disaster Alert and Coordination System) via RSS Feed
  private static readonly GDACS_RSS_URL = 'https://www.gdacs.org/xml/rss.xml';

  /**
   * Fetches the latest global alerts from public APIs
   */
  static async fetchLatestAlerts(): Promise<GlobalAlert[]> {
    try {
      const [usgsAlerts, gdacsAlerts] = await Promise.allSettled([
        this.fetchUSGS(),
        this.fetchGDACS()
      ]);

      let combined: GlobalAlert[] = [];

      if (usgsAlerts.status === 'fulfilled') {
        combined = [...combined, ...usgsAlerts.value];
      }

      if (gdacsAlerts.status === 'fulfilled') {
        combined = [...combined, ...gdacsAlerts.value];
      }

      // Sort by timestamp descending
      return combined.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.error('Error fetching global alerts:', error);
      // Return mock data for testing if offline or API fails
      return [
        {
          id: 'mock-1',
          title: 'Conexión a internet inestable',
          timestamp: Date.now(),
          type: 'news',
          severity: 'low',
          details: 'No se pudieron descargar las alertas globales más recientes. Mostrando solo sensores locales.'
        }
      ];
    }
  }

  private static async fetchUSGS(): Promise<GlobalAlert[]> {
    const response = await fetch(this.USGS_API_URL);
    if (!response.ok) throw new Error(`USGS Error: ${response.status}`);
    const data = await response.json();
    return this.parseUSGSData(data);
  }

  private static async fetchGDACS(): Promise<GlobalAlert[]> {
    // Some browsers block cross-origin RSS, in production this should be routed through an AWS Lambda/Backend
    const response = await fetch(this.GDACS_RSS_URL);
    if (!response.ok) throw new Error(`GDACS Error: ${response.status}`);
    const xmlText = await response.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonObj = parser.parse(xmlText);

    return this.parseGDACSData(jsonObj);
  }

  private static parseGDACSData(data: any): GlobalAlert[] {
    const alerts: GlobalAlert[] = [];

    if (!data?.rss?.channel?.item) return alerts;

    const items = Array.isArray(data.rss.channel.item) ? data.rss.channel.item : [data.rss.channel.item];

    for (const item of items) {
      const title = item.title || 'Alerta Global Desconocida';
      const desc = item.description || '';

      let severity: GlobalAlert['severity'] = 'low';
      let type: GlobalAlert['type'] = 'disaster';

      const titleLower = title.toLowerCase();

      // Determine severity based on GDACS alert levels (Orange/Red)
      if (titleLower.includes('red alert')) {
        severity = 'critical';
      } else if (titleLower.includes('orange alert')) {
        severity = 'high';
      } else if (titleLower.includes('green alert')) {
        severity = 'low';
      }

      // Determine type
      if (titleLower.includes('tsunami')) {
        type = 'tsunami';
      } else if (titleLower.includes('earthquake')) {
        type = 'earthquake';
      } else if (titleLower.includes('volcano') || titleLower.includes('cyclone') || titleLower.includes('flood')) {
        type = 'disaster';
      } else if (titleLower.includes('terror') || titleLower.includes('attack') || titleLower.includes('shooting')) {
        type = 'terror';
      } else {
        type = 'news';
      }

      // Try to parse coordinates if available in GDACS (often in geo:Point or similar)
      let coords: { lat: number, lng: number } | undefined = undefined;
      if (item['geo:Point'] && item['geo:Point']['geo:lat'] && item['geo:Point']['geo:long']) {
         coords = {
           lat: parseFloat(item['geo:Point']['geo:lat']),
           lng: parseFloat(item['geo:Point']['geo:long'])
         };
      }

      alerts.push({
        id: `gdacs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        timestamp: new Date(item.pubDate || Date.now()).getTime(),
        type: type,
        severity: severity,
        details: desc.replace(/(<([^>]+)>)/gi, "").substring(0, 150) + '...', // Strip HTML from RSS descriptions
        coordinates: coords
      });
    }

    return alerts;
  }

  private static parseUSGSData(data: any): GlobalAlert[] {
    if (!data.features || !Array.isArray(data.features)) {
      return [];
    }

    return data.features.map((feature: any) => {
      const mag = feature.properties.mag;
      let severity: GlobalAlert['severity'] = 'low';
      let type: GlobalAlert['type'] = 'earthquake';

      if (mag >= 7.0) severity = 'critical';
      else if (mag >= 6.0) severity = 'high';
      else if (mag >= 5.0) severity = 'medium';

      // USGS sometimes flags potential tsunamis
      if (feature.properties.tsunami === 1) {
        type = 'tsunami';
        severity = 'critical'; // Elevate severity if tsunami warning
      }

      const geometry = feature.geometry;
      let coords: { lat: number, lng: number } | undefined = undefined;
      // GeoJSON points are [longitude, latitude]
      if (geometry && geometry.type === 'Point' && geometry.coordinates.length >= 2) {
        coords = {
          lat: geometry.coordinates[1],
          lng: geometry.coordinates[0]
        };
      }

      return {
        id: feature.id,
        title: feature.properties.title,
        timestamp: feature.properties.time,
        type: type,
        severity: severity,
        details: `Magnitud: ${mag}. Localización: ${feature.properties.place}.`,
        coordinates: coords
      };
    });
  }
}
