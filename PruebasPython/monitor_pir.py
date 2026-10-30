import serial
import time
import sys

PORT = 'COM9'
BAUD = 115200

print("=" * 60)
print("     MONITOR EN VIVO DEL SENSOR PIR (HC-SR501) Y LDR")
print("=" * 60)
print(f"Abriendo {PORT} a {BAUD} baudios...")

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
except Exception as e:
    print(f"Error al abrir {PORT}: {e}")
    sys.exit(1)

print("\nConectado con exito.")
print(">>> INSTRUCCION: Pasa tu mano por encima del sensor PIR HC-SR501.")
print("    Presiona Ctrl+C en cualquier momento para salir.\n")

last_val = None

try:
    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if not line:
            continue
        
        # Mostrar logs del ESP32
        if "TELEMETRIA" in line:
            print(f"[ESP32] {line}")
        elif "presence" in line:
            if "true" in line:
                print(">>> [!!!] PRESENCIA DETECTADA EN GPIO 27 (HIGH)")
            else:
                print("... [   ] Sin presencia (LOW)")
        else:
            print(f"        {line}")
except KeyboardInterrupt:
    print("\nMonitor detenido por el usuario.")
finally:
    ser.close()

