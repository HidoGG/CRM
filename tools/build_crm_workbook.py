from __future__ import annotations

import copy
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

ET.register_namespace("", MAIN_NS)
ET.register_namespace("r", REL_NS)


def qn(tag: str, ns: str = MAIN_NS) -> str:
    return f"{{{ns}}}{tag}"


def col_letter(index: int) -> str:
    result = ""
    while index:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


def inline_cell(ref: str, value: str, style: int | None = None) -> ET.Element:
    cell = ET.Element(qn("c"), {"r": ref, "t": "inlineStr"})
    if style is not None:
        cell.set("s", str(style))
    inline = ET.SubElement(cell, qn("is"))
    text = ET.SubElement(inline, qn("t"))
    if value.strip() != value:
        text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text.text = value
    return cell


def number_cell(ref: str, value: int | float, style: int | None = None) -> ET.Element:
    cell = ET.Element(qn("c"), {"r": ref})
    if style is not None:
        cell.set("s", str(style))
    ET.SubElement(cell, qn("v")).text = str(value)
    return cell


def formula_cell(
    ref: str,
    formula: str,
    cached: str | None = None,
    style: int | None = None,
    string_result: bool = True,
) -> ET.Element:
    attrs = {"r": ref}
    if string_result:
        attrs["t"] = "str"
    cell = ET.Element(qn("c"), attrs)
    if style is not None:
        cell.set("s", str(style))
    ET.SubElement(cell, qn("f")).text = formula
    if cached is not None:
        ET.SubElement(cell, qn("v")).text = cached
    return cell


def build_rows(row_specs: list[dict]) -> ET.Element:
    sheet_data = ET.Element(qn("sheetData"))
    for row_spec in row_specs:
        row = ET.SubElement(sheet_data, qn("row"), {"r": str(row_spec["r"])})
        if "ht" in row_spec:
            row.set("ht", str(row_spec["ht"]))
            row.set("customHeight", "1")
        for cell in row_spec["cells"]:
            row.append(cell)
    return sheet_data


def build_cols(widths: list[float]) -> ET.Element:
    cols = ET.Element(qn("cols"))
    for idx, width in enumerate(widths, start=1):
        ET.SubElement(
            cols,
            qn("col"),
            {"min": str(idx), "max": str(idx), "width": str(width), "customWidth": "1"},
        )
    return cols


def build_worksheet(
    row_specs: list[dict],
    widths: list[float],
    merges: list[str] | None = None,
    data_validations: list[dict] | None = None,
    auto_filter: str | None = None,
    freeze: tuple[int, int, str] | None = None,
    dimension: str | None = None,
) -> bytes:
    ws = ET.Element(qn("worksheet"))
    ET.SubElement(ws, qn("dimension"), {"ref": dimension or "A1:A1"})
    sheet_pr = ET.SubElement(ws, qn("sheetPr"))
    ET.SubElement(sheet_pr, qn("outlinePr"), {"summaryBelow": "0", "summaryRight": "0"})
    sheet_views = ET.SubElement(ws, qn("sheetViews"))
    sheet_view = ET.SubElement(sheet_views, qn("sheetView"), {"workbookViewId": "0"})
    if freeze:
        x_split, y_split, top_left = freeze
        attrs = {"topLeftCell": top_left, "activePane": "bottomRight", "state": "frozen"}
        if x_split:
            attrs["xSplit"] = f"{x_split}.0"
        if y_split:
            attrs["ySplit"] = f"{y_split}.0"
        ET.SubElement(sheet_view, qn("pane"), attrs)
    ET.SubElement(
        ws,
        qn("sheetFormatPr"),
        {"defaultRowHeight": "15.75", "defaultColWidth": "12.63", "customHeight": "1"},
    )
    ws.append(build_cols(widths))
    ws.append(build_rows(row_specs))
    if auto_filter:
        ET.SubElement(ws, qn("autoFilter"), {"ref": auto_filter})
    if merges:
        merge_cells = ET.SubElement(ws, qn("mergeCells"), {"count": str(len(merges))})
        for merge in merges:
            ET.SubElement(merge_cells, qn("mergeCell"), {"ref": merge})
    if data_validations:
        dvs = ET.SubElement(ws, qn("dataValidations"), {"count": str(len(data_validations))})
        for dv in data_validations:
            attrs = copy.deepcopy(dv)
            formula = attrs.pop("formula1")
            node = ET.SubElement(dvs, qn("dataValidation"), attrs)
            ET.SubElement(node, qn("formula1")).text = formula
    return ET.tostring(ws, encoding="utf-8", xml_declaration=False)


