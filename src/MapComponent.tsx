import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EarthquakeFeature } from './USGSService';

// Fix for default Leaflet marker icon in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icon for earthquakes based on magnitude
const getQuakeIcon = (magnitude: number) => {
  const color = magnitude >= 5 ? 'red' : magnitude >= 3 ? 'orange' : 'green';
  const size = Math.max(10, magnitude * 4);
  
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; opacity: 0.7; border: 2px solid white;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

interface MapComponentProps {
  earthquakes: EarthquakeFeature[];
  userLocation: { lat: number; lng: number } | null;
}

// Component to recenter map when user location changes
const RecenterMap = ({ lat, lng }: { lat: number, lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
};

export default function MapComponent({ earthquakes, userLocation }: MapComponentProps) {
  const defaultCenter: [number, number] = [0, 0];
  const defaultZoom = 2;

  return (
    <div style={{ height: '300px', width: '100%', borderRadius: '8px', overflow: 'hidden', marginTop: '1rem', border: '1px solid #333' }}>
      <MapContainer center={userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter} zoom={userLocation ? 5 : defaultZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {userLocation && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>Tu ubicación actual</Popup>
            </Marker>
            <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
          </>
        )}

        {earthquakes.map((quake) => {
          const [lng, lat] = quake.geometry.coordinates;
          return (
            <Marker 
              key={quake.id} 
              position={[lat, lng]} 
              icon={getQuakeIcon(quake.properties.mag)}
            >
              <Popup>
                <strong>{quake.properties.title}</strong><br/>
                Magnitud: {quake.properties.mag}<br/>
                Profundidad: {quake.geometry.coordinates[2]} km<br/>
                <a href={quake.properties.url} target="_blank" rel="noreferrer">Más detalles</a>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
