export interface GlobalAlert {
  id: string;
  title: string;
  timestamp: number;
  type: 'earthquake' | 'tsunami' | 'news';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

export class GlobalAlertsService {
  // USGS API for significant earthquakes in the past month
  private static readonly USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson';

  /**
   * Fetches the latest global alerts from public APIs
   */
  static async fetchLatestAlerts(): Promise<GlobalAlert[]> {
    try {
      const response = await fetch(this.USGS_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch USGS data: ${response.status}`);
      }

      const data = await response.json();
      return this.parseUSGSData(data);
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

      return {
        id: feature.id,
        title: feature.properties.title,
        timestamp: feature.properties.time,
        type: type,
        severity: severity,
        details: `Magnitud: ${mag}. Localización: ${feature.properties.place}.`
      };
    });
  }
}
