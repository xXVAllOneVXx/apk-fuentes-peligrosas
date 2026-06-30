import * as speechCommands from '@tensorflow-models/speech-commands';
import * as tf from '@tensorflow/tfjs';

export class AudioAnalyzer {
  private recognizer: speechCommands.SpeechCommandRecognizer | null = null;
  private isListening: boolean = false;
  private onAlertCallback: (keyword: string, probability: number) => void;

  // Palabras clave que podrían indicar pánico u órdenes de auxilio
  // En un entorno real se entrenaría un modelo personalizado (por ej. YAMNet)
  // para detectar "disparos" (gunshots), pero este modelo preentrenado sirve
  // como prueba de concepto para Machine Learning local de audio en Edge.
  private readonly ALERT_KEYWORDS = ['stop', 'go', 'up', 'down', 'left', 'right'];
  private readonly PROBABILITY_THRESHOLD = 0.85;

  constructor(onAlertCallback: (keyword: string, probability: number) => void) {
    this.onAlertCallback = onAlertCallback;
  }

  async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      // Forzar uso del backend WebGL para mayor eficiencia si está disponible
      await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
      await tf.ready();

      // Load the pre-trained Speech Commands model
      this.recognizer = speechCommands.create(
        'BROWSER_FFT', // fourier transform type
        undefined,     // vocabulary feature, null = default
        undefined,     // custom model url
        undefined      // custom metadata url
      );

      await this.recognizer.ensureModelLoaded();

      const classLabels = this.recognizer.wordLabels();
      console.log('Modelo de IA de audio cargado. Labels detectables:', classLabels);

      // Listen for commands
      await this.recognizer.listen(async result => {
        if (!this.isListening) return;

        const scores = result.scores as Float32Array;

        // Find the most probable word
        let maxScore = -1;
        let maxIndex = -1;

        for (let i = 0; i < scores.length; i++) {
          if (scores[i] > maxScore) {
            maxScore = scores[i];
            maxIndex = i;
          }
        }

        const topKeyword = classLabels[maxIndex];

        // Trigger alert if it's a dangerous keyword and probability is high
        if (this.ALERT_KEYWORDS.includes(topKeyword) && maxScore > this.PROBABILITY_THRESHOLD) {
          console.log(`IA detectó audio: ${topKeyword} (prob: ${maxScore})`);
          this.onAlertCallback(topKeyword, maxScore);
        }

      }, {
        includeSpectrogram: false,
        probabilityThreshold: 0.75, // Reduce el procesamiento interno omitiendo baja probabilidad
        invokeCallbackOnNoiseAndUnknown: false,
        overlapFactor: 0.5 // overlap en la ventana del FFT
      });

      this.isListening = true;
      return true;
    } catch (err) {
      console.error('Error inicializando el modelo de IA para el micrófono:', err);
      return false;
    }
  }

  stopListening() {
    this.isListening = false;

    if (this.recognizer) {
      this.recognizer.stopListening();
    }
  }
}