def build_inicio_sheet() -> bytes:
    rows = [
        {"r": 1, "ht": 26, "cells": [inline_cell("A1", "CRM de Mailing Empresas", 17)]},
        {"r": 2, "ht": 20, "cells": [inline_cell("A2", "Carga desde Inicio + importacion automatica desde Drive", 24)]},
        {
            "r": 4,
            "ht": 22,
            "cells": [
                formula_cell("A4", 'HYPERLINK("#\'Import\'!A1","Import")', "Import", 20),
                formula_cell("B4", 'HYPERLINK("#\'Postulaciones\'!A3","Postulaciones")', "Postulaciones", 20),
                formula_cell("C4", 'HYPERLINK("#\'Dominios\'!A1","Dominios")', "Dominios", 20),
                formula_cell("D4", 'HYPERLINK("#\'ImportLog\'!A1","ImportLog")', "ImportLog", 20),
                formula_cell("E4", 'HYPERLINK("#\'Manual\'!A1","Manual")', "Manual", 20),
            ],
        },
        {"r": 6, "ht": 22, "cells": [inline_cell("A6", "Carga asistida desde archivo", 35)]},
        {"r": 7, "ht": 22, "cells": [inline_cell("A7", "Archivo Drive (URL o ID)", 35), inline_cell("B7", "", 36)]},
        {
            "r": 8,
            "ht": 22,
            "cells": [
                inline_cell("A8", "Ultimo resultado", 35),
                inline_cell("B8", "Pega un link o ID en B7 y ejecuta el menu CRM > Procesar archivo de Inicio", 36),
            ],
        },
        {"r": 9, "ht": 22, "cells": [inline_cell("A9", "Correos detectados", 35), number_cell("B9", 0, 37)]},
        {"r": 10, "ht": 22, "cells": [inline_cell("A10", "Nuevos", 35), number_cell("B10", 0, 37)]},
        {"r": 11, "ht": 22, "cells": [inline_cell("A11", "Duplicados", 35), number_cell("B11", 0, 37)]},
        {"r": 12, "ht": 22, "cells": [inline_cell("A12", "Errores", 35), number_cell("B12", 0, 37)]},
        {"r": 14, "ht": 22, "cells": [inline_cell("A14", "Resumen operativo", 35)]},
        {
            "r": 15,
            "ht": 28,
            "cells": [
                formula_cell("A15", '"Leads activos"&CHAR(10)&TEXT(COUNTA(Postulaciones!B4:B500),"0")', "Leads activos\n0", 12),
                formula_cell("C15", '"Marcados para enviar"&CHAR(10)&TEXT(COUNTIF(Postulaciones!A4:A500,TRUE),"0")', "Marcados para enviar\n0", 13),
                formula_cell("E15", '"Enviados"&CHAR(10)&TEXT(COUNTIF(Historial!E2:E500,"OK"),"0")', "Enviados\n0", 14),
                formula_cell("G15", '"Errores"&CHAR(10)&TEXT(COUNTIF(Historial!E2:E500,"ERROR"),"0")', "Errores\n0", 15),
            ],
        },
        {"r": 18, "ht": 22, "cells": [inline_cell("A18", "Pasos de uso", 35)]},
        {"r": 19, "ht": 20, "cells": [inline_cell("A19", "1. Sube el archivo a tu Google Drive: acepta TXT, CSV, XLSX, PDF, PNG, JPG y JPEG.", 36)]},
        {"r": 20, "ht": 20, "cells": [inline_cell("A20", "2. Pega el link o ID del archivo en la celda B7.", 36)]},
        {"r": 21, "ht": 20, "cells": [inline_cell("A21", "3. Ejecuta el menu CRM > Procesar archivo de Inicio.", 36)]},
        {"r": 22, "ht": 20, "cells": [inline_cell("A22", "4. Revisa Import para corregir casos especiales antes de copiar a Postulaciones.", 36)]},
        {"r": 24, "ht": 22, "cells": [inline_cell("A24", "Reglas de inferencia", 35)]},
        {"r": 25, "ht": 20, "cells": [inline_cell("A25", "Contacto: intenta armar el nombre desde el email; si no puede, usa el valor de Configuracion!B9.", 36)]},
        {"r": 26, "ht": 20, "cells": [inline_cell("A26", "Empresa: toma el dominio base y lo normaliza con la hoja Dominios.", 36)]},
        {"r": 27, "ht": 20, "cells": [inline_cell("A27", "Duplicados: no vuelve a insertar emails ya existentes en Import o Postulaciones.", 36)]},
    ]
    return build_worksheet(
        rows,
        [26, 22, 18, 18, 18, 18, 18, 18],
        merges=["A1:H1", "A2:H2", "A6:H6", "B7:H7", "B8:H8", "A14:H14", "A18:H18", "A24:H24"],
        dimension="A1:H27",
    )


