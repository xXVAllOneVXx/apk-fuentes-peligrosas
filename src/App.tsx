import { useState, useEffect } from 'react';
import { Motion } from '@capacitor/motion';
import './App.css';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [motionActive, setMotionActive] = useState(false);
  const [motionData, setMotionData] = useState({ x: 0, y: 0, z: 0 });
  const [earthquakeAlert, setEarthquakeAlert] = useState(false);

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
    };
  }, []);

  const toggleMotionSensor = async () => {
    if (motionActive) {
      await Motion.removeAllListeners();
      setMotionActive(false);
      setMotionData({ x: 0, y: 0, z: 0 });
      setEarthquakeAlert(false);
    } else {
      try {
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
        setMotionActive(true);
      } catch (e) {
        console.error("Error al iniciar sensor de movimiento", e);
        alert("Tu dispositivo no soporta el acelerómetro o faltan permisos.");
      }
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>AlertApp</h1>
        <p>Sistema de Alerta Temprana Descentralizado</p>
      </header>

      <div className="status-card" style={{ backgroundColor: earthquakeAlert ? '#4a1111' : '#1e1e1e' }}>
        <h2>Estado Global</h2>
        <div className="status-indicator">
          <div className={`status-dot ${earthquakeAlert ? 'danger' : 'safe'}`}></div>
          <span className="status-text">
            {earthquakeAlert ? '¡ALERTA DE SISMO (LOCAL)!' : 'Seguro - Monitoreando'}
          </span>
        </div>
        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: isOnline ? '#34c759' : '#ffcc00' }}>
          {isOnline ? '🟢 Conectado a la red' : '🟡 Modo Offline (Usando red local/Bluetooth)'}
        </p>
      </div>

      <h3 style={{ width: '100%', textAlign: 'left', marginBottom: '10px' }}>Sensores Locales</h3>

      <div className="sensor-grid">
        <div className="sensor-item" style={{ backgroundColor: motionActive ? '#1c2c1c' : '#2c2c2e' }}>
          <span className="label">Acelerómetro (Sismos)</span>
          <span className="value">{motionActive ? 'Activo' : 'Inactivo'}</span>
          {motionActive && (
            <div style={{ fontSize: '0.7rem', marginTop: '5px', color: '#aaaaaa' }}>
              X:{motionData.x.toFixed(1)} Y:{motionData.y.toFixed(1)} Z:{motionData.z.toFixed(1)}
            </div>
          )}
        </div>
        <div className="sensor-item">
          <span className="label">Micrófono (Audio IA)</span>
          <span className="value">Inactivo</span>
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
        onClick={toggleMotionSensor}
        style={{ backgroundColor: motionActive ? '#ff3b30' : '#0a84ff' }}
      >
        {motionActive ? 'Detener Sensores' : 'Activar Sensores (Modo Vigilia)'}
      </button>
    </div>
  )
}

export default App;
