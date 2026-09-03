import { useState, useEffect, useRef } from 'react';
import { Motion } from '@capacitor/motion';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import type { Position } from '@capacitor/geolocation';
import { AudioAnalyzer } from './AudioAnalyzer';
import { GlobalAlertsService } from './GlobalAlertsService';
import { MeshNetworkService } from './MeshNetworkService';
import type { GlobalAlert } from './GlobalAlertsService';
import { USGSService } from './USGSService';
import type { EarthquakeFeature } from './USGSService';
import MapComponent from './MapComponent';
import { HostingerService } from './HostingerService';
import './App.css';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sensorsActive, setSensorsActive] = useState(false);

  const [motionData, setMotionData] = useState({ x: 0, y: 0, z: 0 });
  const [isDeviceResting, setIsDeviceResting] = useState(false);
  const [earthquakeAlert, setEarthquakeAlert] = useState(false);
  const [audioAlert, setAudioAlert] = useState(false);
  const [meshAlert, setMeshAlert] = useState<string | null>(null);
  const [globalAlerts, setGlobalAlerts] = useState<GlobalAlert[]>([]);
  const [userLocation, setUserLocation] = useState<Position | null>(null);

  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const meshServiceRef = useRef<MeshNetworkService>(MeshNetworkService.getInstance());

  // Umbral de aceleración para detectar sismo
  

  const [liveQuakes, setLiveQuakes] = useState<EarthquakeFeature[]>([]);
  const [loadingQuakes, setLoadingQuakes] = useState(false);

  useEffect(() => {
    const fetchQuakes = async () => {
      setLoadingQuakes(true);
      const quakes = await USGSService.getRecentEarthquakes();
      setLiveQuakes(quakes);
      setLoadingQuakes(false);
    };
    fetchQuakes();
    const interval = setInterval(fetchQuakes, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Throttle para notificaciones locales (evitar spam)
  const lastNotificationTime = useRef(0);

  // Calculate distance between two coordinates in kilometers using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  };

  const notifiedAlertIds = useRef<Set<string>>(new Set());

  const checkGlobalAlertsProximity = (alerts: GlobalAlert[], currentLocation: Position) => {
    const RADIUS_KM = 1000; // Radio amplio para cubrir el país (~1000km)

    alerts.forEach(alert => {
      // Solo procesar alertas muy recientes (últimos 15 minutos)
      const isNew = (Date.now() - alert.timestamp) < (15 * 60 * 1000);
      if (!isNew || notifiedAlertIds.current.has(alert.id)) return;

      let shouldNotify = false;
      let distanceMsg = "";

      if (alert.coordinates) {
        const distance = calculateDistance(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
          alert.coordinates.lat,
          alert.coordinates.lng
        );
        distanceMsg = ` a ${Math.round(distance)}km de ti.`;

        // Notificar si está en mi país/región (< 1000km) sin importar severidad
        if (distance <= RADIUS_KM) {
           shouldNotify = true;
        }
      }

      // Notificar si es un evento crítico global sin importar la distancia
      if (alert.severity === 'high' || alert.severity === 'critical') {
          shouldNotify = true;
      }

      if (shouldNotify) {
         triggerNativeNotification(
           `¡NUEVA ALERTA: ${alert.title}!`,
           `Severidad: ${alert.severity.toUpperCase()}.${distanceMsg} ${alert.details}`
         );
         notifiedAlertIds.current.add(alert.id);
      }
    });
  };

  const fetchAndProcessAlerts = async (loc: Position | null) => {
    if (!navigator.onLine) return;

    const alerts = await GlobalAlertsService.fetchLatestAlerts();
    setGlobalAlerts(alerts);

    // Actualizar también liveQuakes para el mapa para que no haya desfasaje
    const quakes = alerts.filter(a => a.type === 'earthquake' && a.coordinates).map(a => ({
      type: 'Feature',
      properties: {
        mag: a.severity === 'critical' ? 7.0 : a.severity === 'high' ? 6.0 : a.severity === 'medium' ? 5.0 : 4.0,
        place: a.details,
        time: a.timestamp,
        updated: Date.now(),
        url: '',
        detail: '',
        status: 'automatic',
        tsunami: 0,
        sig: 0,
        net: 'us',
        code: a.id,
        title: a.title
      },
      geometry: {
        type: 'Point',
        coordinates: a.coordinates ? [a.coordinates.lng, a.coordinates.lat, 0] : [0,0,0]
      },
      id: a.id
    }));
    setLiveQuakes(quakes as any);

    if (loc) {
      checkGlobalAlertsProximity(alerts, loc);
    }
  };

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

    let initialLocation: Position | null = null;

    const initGeo = async () => {
      try {
        const permStatus = await Geolocation.checkPermissions();
        if (permStatus.location !== 'granted') {
          await Geolocation.requestPermissions();
        }

        // Usar alta precisión para asegurar la geolocalización exacta en el municipio
        initialLocation = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0 // Forzar obtener ubicación fresca, no cacheada
        });
        setUserLocation(initialLocation);

      } catch (e) {
        console.error("No se pudo obtener la ubicación:", e);
      }

      fetchAndProcessAlerts(initialLocation);
    };

    initGeo();

    // Polling global alerts every 60 seconds if online
    const alertInterval = setInterval(() => {
      // Use latest known location for proximity checks
      fetchAndProcessAlerts(userLocation || initialLocation);
    }, 60000);

    // Iniciar WebSocket con EMSC para sismos al instante
    GlobalAlertsService.startRealtimeEMSC((newAlert) => {
      // Cuando EMSC empuja una alerta en tiempo real, procesarla inmediatamente sin esperar 60s
      setGlobalAlerts(prev => [newAlert, ...prev]);

      const loc = userLocation || initialLocation;
      if (loc) {
        checkGlobalAlertsProximity([newAlert], loc);
      }
    });

    // PWA Install Prompt handling
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

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
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(alertInterval);
      Motion.removeAllListeners();
      if (currentAudioAnalyzer) {
        currentAudioAnalyzer.stopListening();
      }
      currentMeshService.disconnect();
      appStateListener.then(listener => listener.remove());
    };
  }, [sensorsActive, userLocation]);


  // Ref para manejar el estado de reposo de forma síncrona dentro de los listeners
  const deviceRestingState = useRef(false);

  // Activar sensores
  useEffect(() => {
    
    let pollInterval: any;
    let currentAudioAnalyzer: AudioAnalyzer | null = null;

    if (sensorsActive && userLocation) {
      const lat = userLocation.coords.latitude;
      const lng = userLocation.coords.longitude;

      // 0. Fusión de Sensores: Orientación y Reposo
      let rotationBuffer: number[] = [];
      let restingTimeStart = 0;

      Motion.addListener('orientation', (event) => {
         // Evaluamos la rotación (alpha, beta, gamma)
         const alpha = event.alpha || 0;
         const beta = event.beta || 0;
         const gamma = event.gamma || 0;

         const rotMagnitude = Math.sqrt(alpha*alpha + beta*beta + gamma*gamma);
         rotationBuffer.push(rotMagnitude);
         if (rotationBuffer.length > 20) rotationBuffer.shift(); // Historial de ~medio segundo

         if (rotationBuffer.length === 20) {
             let isCurrentlyMoving = false;
             // Si el dispositivo cambia su rotación significativamente, está siendo manipulado
             for (let i = 1; i < rotationBuffer.length; i++) {
                 if (Math.abs(rotationBuffer[i] - rotationBuffer[i-1]) > 1.5) { // Tolerancia estricta a la manipulación
                     isCurrentlyMoving = true;
                     break;
                 }
             }

             if (isCurrentlyMoving) {
                 restingTimeStart = 0;
                 if (deviceRestingState.current) {
                     deviceRestingState.current = false;
                     setIsDeviceResting(false);
                 }
             } else {
                 if (restingTimeStart === 0) restingTimeStart = Date.now();
                 // Si ha estado quieto por más de 5 segundos, activar Modo Reposo
                 if (Date.now() - restingTimeStart > 5000 && !deviceRestingState.current) {
                     deviceRestingState.current = true;
                     setIsDeviceResting(true);
                 }
             }
         }
      });

      // 1. Escuchar Acelerómetro (Fusión de Sensores: Microsismos P-Waves)
      let bgAccelBuffer: number[] = [];
      const BUFFER_SIZE = 128; // Ventana más grande para capturar mejor las frecuencias (128 muestras)

      Motion.addListener('accel', (event) => {
        const x = event.acceleration.x || 0;
        const y = event.acceleration.y || 0;
        const z = event.acceleration.z || 0;
        setMotionData({ x, y, z });
        
        const magnitude = Math.sqrt(x*x + y*y + z*z);
        bgAccelBuffer.push(magnitude);
        if (bgAccelBuffer.length > BUFFER_SIZE) bgAccelBuffer.shift();

        if (bgAccelBuffer.length === BUFFER_SIZE) {
            // Aplicar Filtro de Ventana Hanning para suavizar y evitar falsos positivos
            const smoothed: number[] = [];
            for (let i = 0; i < BUFFER_SIZE; i++) {
               const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (BUFFER_SIZE - 1)));
               smoothed.push(bgAccelBuffer[i] * multiplier);
            }

            // Calcular energía (RMS) de la señal filtrada
            let sumEnergy = 0;
            smoothed.forEach(v => sumEnergy += v*v);
            const rms = Math.sqrt(sumEnergy / smoothed.length);

            // Calcular cruces por cero (Zero-Crossing) de la media para estimar frecuencia (Hz)
            let mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
            let zeroCrossings = 0;
            for (let i = 1; i < smoothed.length; i++) {
                if ((smoothed[i-1] - mean) * (smoothed[i] - mean) < 0) {
                    zeroCrossings++;
                }
            }

            // Frecuencia estimada (asumiendo ~50-60 muestras por segundo típicas en Capacitor)
            const durationSec = smoothed.length / 50;
            const estimatedHz = (zeroCrossings / 2) / durationSec;

            const now = Date.now();
            if (now - lastNotificationTime.current > 10000) {
                // MODO REPOSO ACTIVO (Ultra-sensible, Ondas P / Microsismos)
                if (deviceRestingState.current) {
                    // Firma Onda P: Muy baja energía, frecuencia sostenida entre 1Hz y 10Hz
                    const MICRO_MIN_ENERGY = 0.15; // Muy sensible
                    const MICRO_MAX_ENERGY = 1.0;  // Límite superior de Onda P

                    if (rms > MICRO_MIN_ENERGY && rms < MICRO_MAX_ENERGY && estimatedHz >= 1.0 && estimatedHz <= 10.0) {
                        lastNotificationTime.current = now;
                        setEarthquakeAlert(true);
                        triggerNativeNotification(
                          "¡PRECAUCIÓN: MICROSISMO (Onda P)!",
                          `Posible sismo mayor en camino. Dispositivo detectó microsismo local.`
                        );
                        HostingerService.reportEvent('sismo', lat, lng);
                        setTimeout(() => setEarthquakeAlert(false), 8000);
                    }
                    // Firma Sismo Mayor (Ondas S) en Reposo
                    else if (rms >= MICRO_MAX_ENERGY && rms < 20.0 && estimatedHz >= 0.5 && estimatedHz <= 15.0) {
                        lastNotificationTime.current = now;
                        setEarthquakeAlert(true);
                        triggerNativeNotification(
                          "¡ALERTA DE SISMO FUERTE!",
                          `¡Ponte a salvo! Sismo destructivo en progreso.`
                        );
                        HostingerService.reportEvent('sismo', lat, lng);
                        setTimeout(() => setEarthquakeAlert(false), 8000);
                    }
                }
                // MODO MANIPULACIÓN (Descartar microsismos, solo detectar sismos mayores evidentes)
                else {
                    // Requerimos mucha más energía para confirmar sismo mientras el usuario mueve el móvil
                    const HIGH_MIN_ENERGY = 2.5;
                    const HIGH_MAX_ENERGY = 15.0; // Evitar caídas bruscas

                    if (rms > HIGH_MIN_ENERGY && rms < HIGH_MAX_ENERGY && estimatedHz >= 0.5 && estimatedHz <= 8.0) {
                        lastNotificationTime.current = now;
                        setEarthquakeAlert(true);
                        triggerNativeNotification(
                          "¡ALERTA DE SISMO (Movimiento)!",
                          `Sismo detectado mientras usas el móvil.`
                        );
                        HostingerService.reportEvent('sismo', lat, lng);
                        setTimeout(() => setEarthquakeAlert(false), 8000);
                    }
                }
            }
        }
      });

      // 2. Iniciar análisis de Audio (Disparos / Explosiones con IA en TensorFlow.js)
      currentAudioAnalyzer = new AudioAnalyzer((reason?: string) => {
          const now = Date.now();
          if (now - lastNotificationTime.current > 10000) {
              lastNotificationTime.current = now;
              setAudioAlert(true);
              triggerNativeNotification(
                  "¡ALERTA DE AUDIO EXTREMO!",
                  reason || "Anomalía acústica detectada."
              );
              HostingerService.reportEvent('audio_peligro', lat, lng);
              setTimeout(() => setAudioAlert(false), 5000);
          }
      });
      currentAudioAnalyzer.startListening().catch(e => console.error("Microphone err:", e));
      audioAnalyzerRef.current = currentAudioAnalyzer;

      // 3. Polling a Hostinger ("Red Mesh" comunitaria en la nube) ultrarrápido
      pollInterval = setInterval(async () => {
          const alerts = await HostingerService.pollAlerts(lat, lng);
          if (alerts.length > 0) {
              const latestAlert = alerts[0];

              // Evitar spam si es la misma alerta
              if (!notifiedAlertIds.current.has(latestAlert.id || latestAlert.alert_type)) {
                  notifiedAlertIds.current.add(latestAlert.id || latestAlert.alert_type);

                  setMeshAlert(`¡ALERTA TEMPRANA COMUNITARIA! ${latestAlert.alert_type.toUpperCase()} detectado a ${parseFloat(latestAlert.distance).toFixed(1)} km.`);
                  triggerNativeNotification(
                     "¡ALERTA TEMPRANA CERCANA!",
                     `¡Prepárate! La red comunitaria ha detectado un posible ${latestAlert.alert_type} a ${parseFloat(latestAlert.distance).toFixed(1)} km que podría llegar en segundos.`
                  );
              }
          }
      }, 1000); // Poll cada 1 segundo (Velocidad de la luz para la red mesh)
    }

    return () => {
      Motion.removeAllListeners();
      if (currentAudioAnalyzer) currentAudioAnalyzer.stopListening();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sensorsActive, userLocation]);


  const toggleSensors = async () => {
    if (sensorsActive) {
      // Apagar Sensores
      await Motion.removeAllListeners();
      setMotionData({ x: 0, y: 0, z: 0 });
      setEarthquakeAlert(false);
      setIsDeviceResting(false);
      deviceRestingState.current = false;

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
        let accelBuffer: number[] = [];
        const BUFFER_SIZE = 64; // Potencia de 2 para análisis más fácil
        await Motion.addListener('accel', (event) => {
          const x = event.acceleration.x || 0;
          const y = event.acceleration.y || 0;
          const z = event.acceleration.z || 0;

          setMotionData({ x, y, z });

          const magnitude = Math.sqrt(x*x + y*y + z*z);
          accelBuffer.push(magnitude);
          if (accelBuffer.length > BUFFER_SIZE) {
            accelBuffer.shift();
          }

          if (accelBuffer.length === BUFFER_SIZE) {
            // Aplicar un filtro pasa-bajos simple (Moving Average)
            const smoothed: number[] = [];
            for (let i = 2; i < BUFFER_SIZE - 2; i++) {
               smoothed.push((accelBuffer[i-2] + accelBuffer[i-1] + accelBuffer[i] + accelBuffer[i+1] + accelBuffer[i+2]) / 5);
            }

            // Calcular energía (RMS) de la señal filtrada
            let sumEnergy = 0;
            smoothed.forEach(v => sumEnergy += v*v);
            const rms = Math.sqrt(sumEnergy / smoothed.length);

            // Calcular cruces por cero de la media para estimar frecuencia (Zero-Crossing)
            let mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
            let zeroCrossings = 0;
            for (let i = 1; i < smoothed.length; i++) {
                if ((smoothed[i-1] - mean) * (smoothed[i] - mean) < 0) {
                    zeroCrossings++;
                }
            }

            // Frecuencia estimada (asumiendo ~50 muestras por segundo)
            const durationSec = smoothed.length / 50;
            const estimatedHz = (zeroCrossings / 2) / durationSec;

            // Sismos reales: Energía significativa y baja frecuencia (típicamente entre 0.5Hz y 10Hz)
            const MIN_ENERGY = 1.0;
            const MAX_ENERGY = 15.0; // Descartar golpes fuertes/caídas

            const now = Date.now();
            if (rms > MIN_ENERGY && rms < MAX_ENERGY && estimatedHz >= 0.5 && estimatedHz <= 15.0 && (now - lastNotificationTime.current > 10000)) {
               lastNotificationTime.current = now;
               setEarthquakeAlert(true);
               triggerNativeNotification(
                 "¡ALERTA DE SISMO!",
                 `Se ha detectado un movimiento sísmico localmente. (Freq: ${estimatedHz.toFixed(1)}Hz)`
               );
               meshServiceRef.current.broadcastEmergency("Sismo Local", `Vibración sísmica detectada (RMS: ${rms.toFixed(2)})`);
               setTimeout(() => setEarthquakeAlert(false), 5000);
            }
          }
        });

        // Iniciar Micrófono con TensorFlow.js
        const analyzer = new AudioAnalyzer((reason?: string) => {
           setAudioAlert(true);
           triggerNativeNotification("¡ALERTA DE AUDIO!", reason || "Anomalía acústica detectada.");
           setTimeout(() => setAudioAlert(false), 5000);
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

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <a 
          href="./AlertApp.apk" 
          download="AlertApp.apk"
          style={{
            display: 'inline-block',
            backgroundColor: '#34a853',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
          }}
        >
          ⬇️ Descargar APK Nativa Android
        </a>
      </div>





      <div className="card" style={{ backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
        <h2>Sismos en Tiempo Real (USGS)</h2>
        <p>Datos oficiales de actividad sísmica global.</p>
        {loadingQuakes ? (
          <p>Cargando datos sísmicos desde satélite...</p>
        ) : (
          <MapComponent earthquakes={liveQuakes} userLocation={userLocation ? {lat: userLocation.coords.latitude, lng: userLocation.coords.longitude} : null} />
        )}
      </div>

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
        {sensorsActive && isDeviceResting && (
          <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#0a84ff', fontWeight: 'bold' }}>
            📱 MODO REPOSO ACTIVO: Sensores configurados para detección de Microsismos (Ondas P).
          </p>
        )}
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