def build_import_sheet() -> bytes:
    headers = [
        "Email",
        "Empresa",
        "Contacto",
        "Frecuencia",
        "TemplateKey",
        "NotaPersonal",
        "Adjuntar",
        "Adjunto",
        "EstadoImportacion",
        "ObservacionImportacion",
        "OrigenArchivo",
        "FechaImportacion",
    ]
    rows = [{"r": 1, "cells": [inline_cell(f"{col_letter(i)}1", value, 20) for i, value in enumerate(headers, start=1)]}]
    for row_number in range(2, 202):
        cells = []
        for col_number in range(1, 13):
            style = 21 if col_number != 12 else 37
            cells.append(inline_cell(f"{col_letter(col_number)}{row_number}", "", style))
        rows.append({"r": row_number, "cells": cells})
    validations = [
        {
            "type": "custom",
            "allowBlank": "1",
            "showErrorMessage": "1",
            "showInputMessage": "1",
            "sqref": "A2:A201",
            "errorTitle": "Email invalido",
            "error": "Ingresa un correo con formato valido.",
            "promptTitle": "Email",
            "prompt": "Usa un correo como nombre@empresa.com",
            "formula1": 'OR(A2="",AND(ISNUMBER(SEARCH("@",A2)),ISNUMBER(SEARCH(".",A2)),LEN(A2)>=5))',
        },
        {
            "type": "list",
            "allowBlank": "1",
            "showErrorMessage": "1",
            "showInputMessage": "1",
            "sqref": "D2:D201",
            "errorTitle": "Frecuencia invalida",
            "error": "Elige una frecuencia de la lista.",
            "promptTitle": "Frecuencia",
            "prompt": "Periodicidad sugerida para el contacto.",
            "formula1": '"Diaria,Semanal,Quincenal,Mensual,Manual"',
        },
        {
            "type": "list",
            "allowBlank": "1",
            "showErrorMessage": "1",
            "showInputMessage": "1",
            "sqref": "E2:E201",
            "errorTitle": "Template invalido",
            "error": "Elige una plantilla existente.",
            "promptTitle": "Template",
            "prompt": "Clave del mensaje a usar.",
            "formula1": '"cv_tecnico_general,cv_experiencia_sin_titulo,cv_ingeniero_junior,seguimiento_7_dias,reactivacion_rrhh,presentacion_oilgas"',
        },
        {
            "type": "list",
            "allowBlank": "1",
            "showErrorMessage": "1",
            "showInputMessage": "1",
            "sqref": "G2:G201",
            "errorTitle": "Valor invalido",
            "error": "Usa SI o NO.",
            "promptTitle": "Adjuntar",
            "prompt": "SI adjunta CV; NO omite el archivo.",
            "formula1": '"SI,NO"',
        },
        {
            "type": "list",
            "allowBlank": "1",
            "showErrorMessage": "1",
            "showInputMessage": "1",
            "sqref": "I2:I201",
            "errorTitle": "Estado invalido",
            "error": "Usa un estado permitido.",
            "promptTitle": "Estado",
            "prompt": "Resultado de la importacion.",
            "formula1": '"PENDIENTE,LISTO,DUPLICADO,ERROR,IMPORTADO"',
        },
    ]
    return build_worksheet(
        rows,
        [30, 22, 22, 16, 22, 32, 12, 34, 18, 34, 26, 18],
        data_validations=validations,
        auto_filter="$A$1:$L$201",
        freeze=(0, 1, "A2"),
        dimension="A1:L201",
    )


