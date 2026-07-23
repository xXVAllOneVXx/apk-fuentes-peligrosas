export class AudioAnalyzer {
  private isListening: boolean = false;
  private onAlertCallback: () => void;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  // Debounce para evitar alertas contiguas
  private lastAlertTime = 0;

  constructor(onAlertCallback: () => void) {
    this.onAlertCallback = onAlertCallback;
  }

  async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      
      this.isListening = true;
      this.detectExplosions();
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }

  private detectExplosions = () => {
    if (!this.isListening || !this.analyser) return;

    // Usar datos en el dominio del tiempo para calcular RMS (Energía) y Tasa de Cruce por Cero (ZCR)
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    
    this.analyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0;
    let zeroCrossings = 0;
    let previousValue = dataArray[0] - 128; // Centrar alrededor de 0

    for (let i = 0; i < bufferLength; i++) {
        // Normalizar a un rango de -1 a 1 aprox
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;

        const currentValue = dataArray[i] - 128;
        // Detectar si la onda cruzó el eje cero
        if ((previousValue >= 0 && currentValue < 0) || (previousValue < 0 && currentValue >= 0)) {
            zeroCrossings++;
        }
        previousValue = currentValue;
    }

    // Root Mean Square (RMS) representa la energía matemática de la señal
    const rms = Math.sqrt(sumSquares / bufferLength);

    // Zero-Crossing Rate (ZCR) ayuda a distinguir ruido de alta frecuencia vs ruido vocal/humano
    const zcr = zeroCrossings / bufferLength;

    const now = Date.now();

    // Umbrales científicos para una explosión o disparo:
    // Tienen un pico de energía enorme y repentino (RMS alto) y suelen ser ruido de banda ancha (ZCR moderado/alto).
    // Evita falsos positivos como un soplido, gritos comunes o decir "puf".
    const RMS_THRESHOLD = 0.45; // Energía sostenida alta
    const ZCR_MIN = 0.15; // Evitar ruidos vocales graves de baja frecuencia

    if (rms > RMS_THRESHOLD && zcr > ZCR_MIN && (now - this.lastAlertTime > 10000)) {
        this.lastAlertTime = now;
        this.onAlertCallback();
    }

    this.animationFrameId = requestAnimationFrame(this.detectExplosions);
  }

  stopListening(): void {
    this.isListening = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.microphone && this.microphone.mediaStream) {
      this.microphone.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
