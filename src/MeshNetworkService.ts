export class MeshNetworkService {
  private static instance: MeshNetworkService;
  private channel: BroadcastChannel | null = null;
  private isConnected = false;
  private onAlertReceived: ((message: string) => void) | null = null;

  private constructor() {}

  public static getInstance(): MeshNetworkService {
    if (!MeshNetworkService.instance) {
      MeshNetworkService.instance = new MeshNetworkService();
    }
    return MeshNetworkService.instance;
  }

  public connect(onAlertReceived: (message: string) => void) {
    if (this.isConnected) return;

    this.onAlertReceived = onAlertReceived;

    try {
      // In a real mobile environment without a router, we would use Wi-Fi Direct or BLE plugins.
      // For this PWA/Web PoC, BroadcastChannel simulates local device-to-device comms
      // within the same network/browser instance.
      this.channel = new BroadcastChannel('alertapp-mesh-network');

      this.channel.onmessage = (event) => {
        console.log("Mesh Network recibió mensaje P2P:", event.data);
        if (event.data && event.data.type === 'EMERGENCY_ALERT') {
          if (this.onAlertReceived) {
            this.onAlertReceived(event.data.payload);
          }
        }
      };

      this.isConnected = true;
      console.log("Mesh Network (Local) conectado y escuchando.");
    } catch (e) {
      console.error("No se pudo iniciar la red Mesh local", e);
      this.isConnected = false;
    }
  }

  public disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.isConnected = false;
    this.onAlertReceived = null;
    console.log("Mesh Network desconectado.");
  }

  public broadcastEmergency(alertType: string, details: string) {
    if (!this.isConnected || !this.channel) {
      console.warn("No se puede emitir alerta P2P: Mesh Network desconectado.");
      return;
    }

    const payload = `¡Alerta P2P recibida de un dispositivo cercano! Tipo: ${alertType}. Detalles: ${details}`;

    this.channel.postMessage({
      type: 'EMERGENCY_ALERT',
      payload: payload,
      timestamp: Date.now()
    });

    console.log("Alerta emitida a la red Mesh local:", payload);
  }

  public getStatus(): boolean {
    return this.isConnected;
  }
}