def build_config_sheet() -> bytes:
    items = [
        ("AdjuntoDefaultId", "14D1dAtw9FTNE0shb5gs3Aj2XV4HZi9tS"),
        ("ModoPrueba", "NO"),
        ("CorreoPrueba", "gabriel.hid.orl@gmail.com"),
        ("CapPorCorrida", 0),
        ("FrecuenciaDefault", "Mensual"),
        ("TemplateDefault", "presentacion_oilgas"),
        ("AdjuntarDefault", "SI"),
        ("ContactoFallback", "A quien corresponda"),
        ("CarpetaImportacionId", ""),
        ("UltimoArchivoImportado", ""),
        ("OCRLanguage", "es"),
    ]
    rows = [{"r": 1, "ht": 24, "cells": [inline_cell("A1", "Clave", 35), inline_cell("B1", "Valor", 35)]}]
    for idx, (key, value) in enumerate(items, start=2):
        cells = [inline_cell(f"A{idx}", key, 36)]
        if isinstance(value, (int, float)):
            cells.append(number_cell(f"B{idx}", value, 37))
        else:
            cells.append(inline_cell(f"B{idx}", value, 37))
        rows.append({"r": idx, "ht": 21, "cells": cells})
    validations = [
        {"type": "list", "allowBlank": "1", "showErrorMessage": "1", "sqref": "B3", "formula1": '"SI,NO"'},
        {"type": "list", "allowBlank": "1", "showErrorMessage": "1", "sqref": "B8", "formula1": '"SI,NO"'},
    ]
    return build_worksheet(rows, [26, 44], data_validations=validations, dimension="A1:B12")


def build_manual_sheet() -> bytes:
    rows = [
        {"r": 1, "ht": 26, "cells": [inline_cell("A1", "MANUAL DE USO Y MANTENIMIENTO", 17)]},
        {"r": 2, "ht": 28, "cells": [inline_cell("A2", "Inicio", 35), inline_cell("B2", "Pega el link o ID del archivo en Inicio!B7 y ejecuta el menu CRM > Procesar archivo de Inicio.", 36)]},
        {"r": 3, "ht": 28, "cells": [inline_cell("A3", "Tipos de archivo", 35), inline_cell("B3", "Acepta TXT, CSV, XLSX, PDF e imagenes (PNG/JPG/JPEG) usando Drive con OCR.", 36)]},
        {"r": 4, "ht": 28, "cells": [inline_cell("A4", "Inferencia", 35), inline_cell("B4", "Empresa se toma del dominio; Contacto intenta formarse desde el email y si no puede usa el fallback.", 36)]},
        {"r": 5, "ht": 28, "cells": [inline_cell("A5", "Import", 35), inline_cell("B5", "Revisa EstadoImportacion y ObservacionImportacion antes de mover datos a Postulaciones.", 36)]},
        {"r": 6, "ht": 28, "cells": [inline_cell("A6", "Dominios", 35), inline_cell("B6", "Completa la hoja Dominios para normalizar nombres como TGS, YPF o Tecpetrol.", 36)]},
        {"r": 7, "ht": 28, "cells": [inline_cell("A7", "Configuracion", 35), inline_cell("B7", "Mantiene defaults globales para importacion: frecuencia, template, adjunto y fallback de contacto.", 36)]},
        {"r": 8, "ht": 28, "cells": [inline_cell("A8", "ImportLog", 35), inline_cell("B8", "Cada corrida deja un resumen con cantidad de correos detectados, nuevos, duplicados y errores.", 36)]},
        {"r": 9, "ht": 28, "cells": [inline_cell("A9", "Seguridad", 35), inline_cell("B9", "Los duplicados no se reinsertan y las filas nuevas entran primero en Import para revision.", 36)]},
    ]
    return build_worksheet(rows, [24, 92], merges=["A1:B1"], auto_filter="$A$1:$B$9", freeze=(0, 1, "A2"), dimension="A1:B9")


def build_dominios_sheet() -> bytes:
    rows = [
        {"r": 1, "ht": 22, "cells": [inline_cell("A1", "DominioBase", 20), inline_cell("B1", "EmpresaNormalizada", 20)]},
        {"r": 2, "cells": [inline_cell("A2", "tgs", 21), inline_cell("B2", "TGS", 21)]},
        {"r": 3, "cells": [inline_cell("A3", "ypf", 21), inline_cell("B3", "YPF", 21)]},
        {"r": 4, "cells": [inline_cell("A4", "tecpetrol", 21), inline_cell("B4", "Tecpetrol", 21)]},
        {"r": 5, "cells": [inline_cell("A5", "techint", 21), inline_cell("B5", "Techint", 21)]},
        {"r": 6, "cells": [inline_cell("A6", "slb", 21), inline_cell("B6", "SLB", 21)]},
        {"r": 8, "cells": [inline_cell("A8", "Edita esta hoja para mejorar la deteccion de empresas por dominio.", 36)]},
    ]
    return build_worksheet(rows, [24, 34], auto_filter="$A$1:$B$6", freeze=(0, 1, "A2"), dimension="A1:B8")


