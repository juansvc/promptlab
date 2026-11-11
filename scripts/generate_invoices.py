"""Genera el conjunto de 30 facturas sintéticas del caso de estudio (apartado 3.3.8).

Todas las empresas, personas e identificadores son ficticios. El generador es determinista
(semilla fija), así que el conjunto se puede regenerar idéntico:

    python3 scripts/generate_invoices.py > src/data/invoices.json

Composición: 20 completas, 6 incompletas y 4 ambiguas; 10 de ajuste y 20 de prueba.
"""
import json
import random

rng = random.Random(20261111)

EMISORES = [
    ("Ferretería Los Andes Ficticia S.A.", "Av. 10 de Agosto N24-15, Quito"),
    ("Distribuidora Pacífico Demo Cía. Ltda.", "Av. 9 de Octubre 1820, Guayaquil"),
    ("Papelería El Cóndor de Prueba", "Calle Bolívar 3-45, Cuenca"),
    ("Tecnosur Ejemplo S.A.S.", "Av. Universitaria 08-12, Loja"),
    ("Panadería La Espiga Sintética", "Calle Sucre 214, Ambato"),
    ("Servicios Contables Modelo S.A.", "Av. Amazonas N33-120, Quito"),
    ("Agroinsumos Valle Verde Demo", "Vía a Daule km 7, Guayaquil"),
    ("Imprenta Rápida Ficticia", "Calle Larga 7-80, Cuenca"),
]
NOMBRES = ["María", "José", "Lucía", "Andrés", "Carmen", "Diego", "Paola", "Fernando", "Gabriela", "Santiago", "Valeria", "Mateo"]
APELLIDOS = ["Andrade", "Benítez", "Cárdenas", "Delgado", "Espinoza", "Figueroa", "Guerrero", "Herrera", "Jaramillo", "Loor", "Mendoza", "Ortega"]
PRODUCTOS = [
    ("Resma de papel A4", 4.75), ("Tóner de impresora", 38.90), ("Cable UTP categoría 6 (m)", 0.85),
    ("Martillo de acero", 9.40), ("Saco de fertilizante 50 kg", 31.20), ("Servicio de asesoría contable (h)", 25.00),
    ("Pan integral", 1.35), ("Teclado inalámbrico", 18.60), ("Caja de tornillos", 3.10), ("Impresión a color (ciento)", 12.00),
]
FORMAS_PAGO = ["efectivo", "transferencia bancaria", "tarjeta de crédito", "tarjeta de débito"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
IVA = 0.15


def ruc():
    return "17" + "".join(str(rng.randint(0, 9)) for _ in range(8)) + "001"


def cedula():
    return "09" + "".join(str(rng.randint(0, 9)) for _ in range(8))


def money(x, style):
    if style == "coma":
        entero, dec = f"{x:.2f}".split(".")
        entero = f"{int(entero):,}".replace(",", ".")
        return f"$ {entero},{dec}"
    return f"$ {x:,.2f}"


def fecha_texto(y, m, d, estilo):
    if estilo == "barras":
        return f"{d:02d}/{m:02d}/{y}"
    if estilo == "larga":
        return f"{d} de {MESES[m - 1]} de {y}"
    return f"{y}-{m:02d}-{d:02d}"


def make(i, kind):
    emisor, direccion = rng.choice(EMISORES)
    ruc_e = ruc()
    est, pto, sec = rng.randint(1, 3), rng.randint(1, 5), rng.randint(1000, 99999)
    numero = f"{est:03d}-{pto:03d}-{sec:09d}"
    y, m, d = 2026, rng.randint(1, 10), rng.randint(1, 28)
    nombre = f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}"
    ident = cedula() if rng.random() < 0.6 else ruc()
    items = rng.sample(PRODUCTOS, rng.randint(1, 4))
    lineas, subtotal = [], 0.0
    for nombre_p, precio in items:
        cant = rng.randint(1, 12)
        t = round(cant * precio, 2)
        subtotal += t
        lineas.append((cant, nombre_p, precio, t))
    subtotal = round(subtotal, 2)
    iva = round(subtotal * IVA, 2)
    total = round(subtotal + iva, 2)
    forma = rng.choice(FORMAS_PAGO)
    estilo_fecha = rng.choice(["barras", "larga", "iso"])
    estilo_money = rng.choice(["punto", "coma"])

    expected = {
        "numero_factura": numero,
        "fecha_emision": f"{y}-{m:02d}-{d:02d}",
        "ruc_emisor": ruc_e,
        "razon_social_emisor": emisor,
        "identificacion_comprador": ident,
        "nombre_comprador": nombre,
        "subtotal": subtotal,
        "iva": iva,
        "total": total,
        "forma_pago": forma,
    }

    fecha_linea = f"Fecha de emisión: {fecha_texto(y, m, d, estilo_fecha)}"
    extra_arriba, extra_abajo = [], []

    if kind == "incompleta":
        faltan = rng.sample(["identificacion_comprador", "forma_pago", "fecha_emision", "nombre_comprador"], 2)
        for k in faltan:
            expected[k] = None
    if kind == "ambigua":
        variante = i % 2
        if variante == 0:
            # Dos fechas: la de emisión y la de vencimiento, en formatos distintos.
            vy, vm, vd = y, min(m + 1, 12), d
            extra_arriba.append(f"Vence: {fecha_texto(vy, vm, vd, 'larga' if estilo_fecha != 'larga' else 'barras')}")
        else:
            # Descuento: el total a pagar no es subtotal + IVA de la lista de ítems.
            desc = round(subtotal * 0.10, 2)
            base = round(subtotal - desc, 2)
            iva = round(base * IVA, 2)
            total = round(base + iva, 2)
            expected.update({"subtotal": base, "iva": iva, "total": total})
            extra_abajo.append(("Descuento comercial (10 %)", -desc))
            extra_abajo.append(("Subtotal con descuento", base))

    L = [
        emisor.upper(),
        f"RUC: {ruc_e}",
        f"Dirección matriz: {direccion}",
        "",
        f"FACTURA No. {numero}",
    ]
    if expected["fecha_emision"] is not None:
        L.append(fecha_linea)
    L += extra_arriba
    L.append("")
    if expected["nombre_comprador"] is not None:
        L.append(f"Cliente: {nombre}")
    if expected["identificacion_comprador"] is not None:
        L.append(f"{'RUC' if len(ident) == 13 else 'C.I.'}: {ident}")
    L.append("")
    L.append("Cant.  Descripción                          P. unit.     Total")
    for cant, nombre_p, precio, t in lineas:
        L.append(f"{cant:>4}   {nombre_p:<36} {money(precio, estilo_money):>10} {money(t, estilo_money):>10}")
    L.append("")
    L.append(f"Subtotal 15 %: {money(subtotal, estilo_money)}")
    for etiqueta, valor in extra_abajo:
        L.append(f"{etiqueta}: {money(valor, estilo_money) if valor >= 0 else '-' + money(-valor, estilo_money)}")
    L.append(f"IVA 15 %: {money(expected['iva'], estilo_money)}")
    L.append(f"VALOR TOTAL: {money(expected['total'], estilo_money)}")
    if expected["forma_pago"] is not None:
        L.append(f"Forma de pago: {forma}")
    return {"input": "\n".join(L), "expected": expected}


def main():
    kinds = ["completa"] * 20 + ["incompleta"] * 6 + ["ambigua"] * 4
    out = []
    for i, kind in enumerate(kinds):
        inv = make(i, kind)
        out.append({"kind": kind, **inv})
    # Reparto estratificado: 10 de ajuste (7 completas, 2 incompletas, 1 ambigua) y 20 de prueba.
    ajuste_idx = set(range(0, 7)) | {20, 21} | {26}
    for i, inv in enumerate(out):
        inv["split"] = "ajuste" if i in ajuste_idx else "prueba"
        inv["code"] = f"F{i + 1:02d}"
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
