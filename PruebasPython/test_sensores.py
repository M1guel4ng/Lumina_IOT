"""
Prueba de sensores PIR + LDR del ESP32 (esp32-01) leyendo el Monitor Serial.

Uso:
    python test_sensores.py            # autodetecta el puerto CP210x
    python test_sensores.py COM3       # puerto manual

Requisitos:
    pip install pyserial

IMPORTANTE: cierra el Monitor Serial de Arduino IDE antes de ejecutar.
Termina con Ctrl+C para ver el resumen.
"""
import json
import sys
import time

import serial
from serial.tools import list_ports

BAUD = 115200
LUZ_MIN_VARIACION = 30  # variacion minima de lightLevel para dar el LDR por valido


def detectar_puerto():
    for p in list_ports.comports():
        desc = f"{p.description} {p.manufacturer}".lower()
        if "cp210" in desc or "silicon labs" in desc or "usb" in desc:
            return p.device
    return None


def barra(valor, ancho=30):
    llenos = int(max(0, min(100, valor)) / 100 * ancho)
    return "#" * llenos + "-" * (ancho - llenos)


def main():
    puerto = sys.argv[1] if len(sys.argv) > 1 else detectar_puerto()
    if not puerto:
        print("No se encontro el ESP32. Revisa el cable/driver o pasa el puerto: python test_sensores.py COM3")
        print("Puertos disponibles:", [p.device for p in list_ports.comports()])
        sys.exit(1)

    print(f"Conectando a {puerto} @ {BAUD} ...")
    try:
        ser = serial.Serial(puerto, BAUD, timeout=1)
    except serial.SerialException as e:
        print(f"No se pudo abrir {puerto}: {e}")
        print("Cierra el Monitor Serial de Arduino IDE y vuelve a intentar.")
        sys.exit(1)

    print("Esperando telemetria... (mueve la mano frente al PIR y tapa/ilumina el LDR)")
    print("Si no llega nada, presiona el boton EN del ESP32 para reiniciarlo.\n")

    presencias = set()
    luz_min, luz_max = None, None
    ultima_presencia = None
    muestras = 0

    try:
        while True:
            linea = ser.readline().decode("utf-8", errors="ignore").strip()
            if not linea:
                continue

            ini = linea.find("{")
            if ini == -1 or '"presence"' not in linea:
                print(linea)  # logs normales del firmware
                continue

            try:
                datos = json.loads(linea[ini:])
            except json.JSONDecodeError:
                continue

            muestras += 1
            presencia = bool(datos.get("presence"))
            luz = float(datos.get("lightLevel", 0))
            estado_luz = datos.get("light", "?")

            presencias.add(presencia)
            luz_min = luz if luz_min is None else min(luz_min, luz)
            luz_max = luz if luz_max is None else max(luz_max, luz)

            cambio = ""
            if ultima_presencia is not None and presencia != ultima_presencia:
                cambio = "  <-- CAMBIO PIR"
            ultima_presencia = presencia

            print(
                f"{time.strftime('%H:%M:%S')} | PIR: {'DETECTADO ' if presencia else 'sin mov.  '}"
                f"| LDR: {luz:5.1f}% [{barra(luz)}] | luminaria: {estado_luz}{cambio}"
            )
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()

    print("\n" + "=" * 50)
    print(f"RESUMEN ({muestras} muestras)")
    pir_ok = presencias == {True, False}
    print(f"PIR : {'OK' if pir_ok else 'FALLO'} "
          f"(visto: {'movimiento y reposo' if pir_ok else 'solo ' + ('movimiento' if True in presencias else 'reposo' if presencias else 'nada')})")
    if luz_min is None:
        print("LDR : FALLO (sin datos)")
    else:
        variacion = luz_max - luz_min
        ldr_ok = variacion >= LUZ_MIN_VARIACION
        print(f"LDR : {'OK' if ldr_ok else 'FALLO'} (min {luz_min:.1f}%, max {luz_max:.1f}%, variacion {variacion:.1f}%)")
        if not ldr_ok:
            print("      Tapa y luego ilumina el sensor durante la prueba.")
    print("=" * 50)


if __name__ == "__main__":
    main()
