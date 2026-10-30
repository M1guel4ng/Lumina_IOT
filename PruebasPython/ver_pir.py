import serial
import time
import sys

PORT = "COM9"
BAUD = 115200

def main():
    print("=" * 65)
    print("   MONITOR EN TIEMPO REAL - SENSOR PIR HC-SR501 (GPIO 27)")
    print("=" * 65)
    print(f"Conectando a {PORT} a {BAUD} baudios...")

    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except Exception as e:
        print(f"\n[ERROR] No se pudo abrir {PORT}: {e}")
        print("Verifica que no tengas abierto el Monitor Serial de Arduino IDE.")
        sys.exit(1)

    print("\n¡Conexión establecida!")
    print("-----------------------------------------------------------------")
    print("INSTRUCCIÓN:")
    print("1. Espera 10 segundos a que el sensor HC-SR501 se estabilice.")
    print("2. Pasa tu mano a unos 10-30 cm de la semiesfera blanca.")
    print("3. Presiona Ctrl+C en cualquier momento para salir.")
    print("-----------------------------------------------------------------\n")

    try:
        while True:
            linea = ser.readline().decode('utf-8', errors='ignore').strip()
            if not linea:
                continue

            if "MOVIMIENTO DETECTADO" in linea or '"presence":true' in linea or "Presencia: SI" in linea:
                print("🚨🚨🚨  [PIR] ¡¡¡ MOVIMIENTO DETECTADO !!! (Presencia = SI)  🚨🚨🚨")
            elif "Sin movimiento" in linea or '"presence":false' in linea or "Presencia: NO" in linea:
                print("⚪⚪⚪  [PIR] Sin movimiento / Despejado (Presencia = NO)")
            elif "TELEMETRIA" in linea:
                print(f"📊 {linea}")
            else:
                print(f"   {linea}")

    except KeyboardInterrupt:
        print("\n\nMonitor cerrado por el usuario.")
    finally:
        ser.close()

if __name__ == "__main__":
    main()

