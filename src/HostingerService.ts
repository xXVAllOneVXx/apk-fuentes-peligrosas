
const API_URL = 'https://tools.contentmindsalliance.com/tools/alerta-sismos/api_alertas.php';

export class HostingerService {
    static getDeviceId(): string {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    }

    static async reportEvent(eventType: 'sismo' | 'audio_peligro', lat: number, lng: number): Promise<void> {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: this.getDeviceId(),
                    event_type: eventType,
                    lat, lng
                })
            });
            console.log(`[HostingerService] Evento '${eventType}' reportado al servidor.`);
        } catch (e) {
            console.error("Error reportando evento a Hostinger:", e);
        }
    }

    static async pollAlerts(lat: number, lng: number): Promise<any[]> {
        try {
            const res = await fetch(`${API_URL}?lat=${lat}&lng=${lng}`);
            const data = await res.json();
            return data.alerts || [];
        } catch (e) {
            console.error("Error consultando alertas de Hostinger:", e);
            return [];
        }
    }
}
