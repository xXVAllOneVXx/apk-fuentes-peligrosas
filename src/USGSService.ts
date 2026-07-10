export interface EarthquakeFeature {
  type: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    url: string;
    detail: string;
    status: string;
    tsunami: number;
    sig: number;
    net: string;
    code: string;
    title: string;
  };
  geometry: {
    type: string;
    coordinates: number[];
  };
  id: string;
}

export class USGSService {
  static async getRecentEarthquakes(): Promise<EarthquakeFeature[]> {
    try {
      // Fetch all earthquakes from the past hour
      const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');
      const data = await response.json();
      return data.features;
    } catch (error) {
      console.error("Error fetching earthquake data:", error);
      return [];
    }
  }

  static async getSignificantEarthquakes(): Promise<EarthquakeFeature[]> {
    try {
      // Fetch significant earthquakes from the past month
      const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson');
      const data = await response.json();
      return data.features;
    } catch (error) {
      console.error("Error fetching significant earthquakes:", error);
      return [];
    }
  }
}
