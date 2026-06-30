import { useState, useEffect, useRef } from 'react';
import { Motion } from '@capacitor/motion';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { AudioAnalyzer } from './AudioAnalyzer';
import { GlobalAlertsService } from './GlobalAlertsService';
import { MeshNetworkService } from './MeshNetworkService';
import type { GlobalAlert } from './GlobalAlertsService';
import './App.css';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sensorsActive, setSensorsActive] = useState(false);

  const [motionData, setMotionData] = useState({ x: 0, y: 0, z: 0 });
  const [earthquakeAlert, setEarthquakeAlert] = useState(false);
  const [audioAlert, setAudioAlert] = useState(false);
  const [meshAlert, setMeshAlert] = useState<string | null>(null);
  const [globalAlerts, setGlobalAlerts] = useState<GlobalAlert[]>([]);

  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const meshServiceRef = useRef<MeshNetworkService>(MeshNetworkService.getInstance());

  // Umbral de aceleración para detectar sismo
  const THRESHOLD = 12.0;

  // Throttle para notificaciones locales (evitar spam)
  const lastNotificationTime = useRef(0);

  const triggerNativeNotification = async (title: string, body: string) => {
    const now = Date.now();
    // Prevenir más de 1 notificación nativa cada 10 segundos
    if (now - lastNotificationTime.current < 10000) return;

    try {
      const permStatus = await LocalNotifications.requestPermissions();
      if (permStatus.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: now,
              schedule: { at: new Date(now + 100) }, // Mostrar casi inmediatamente
              sound: undefined,
              attachments: undefined,
              actionTypeId: "",
              extra: null
            }
          ]
        });
        lastNotificationTime.current = now;
      }
    } catch (e) {
      console.error("No se pudieron enviar notificaciones locales:", e);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch initial alerts
    if (navigator.onLine) {
      GlobalAlertsService.fetchLatestAlerts().then(setGlobalAlerts);
    }

    // Polling global alerts every 60 seconds if online
    const alertInterval = setInterval(() => {
      if (navigator.onLine) {
        GlobalAlertsService.fetchLatestAlerts().then(setGlobalAlerts);
      }
    }, 60000);

    // Background handling
    const appStateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && sensorsActive) {
        triggerNativeNotification("AlertApp en Segundo Plano", "El micrófono podría ser desactivado por el sistema operativo para ahorrar batería.");
      }
    });

    const currentAudioAnalyzer = audioAnalyzerRef.current;
    const currentMeshService = meshServiceRef.current;

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(alertInterval);
      Motion.removeAllListeners();
      if (currentAudioAnalyzer) {
        currentAudioAnalyzer.stopListening();
      }
      currentMeshService.disconnect();
      appStateListener.then(listener => listener.remove());
    };
  }, [sensorsActive]);

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

      // Apagar Mesh
      meshServiceRef.current.disconnect();
      setMeshAlert(null);

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
            triggerNativeNotification(
              "¡ALERTA DE SISMO!",
              "Se ha detectado un movimiento fuerte localmente."
            );
            meshServiceRef.current.broadcastEmergency("Sismo Local", `Vibración extrema detectada (X: ${x.toFixed(1)})`);
            setTimeout(() => setEarthquakeAlert(false), 3000); // Resetear alerta después de 3s
          }
        });

        // Iniciar Micrófono con TensorFlow.js
        const analyzer = new AudioAnalyzer((keyword, probability) => {
          console.log("IA detectó palabra clave:", keyword, "Probabilidad:", probability);
          setAudioAlert(true);
          triggerNativeNotification(
            "¡PELIGRO DETECTADO!",
            `La Inteligencia Artificial ha detectado la palabra clave de auxilio/peligro: "${keyword}".`
          );
          meshServiceRef.current.broadcastEmergency("Audio Extremo", `Palabra clave detectada: ${keyword}`);
          setTimeout(() => setAudioAlert(false), 5000); // 5s alert para dar tiempo de leer
        });

        const audioStarted = await analyzer.startListening();
        if (audioStarted) {
          audioAnalyzerRef.current = analyzer;
        } else {
          alert("No se pudo acceder al micrófono. Por favor revisa los permisos.");
        }

        // Iniciar Red Mesh Local
        meshServiceRef.current.connect((message: string) => {
          console.log("Alerta desde Mesh recibida:", message);
          setMeshAlert(message);
          triggerNativeNotification("¡Alerta de un Dispositivo Cercano!", message);
          setTimeout(() => setMeshAlert(null), 10000);
        });

        setSensorsActive(true);
      } catch (e) {
        console.error("Error al iniciar sensores", e);
        alert("Ocurrió un error al iniciar los sensores. " + (e as Error).message);
      }
    }
  };

  const hasAlert = earthquakeAlert || audioAlert || meshAlert !== null;

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
            {earthquakeAlert ? '¡ALERTA DE SISMO (LOCAL)!' :
             audioAlert ? '¡ALERTA AUDIO EXTREMO!' :
             meshAlert ? '¡ALERTA DE DISPOSITIVO CERCANO!' : 'Seguro - Monitoreando'}
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
        <div className="sensor-item" style={{ backgroundColor: sensorsActive ? '#1c2c1c' : '#2c2c2e' }}>
          <span className="label">Red Local (Mesh)</span>
          <span className="value">{sensorsActive ? 'Escuchando' : 'Desconectado'}</span>
          {meshAlert && (
            <div style={{ fontSize: '0.7rem', marginTop: '5px', color: '#ff3b30', fontWeight: 'bold' }}>
              ¡Alerta Recibida!
            </div>
          )}
        </div>
      </div>

      <button
        className="action-button"
        onClick={toggleSensors}
        style={{ backgroundColor: sensorsActive ? '#ff3b30' : '#0a84ff', marginBottom: '20px' }}
      >
        {sensorsActive ? 'Detener Sensores' : 'Activar Sensores (Modo Vigilia)'}
      </button>

      <h3 style={{ width: '100%', textAlign: 'left', marginBottom: '10px' }}>Feed de Alertas Globales</h3>
      <div className="alerts-feed" style={{ width: '100%', maxHeight: '250px', overflowY: 'auto' }}>
        {globalAlerts.length === 0 ? (
          <p style={{ color: '#aaaaaa', textAlign: 'center', fontSize: '0.9rem' }}>
            {isOnline ? 'Cargando alertas...' : 'Sin conexión para ver alertas globales.'}
          </p>
        ) : (
          globalAlerts.slice(0, 5).map(alert => (
            <div key={alert.id} style={{
              backgroundColor: '#2c2c2e',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '10px',
              borderLeft: `4px solid ${alert.severity === 'critical' ? '#ff3b30' : alert.severity === 'high' ? '#ff9500' : '#34c759'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ fontSize: '1rem', color: alert.severity === 'critical' ? '#ff3b30' : '#ffffff' }}>
                  {alert.type === 'tsunami' ? '🌊 TSUNAMI' :
                   alert.type === 'earthquake' ? '🌍 SISMO' :
                   alert.type === 'terror' ? '⚠️ TERRORISMO' :
                   alert.type === 'disaster' ? '🌋 DESASTRE' : '📰 NOTICIA'} - {alert.title}
                </strong>
              </div>
              <p style={{ margin: '0', fontSize: '0.85rem', color: '#aaaaaa' }}>{alert.details}</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#666' }}>
                {new Date(alert.timestamp).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

    </div>
  )
}

export default App;
