import { useState, useEffect, useRef } from 'react';
import { Motion } from '@capacitor/motion';
import { AudioAnalyzer } from './AudioAnalyzer';
import './App.css';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sensorsActive, setSensorsActive] = useState(false);

  const [motionData, setMotionData] = useState({ x: 0, y: 0, z: 0 });
  const [earthquakeAlert, setEarthquakeAlert] = useState(false);
  const [audioAlert, setAudioAlert] = useState(false);

  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);

  // Umbral de aceleración para detectar sismo
  const THRESHOLD = 12.0;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      Motion.removeAllListeners();
      if (audioAnalyzerRef.current) {
        audioAnalyzerRef.current.stopListening();
      }
    };
  }, []);

  const toggleSensors = async () => {
    if (sensorsActive) {
      // Apagar Acelerómetro
      await Motion.removeAllListeners();
      setMotionData({ x: 0, y: 0, z: 0 });
      setEarthquakeAlert(false);

      // Apagar Micrófono
      if (audioAnalyzerRef.current) {
        audioAnalyzerRef.current.stopListening();
      }
      setAudioAlert(false);

      setSensorsActive(false);
    } else {
      try {
        // Iniciar Acelerómetro
        await Motion.addListener('accel', (event) => {
          const x = event.acceleration.x || 0;
          const y = event.acceleration.y || 0;
          const z = event.acceleration.z || 0;

          setMotionData({ x, y, z });

          // Si la aceleración supera el umbral en cualquier eje, disparamos alerta
          if (Math.abs(x) > THRESHOLD || Math.abs(y) > THRESHOLD || Math.abs(z) > THRESHOLD) {
            setEarthquakeAlert(true);
            setTimeout(() => setEarthquakeAlert(false), 3000); // Resetear alerta después de 3s
          }
        });

        // Iniciar Micrófono
        const analyzer = new AudioAnalyzer((volume) => {
          console.log("Ruido extremo detectado, RMS:", volume);
          setAudioAlert(true);
          setTimeout(() => setAudioAlert(false), 3000);
        });

        const audioStarted = await analyzer.startListening();
        if (audioStarted) {
          audioAnalyzerRef.current = analyzer;
        } else {
          alert("No se pudo acceder al micrófono. Por favor revisa los permisos.");
        }

        setSensorsActive(true);
      } catch (e) {
        console.error("Error al iniciar sensores", e);
        alert("Ocurrió un error al iniciar los sensores. " + (e as Error).message);
      }
    }
  };

  const hasAlert = earthquakeAlert || audioAlert;

  return (
    <div className="app-container">
      <header className="header">
        <h1>AlertApp</h1>
        <p>Sistema de Alerta Temprana Descentralizado</p>
      </header>

      <div className="status-card" style={{ backgroundColor: hasAlert ? '#4a1111' : '#1e1e1e' }}>
        <h2>Estado Global</h2>
        <div className="status-indicator">
          <div className={`status-dot ${hasAlert ? 'danger' : 'safe'}`}></div>
          <span className="status-text">
            {earthquakeAlert ? '¡ALERTA DE SISMO (LOCAL)!' : audioAlert ? '¡ALERTA AUDIO EXTREMO!' : 'Seguro - Monitoreando'}
          </span>
        </div>
        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: isOnline ? '#34c759' : '#ffcc00' }}>
          {isOnline ? '🟢 Conectado a la red' : '🟡 Modo Offline (Usando red local/Bluetooth)'}
        </p>
      </div>

      <h3 style={{ width: '100%', textAlign: 'left', marginBottom: '10px' }}>Sensores Locales</h3>

      <div className="sensor-grid">
        <div className="sensor-item" style={{ backgroundColor: sensorsActive ? '#1c2c1c' : '#2c2c2e' }}>
          <span className="label">Acelerómetro (Sismos)</span>
          <span className="value">{sensorsActive ? 'Activo' : 'Inactivo'}</span>
          {sensorsActive && (
            <div style={{ fontSize: '0.7rem', marginTop: '5px', color: '#aaaaaa' }}>
              X:{motionData.x.toFixed(1)} Y:{motionData.y.toFixed(1)} Z:{motionData.z.toFixed(1)}
            </div>
          )}
        </div>
        <div className="sensor-item" style={{ backgroundColor: sensorsActive ? '#1c2c1c' : '#2c2c2e' }}>
          <span className="label">Micrófono (Ruido)</span>
          <span className="value">{sensorsActive ? 'Activo' : 'Inactivo'}</span>
          {sensorsActive && (
            <div style={{ fontSize: '0.7rem', marginTop: '5px', color: '#aaaaaa' }}>
              Escuchando anomalías...
            </div>
          )}
        </div>
        <div className="sensor-item">
          <span className="label">Red Local (Mesh)</span>
          <span className="value">Desconectado</span>
        </div>
        <div className="sensor-item">
          <span className="label">Notificaciones</span>
          <span className="value">Pendiente</span>
        </div>
      </div>

      <button
        className="action-button"
        onClick={toggleSensors}
        style={{ backgroundColor: sensorsActive ? '#ff3b30' : '#0a84ff' }}
      >
        {sensorsActive ? 'Detener Sensores' : 'Activar Sensores (Modo Vigilia)'}
      </button>
    </div>
  )
}

export default App;
