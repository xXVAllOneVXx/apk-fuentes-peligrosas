export class AudioAnalyzer {
  private isListening: boolean = false;
  private onAlertCallback: () => void;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  // Umbral alto para detectar explosiones/disparos (ruido extremadamente fuerte repentino)
  private readonly VOLUME_THRESHOLD = 240; 
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

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    this.analyser.getByteFrequencyData(dataArray);

    // Encontrar el pico de volumen en las frecuencias actuales
    let peakVolume = 0;
    for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > peakVolume) {
            peakVolume = dataArray[i];
        }
    }

    const now = Date.now();
    // Si el volumen supera el umbral crítico de peligro (ej. un estallido) y pasaron 10seg desde la ultima
    if (peakVolume > this.VOLUME_THRESHOLD && (now - this.lastAlertTime > 10000)) {
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
