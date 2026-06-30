export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private animationId: number | null = null;
  private isListening: boolean = false;

  // Umbral de volumen (RMS) para detectar ruido extremo
  private readonly VOLUME_THRESHOLD = 0.8;
  private onAlertCallback: (volume: number) => void;

  constructor(onAlertCallback: (volume: number) => void) {
    this.onAlertCallback = onAlertCallback;
  }

  async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.2;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength) as any;

      this.isListening = true;
      this.analyzeAudio();

      return true;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      return false;
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.microphone = null;
    this.analyser = null;
    this.dataArray = null;
  }

  private analyzeAudio = () => {
    if (!this.isListening || !this.analyser || !this.dataArray) return;

    this.analyser.getByteTimeDomainData(this.dataArray as any);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      // Normalizar el valor de 0-255 a -1 a 1
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }

    // Calcular el valor Root Mean Square (RMS)
    const rms = Math.sqrt(sum / this.dataArray.length);

    // Disparar alerta si supera el umbral de ruido extremo
    if (rms > this.VOLUME_THRESHOLD) {
      this.onAlertCallback(rms);
    }

    this.animationId = requestAnimationFrame(this.analyzeAudio);
  }
}