def build_import_log_sheet() -> bytes:
    headers = ["FechaHora", "Archivo", "TipoMime", "CorreosDetectados", "Nuevos", "Duplicados", "Errores", "Detalle"]
    rows = [{"r": 1, "cells": [inline_cell(f"{col_letter(i)}1", value, 20) for i, value in enumerate(headers, start=1)]}]
    for row_number in range(2, 102):
        cells = []
        for col_number in range(1, 9):
            style = 37 if col_number in (4, 5, 6, 7) else 21
            cells.append(inline_cell(f"{col_letter(col_number)}{row_number}", "", style))
        rows.append({"r": row_number, "cells": cells})
    return build_worksheet(
        rows,
        [22, 28, 24, 18, 12, 14, 12, 50],
        auto_filter="$A$1:$H$101",
        freeze=(0, 1, "A2"),
        dimension="A1:H101",
    )


def update_workbook_xml(xml_bytes: bytes) -> bytes:
    root = ET.fromstring(xml_bytes)
    sheets = root.find(qn("sheets"))
    existing_names = {sheet.attrib["name"] for sheet in sheets}
    if "Dominios" not in existing_names:
        ET.SubElement(sheets, qn("sheet"), {"name": "Dominios", "sheetId": "8", qn("id", REL_NS): "rId12"})
    if "ImportLog" not in existing_names:
        ET.SubElement(sheets, qn("sheet"), {"name": "ImportLog", "sheetId": "9", qn("id", REL_NS): "rId13"})
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)


def update_workbook_rels(xml_bytes: bytes) -> bytes:
    root = ET.fromstring(xml_bytes)
    existing = {rel.attrib["Id"] for rel in root.findall(f"{{{PKG_REL_NS}}}Relationship")}
    if "rId12" not in existing:
        ET.SubElement(
            root,
            f"{{{PKG_REL_NS}}}Relationship",
            {
                "Id": "rId12",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
                "Target": "worksheets/sheet8.xml",
            },
        )
    if "rId13" not in existing:
        ET.SubElement(
            root,
            f"{{{PKG_REL_NS}}}Relationship",
            {
                "Id": "rId13",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
                "Target": "worksheets/sheet9.xml",
            },
        )
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def update_content_types(xml_bytes: bytes) -> bytes:
    root = ET.fromstring(xml_bytes)
    existing = {override.attrib["PartName"] for override in root.findall(f"{{{CONTENT_NS}}}Override")}
    for part_name in ("/xl/worksheets/sheet8.xml", "/xl/worksheets/sheet9.xml"):
        if part_name not in existing:
            ET.SubElement(
                root,
                f"{{{CONTENT_NS}}}Override",
                {
                    "PartName": part_name,
                    "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
                },
            )
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def build_workbook(source: Path, target: Path) -> None:
    replacements = {
        "xl/worksheets/sheet1.xml": build_inicio_sheet(),
        "xl/worksheets/sheet2.xml": build_import_sheet(),
        "xl/worksheets/sheet4.xml": build_config_sheet(),
        "xl/worksheets/sheet7.xml": build_manual_sheet(),
        "xl/worksheets/sheet8.xml": build_dominios_sheet(),
        "xl/worksheets/sheet9.xml": build_import_log_sheet(),
    }

    with zipfile.ZipFile(source, "r") as zin, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zout:
        existing_names = set(zin.namelist())
        replaced = set()
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename in replacements:
                data = replacements[item.filename]
                replaced.add(item.filename)
            elif item.filename == "xl/workbook.xml":
                data = update_workbook_xml(data)
            elif item.filename == "xl/_rels/workbook.xml.rels":
                data = update_workbook_rels(data)
            elif item.filename == "[Content_Types].xml":
                data = update_content_types(data)
            zout.writestr(item, data)
        for filename, data in replacements.items():
            if filename not in existing_names and filename not in replaced:
                zout.writestr(filename, data)


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    source = base_dir / "Mailing Empresas - Gabriel - operativo.xlsx"
    target = base_dir / "Mailing Empresas - Gabriel - operativo importable.xlsx"
    build_workbook(source, target)
    print(target)


if __name__ == "__main__":
    main()
