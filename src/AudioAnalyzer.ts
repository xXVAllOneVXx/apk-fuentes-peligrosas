export class AudioAnalyzer {
  private isListening: boolean = false;
  private onAlertCallback: (reason?: string) => void;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  // Baseline tracking para detectar picos anómalos (FFT)
  private baselineLowFreqEnergy = 0;
  private baselineHighFreqEnergy = 0;
  private baselineCount = 0;

  // Evitar falsos positivos de la voz (Geta) o ruidos instantáneos
  private lowFreqSpikeFrames = 0;
  private highFreqSpikeFrames = 0;

  // Debounce para evitar alertas contiguas
  private lastAlertTime = 0;

  constructor(onAlertCallback: (reason?: string) => void) {
    this.onAlertCallback = onAlertCallback;
  }

  async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      // Usar un tamaño de FFT grande para mayor resolución en baja frecuencia
      // 8192 bins -> ~5.3 Hz de resolución por bin a 44.1 kHz
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.8;
      
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      
      this.baselineLowFreqEnergy = 0;
      this.baselineHighFreqEnergy = 0;
      this.baselineCount = 0;

      this.isListening = true;
      this.detectAnomalies();
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }

  private detectAnomalies = () => {
    if (!this.isListening || !this.analyser || !this.audioContext) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    
    // Obtener espectro de frecuencia con FFT
    this.analyser.getFloatFrequencyData(dataArray);

    const sampleRate = this.audioContext.sampleRate;
    const hzPerBin = (sampleRate / 2) / bufferLength;

    let lowFreqEnergy = 0;
    let lowFreqBins = 0;

    let highFreqEnergy = 0;
    let highFreqBins = 0;

    let midFreqEnergy = 0; // Banda humana/ruidos comunes
    let midFreqBins = 0;

    for (let i = 0; i < bufferLength; i++) {
        const freq = i * hzPerBin;
        // Convertir dB a magnitud lineal (getFloatFrequencyData retorna típicamente entre -100 y 0)
        // Valores muy negativos (e.g. -120dB) resultarán en una magnitud cercana a 0
        const magnitude = Math.pow(10, dataArray[i] / 20);

        // Infrasonidos y bajas frecuencias (< 50 Hz, comunes antes de sismos)
        if (freq <= 50) {
            lowFreqEnergy += magnitude;
            lowFreqBins++;
        }
        // Altas frecuencias (anomalías, ondas agudas, "microondas acústicas" en > 10,000 Hz)
        else if (freq >= 10000) {
            highFreqEnergy += magnitude;
            highFreqBins++;
        }
        // Frecuencias medias (Voz humana, golpes, puertas, gritos: 300Hz - 3000Hz)
        else if (freq >= 300 && freq <= 3000) {
            midFreqEnergy += magnitude;
            midFreqBins++;
        }
    }

    if (lowFreqBins > 0) lowFreqEnergy /= lowFreqBins;
    if (highFreqBins > 0) highFreqEnergy /= highFreqBins;
    if (midFreqBins > 0) midFreqEnergy /= midFreqBins;

    // Calcular la línea base durante los primeros 100 frames (~1.5 segundos)
    if (this.baselineCount < 100) {
        this.baselineLowFreqEnergy = (this.baselineLowFreqEnergy * this.baselineCount + lowFreqEnergy) / (this.baselineCount + 1);
        this.baselineHighFreqEnergy = (this.baselineHighFreqEnergy * this.baselineCount + highFreqEnergy) / (this.baselineCount + 1);
        this.baselineCount++;
    } else {
        // Adaptación suave de la línea base al ruido ambiental constante
        this.baselineLowFreqEnergy = this.baselineLowFreqEnergy * 0.99 + lowFreqEnergy * 0.01;
        this.baselineHighFreqEnergy = this.baselineHighFreqEnergy * 0.99 + highFreqEnergy * 0.01;

        const now = Date.now();

        // Umbrales para detección: un pico repentino de X veces la energía ambiental promedio
        const LOW_FREQ_MULTIPLIER = 12.0;
        const HIGH_FREQ_MULTIPLIER = 12.0;

        // Evitar falsos positivos en entornos de silencio casi absoluto
        const MIN_ENERGY = 0.02;

        if (now - this.lastAlertTime > 10000) {
            // RECHAZO DE BANDA ANCHA:
            // Los ruidos fuertes (como gritos, la boca, golpes) generan energía en TODAS las frecuencias.
            // Si la energía media (midFreqEnergy) es alta, significa que es un ruido humano fuerte.
            // Solo aceptamos la anomalía si la energía de Infrasonido es matemáticamente DOMINANTE (por ejemplo, al menos 3 veces mayor a la voz humana).
            const isMidFreqInterference = midFreqEnergy > (lowFreqEnergy / 3);

            if (!isMidFreqInterference && lowFreqEnergy > this.baselineLowFreqEnergy * LOW_FREQ_MULTIPLIER && lowFreqEnergy > MIN_ENERGY) {
                this.lowFreqSpikeFrames++;
            } else {
                this.lowFreqSpikeFrames = 0;
            }

            const isMidFreqInterferenceHigh = midFreqEnergy > (highFreqEnergy / 2);
            if (!isMidFreqInterferenceHigh && highFreqEnergy > this.baselineHighFreqEnergy * HIGH_FREQ_MULTIPLIER && highFreqEnergy > MIN_ENERGY) {
                this.highFreqSpikeFrames++;
            } else {
                this.highFreqSpikeFrames = 0;
            }

            // Un sismo real o anomalía pura dura más que un chasquido
            // Exigimos que el pico anómalo se mantenga por al menos 30 frames (aprox 500ms sostenidos)
            if (this.lowFreqSpikeFrames > 30) {
                this.lastAlertTime = now;
                this.lowFreqSpikeFrames = 0;
                this.onAlertCallback("Microsismo Acústico (Onda P Infrasonido)");
            } else if (this.highFreqSpikeFrames > 30) {
                this.lastAlertTime = now;
                this.highFreqSpikeFrames = 0;
                this.onAlertCallback("Alta Frecuencia Anómala");
            }
        }
    }

    this.animationFrameId = requestAnimationFrame(this.detectAnomalies);
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
