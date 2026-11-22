#!/usr/bin/env python3
"""
Genera dos libros Excel estilizados listos para subir como Google Sheets
en la carpeta raíz Banco Material/:
  1. Banco-OA.xlsx       — Desglose completo y legible de los 2.663 OA del colegio
  2. Banco-Material.xlsx — Inventario completo y legible de los 4.124 materiales
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def clean_text(s: str) -> str:
    return ILLEGAL_CHARACTERS_RE.sub("", s or "")

DATA_JSON = Path("/home/antigravity/for-mi-da-ble/banco-material-docente/public/data/banco-docente.json")
OUT_DIR = Path("/tmp")

CURSO_ORDER = [
    "Kínder",
    "1° Básico",
    "2° Básico",
    "3° Básico",
    "4° Básico",
    "5° Básico",
    "6° Básico",
    "7° Básico",
    "8° Básico",
    "1° Medio",
    "2° Medio",
    "3° Medio",
    "4° Medio",
    "Electivos",
    "Transversal",
    "Profesores",
]
CURSO_RANK = {c: i for i, c in enumerate(CURSO_ORDER)}

UNIT_RANK = {
    "Unidad 1": 1,
    "Unidad 2": 2,
    "Unidad 3": 3,
    "Unidad 4": 4,
    "General": 5,
    "Evaluaciones y Transversal": 6,
}

# Palette (Colegio Marina de Chile — Navy & Slate)
NAVY_DARK = "102A4C"
NAVY_MED = "1D4073"
NAVY_LIGHT = "E8F0FA"
SLATE_ZEBRA = "F8FAFC"
BORDER_COLOR = "CBD5E1"
WHITE = "FFFFFF"
INK_DARK = "0F172A"
INK_MUTED = "475569"
LINK_BLUE = "1D4ED8"

OK_BG, OK_FG = "DCFCE7", "166534"
WARN_BG, WARN_FG = "FEF3C7", "92400E"
ERR_BG, ERR_FG = "FEE2E2", "991B1B"

THIN_SIDE = Side(style="thin", color=BORDER_COLOR)
MED_NAVY = Side(style="medium", color=NAVY_DARK)
CELL_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
TOTAL_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=MED_NAVY, bottom=MED_NAVY)

FONT_TITLE = Font(name="Arial", size=14, bold=True, color=WHITE)
FONT_SUBTITLE = Font(name="Arial", size=10, italic=True, color="DCE7F7")
FONT_SECTION = Font(name="Arial", size=11, bold=True, color=NAVY_DARK)
FONT_HEADER = Font(name="Arial", size=10, bold=True, color=WHITE)
FONT_BODY = Font(name="Arial", size=10, color=INK_DARK)
FONT_BODY_BOLD = Font(name="Arial", size=10, bold=True, color=INK_DARK)
FONT_MUTED = Font(name="Arial", size=9.5, color=INK_MUTED)
FONT_LINK = Font(name="Arial", size=10, color=LINK_BLUE, underline="single")
FONT_TOTAL = Font(name="Arial", size=10.5, bold=True, color=NAVY_DARK)

FILL_TITLE = PatternFill("solid", fgColor=NAVY_DARK)
FILL_HEADER = PatternFill("solid", fgColor=NAVY_MED)
FILL_ZEBRA = PatternFill("solid", fgColor=SLATE_ZEBRA)
FILL_WHITE = PatternFill("solid", fgColor=WHITE)
FILL_TOTAL = PatternFill("solid", fgColor=NAVY_LIGHT)
FILL_OK = PatternFill("solid", fgColor=OK_BG)
FILL_WARN = PatternFill("solid", fgColor=WARN_BG)
FILL_ERR = PatternFill("solid", fgColor=ERR_BG)


def oa_sort_key(oa: str) -> tuple[int, str]:
    m = re.search(r"(\d+)", oa or "")
    return (int(m.group(1)) if m else 999, oa or "")


def curso_to_ciclo(curso: str) -> str:
    if curso in ("Kínder", "1° Básico", "2° Básico", "3° Básico", "4° Básico"):
        return "1° Ciclo"
    if curso in ("5° Básico", "6° Básico", "7° Básico", "8° Básico"):
        return "2° Ciclo"
    if curso in ("1° Medio", "2° Medio", "3° Medio", "4° Medio"):
        return "Enseñanza Media"
    if curso == "Electivos":
        return "Electivos HC (3°–4° Medio)"
    if curso == "Profesores":
        return "Profesores"
    return "Transversal y Gestión"


def doc_url(drive_id: str, kind: str) -> tuple[str, str]:
    if kind == "doc":
        return f"https://docs.google.com/document/d/{drive_id}/edit?rtpof=true&sd=true", "Abrir en Docs"
    if kind == "ppt":
        return f"https://docs.google.com/presentation/d/{drive_id}/edit?rtpof=true&sd=true", "Abrir en Slides"
    if kind == "xls":
        return f"https://docs.google.com/spreadsheets/d/{drive_id}/edit?rtpof=true&sd=true", "Abrir en Sheets"
    return f"https://drive.google.com/file/d/{drive_id}/view", "Abrir en Drive"


def folder_url(folder_id: str) -> str:
    return f"https://drive.google.com/drive/folders/{folder_id}"


def kind_label(kind: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].upper() if "." in filename else ""
    if kind == "doc":
        return f"Word ({ext})" if ext else "Word"
    if kind == "pdf":
        return "PDF"
    if kind == "ppt":
        return f"PPT ({ext})" if ext else "Presentación"
    if kind == "xls":
        return f"Excel ({ext})" if ext else "Planilla"
    return ext or "Archivo"


def style_banner(ws, max_col: int, title: str, subtitle: str) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
    c1 = ws.cell(row=1, column=1, value=title)
    c1.font = FONT_TITLE
    c1.fill = FILL_TITLE
    c1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 30

    c2 = ws.cell(row=2, column=1, value=subtitle)
    c2.font = FONT_SUBTITLE
    c2.fill = FILL_TITLE
    c2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 8


def style_table_header(ws, row: int, headers: list[str], widths: list[int]) -> None:
    ws.row_dimensions[row].height = 26
    for idx, (h, w) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=row, column=idx, value=h)
        cell.font = FONT_HEADER
        cell.fill = FILL_HEADER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = CELL_BORDER
        ws.column_dimensions[get_column_letter(idx)].width = w


def apply_status_badge(cell, status: str) -> None:
    cell.alignment = Alignment(horizontal="center", vertical="center")
    if status.startswith("Cubierto") or status.startswith("Completa"):
        cell.fill = FILL_OK
        cell.font = Font(name="Arial", size=9.5, bold=True, color=OK_FG)
    elif status.startswith("Parcial"):
        cell.fill = FILL_WARN
        cell.font = Font(name="Arial", size=9.5, bold=True, color=WARN_FG)
    else:
        cell.fill = FILL_ERR
        cell.font = Font(name="Arial", size=9.5, bold=True, color=ERR_FG)


def set_link_cell(cell, url: str, label: str, fill) -> None:
    cell.value = label
    cell.hyperlink = url
    cell.font = FONT_LINK
    cell.fill = fill
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = CELL_BORDER


def build_lookup_maps(data: dict[str, Any]):
    # Folder lookup: (curso, asig, unidad) -> folder_id, and (curso, "", "") -> course_folder_id
    folder_by_unit: dict[tuple[str, str, str], str] = {}
    folder_by_course: dict[str, str] = {}
    folder_by_asig: dict[tuple[str, str], str] = {}
    for f in data["folders"]:
        c, a, u, fid = f.get("curso", ""), f.get("asig", ""), f.get("unidad", ""), f.get("id", "")
        if c and a and u:
            folder_by_unit[(c, a, u)] = fid
        elif c and a and not u:
            folder_by_asig[(c, a)] = fid
        elif c and not a and not u:
            folder_by_course[c] = fid
        elif f.get("ruta") == "Material/Transversal y Gestión":
            folder_by_course["Transversal"] = fid

    # OA material count lookup from coverage: (curso, asig, unidad, oa) -> (covered, mat_count)
    oa_cov: dict[tuple[str, str, str, str], tuple[int, int]] = {}
    for cov in data["coverage"]:
        c, a, u = cov["curso"], cov["asig"], cov["unidad"]
        for oa_code, is_cov, mat_cnt in cov["oas"]:
            oa_cov[(c, a, u, oa_code)] = (int(is_cov), int(mat_cnt))

    # Material count per course
    dict_c = data["dict"]["cursos"]
    mats_by_course: dict[str, int] = defaultdict(int)
    for m in data["materials"]:
        mats_by_course[dict_c[m[7]]] += 1

    return folder_by_unit, folder_by_asig, folder_by_course, oa_cov, mats_by_course


def build_banco_oa(data: dict[str, Any], out_path: Path) -> dict[str, int]:
    wb = openpyxl.Workbook()
    folder_by_unit, folder_by_asig, folder_by_course, oa_cov, mats_by_course = build_lookup_maps(data)

    # Flatten all OAs cleanly
    all_oas: list[dict[str, Any]] = []
    for key, entries in data["oaCatalog"].items():
        curso, asig, unidad = key.split("|", 2)
        ciclo = curso_to_ciclo(curso)
        fid = (
            folder_by_unit.get((curso, asig, unidad))
            or folder_by_asig.get((curso, asig))
            or folder_by_course.get(curso)
            or data["meta"]["material_folder_id"]
        )
        for e in entries:
            oa_code = e["oa"]
            is_cov, mat_cnt = oa_cov.get((curso, asig, unidad, oa_code), (0, 0))
            all_oas.append(
                {
                    "ciclo": ciclo,
                    "curso": curso,
                    "asig": asig,
                    "unidad": unidad,
                    "u_nom": clean_text(e.get("u_nom", "") or ""),
                    "eje": clean_text(e.get("eje", "") or ""),
                    "oa": clean_text(oa_code),
                    "desc": clean_text((e.get("desc", "") or "").strip()),
                    "mat_cnt": mat_cnt,
                    "covered": is_cov == 1 or mat_cnt > 0,
                    "folder_id": fid,
                }
            )

    all_oas.sort(
        key=lambda x: (
            CURSO_RANK.get(x["curso"], 99),
            x["asig"].lower(),
            UNIT_RANK.get(x["unidad"], 99),
            oa_sort_key(x["oa"]),
        )
    )

    fecha = datetime.now().strftime("%d-%m-%Y")

    # ── TAB 1: Resumen Colegio ──
    ws_sum = wb.active
    ws_sum.title = "Resumen Colegio"
    ws_sum.views.sheetView[0].showGridLines = True
    style_banner(
        ws_sum,
        8,
        "COLEGIO MARINA DE CHILE — BANCO DE OBJETIVOS DE APRENDIZAJE (BANCO-OA)",
        f"Desglose completo de los {len(all_oas):,} OA oficiales MINEDUC (1° Básico a 4° Medio + 27 Electivos HC) · Actualizado {fecha}".replace(",", "."),
    )

    headers_sum = [
        "Ciclo",
        "Curso / Nivel",
        "Asignaturas",
        "Total OA",
        "OA con Material",
        "OA sin Material",
        "% Cobertura OA",
        "Total Recursos en Carpeta",
    ]
    widths_sum = [24, 20, 14, 13, 17, 17, 16, 24]
    style_table_header(ws_sum, 4, headers_sum, widths_sum)

    # Group by course
    by_course: dict[str, dict[str, Any]] = {}
    for row in all_oas:
        c = row["curso"]
        g = by_course.setdefault(c, {"ciclo": row["ciclo"], "asigs": set(), "tot": 0, "cov": 0})
        g["asigs"].add(row["asig"])
        g["tot"] += 1
        if row["covered"]:
            g["cov"] += 1

    ordered_courses = sorted(by_course.keys(), key=lambda c: CURSO_RANK.get(c, 99))
    r_idx = 5
    for i, curso in enumerate(ordered_courses):
        g = by_course[curso]
        fill = FILL_ZEBRA if i % 2 == 1 else FILL_WHITE
        vals = [
            g["ciclo"],
            curso,
            len(g["asigs"]),
            g["tot"],
            g["cov"],
            f"=D{r_idx}-E{r_idx}",
            f"=IF(D{r_idx}>0,E{r_idx}/D{r_idx},0)",
            mats_by_course.get(curso, 0),
        ]
        ws_sum.row_dimensions[r_idx].height = 22
        for col, v in enumerate(vals, start=1):
            cell = ws_sum.cell(row=r_idx, column=col, value=v)
            cell.font = FONT_BODY_BOLD if col == 2 else FONT_BODY
            cell.fill = fill
            cell.border = CELL_BORDER
            if col in (3, 4, 5, 6, 8):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = "#,##0"
            elif col == 7:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = "0.0%"
                pct = (g["cov"] / g["tot"] * 100) if g["tot"] else 0
                if pct >= 60:
                    cell.fill = FILL_OK
                    cell.font = Font(name="Arial", size=10, bold=True, color=OK_FG)
                elif pct >= 30:
                    cell.fill = FILL_WARN
                    cell.font = Font(name="Arial", size=10, bold=True, color=WARN_FG)
                else:
                    cell.fill = FILL_ERR
                    cell.font = Font(name="Arial", size=10, bold=True, color=ERR_FG)
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
        r_idx += 1

    # Total row
    last_data_row = r_idx - 1
    ws_sum.row_dimensions[r_idx].height = 25
    tot_vals = [
        "TOTAL COLEGIO",
        f"{len(ordered_courses)} niveles",
        "—",
        f"=SUM(D5:D{last_data_row})",
        f"=SUM(E5:E{last_data_row})",
        f"=SUM(F5:F{last_data_row})",
        f"=IF(D{r_idx}>0,E{r_idx}/D{r_idx},0)",
        f"=SUM(H5:H{last_data_row})",
    ]
    for col, v in enumerate(tot_vals, start=1):
        cell = ws_sum.cell(row=r_idx, column=col, value=v)
        cell.font = FONT_TOTAL
        cell.fill = FILL_TOTAL
        cell.border = TOTAL_BORDER
        if col in (4, 5, 6, 8):
            cell.alignment = Alignment(horizontal="right", vertical="center")
            cell.number_format = "#,##0"
        elif col == 7:
            cell.alignment = Alignment(horizontal="right", vertical="center")
            cell.number_format = "0.0%"
        elif col == 3:
            cell.alignment = Alignment(horizontal="center", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center")

    # Helpful reading guide box below summary
    guide_row = r_idx + 2
    ws_sum.cell(row=guide_row, column=1, value="Guía rápida de pestañas:").font = FONT_SECTION
    guide_lines = [
        ("1° Ciclo (1° a 4° Básico)", "Todos los OA de Formación General de 1° a 4° Básico, ordenados por curso, asignatura y unidad."),
        ("2° Ciclo (5° a 8° Básico)", "Todos los OA de Formación General de 5° a 8° Básico, ordenados por curso, asignatura y unidad."),
        ("Media FG (1° a 4° Medio)", "Todos los OA de Formación General de 1° a 4° Medio."),
        ("Electivos HC (3° y 4° Medio)", "Los 165 OA de las 27 asignaturas del Plan Diferenciado Humanista-Científico."),
        ("Todos los OA (2.663)", "Tabla maestra única del colegio completo con filtros activos por ciclo, curso, asignatura, unidad y estado."),
    ]
    for offset, (tab_name, desc) in enumerate(guide_lines, start=1):
        rr = guide_row + offset
        ws_sum.row_dimensions[rr].height = 20
        c_tab = ws_sum.cell(row=rr, column=1, value=tab_name)
        c_tab.font = FONT_BODY_BOLD
        ws_sum.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=8)
        c_desc = ws_sum.cell(row=rr, column=2, value=desc)
        c_desc.font = FONT_MUTED

    ws_sum.freeze_panes = "A5"

    # Helper to populate OA detail tabs
    def add_oa_sheet(title: str, subtitle: str, rows: list[dict[str, Any]], include_ciclo: bool = False, is_electivo: bool = False):
        ws = wb.create_sheet(title=title)
        if is_electivo:
            headers = [
                "Plan",
                "Asignatura Electiva",
                "Ámbito / Unidad",
                "OA",
                "Descripción del Objetivo de Aprendizaje (MINEDUC)",
                "N° Materiales",
                "Estado Cobertura",
                "Carpeta Drive",
            ]
            widths = [22, 36, 18, 10, 74, 14, 16, 16]
        elif include_ciclo:
            headers = [
                "Ciclo",
                "Curso",
                "Asignatura",
                "Unidad",
                "Nombre de la Unidad",
                "Eje Curricular",
                "OA",
                "Descripción del Objetivo de Aprendizaje (MINEDUC)",
                "N° Materiales",
                "Estado Cobertura",
                "Carpeta Drive",
            ]
            widths = [20, 13, 30, 12, 26, 24, 10, 72, 13, 16, 15]
        else:
            headers = [
                "Curso",
                "Asignatura",
                "Unidad",
                "Nombre de la Unidad",
                "Eje Curricular",
                "OA",
                "Descripción del Objetivo de Aprendizaje (MINEDUC)",
                "N° Materiales",
                "Estado Cobertura",
                "Carpeta Drive",
            ]
            widths = [13, 30, 12, 26, 24, 10, 74, 13, 16, 15]

        style_banner(ws, len(headers), f"BANCO-OA · {title.upper()}", subtitle)
        style_table_header(ws, 4, headers, widths)

        for idx, item in enumerate(rows, start=5):
            fill = FILL_ZEBRA if idx % 2 == 1 else FILL_WHITE
            status = "Cubierto" if item["covered"] else "Sin material"
            if is_electivo:
                vals = [
                    "Plan Diferenciado HC",
                    item["asig"],
                    item["unidad"],
                    item["oa"],
                    item["desc"],
                    item["mat_cnt"],
                    status,
                ]
                desc_col, cnt_col, status_col, link_col = 5, 6, 7, 8
            elif include_ciclo:
                vals = [
                    item["ciclo"],
                    item["curso"],
                    item["asig"],
                    item["unidad"],
                    item["u_nom"],
                    item["eje"],
                    item["oa"],
                    item["desc"],
                    item["mat_cnt"],
                    status,
                ]
                desc_col, cnt_col, status_col, link_col = 8, 9, 10, 11
            else:
                vals = [
                    item["curso"],
                    item["asig"],
                    item["unidad"],
                    item["u_nom"],
                    item["eje"],
                    item["oa"],
                    item["desc"],
                    item["mat_cnt"],
                    status,
                ]
                desc_col, cnt_col, status_col, link_col = 7, 8, 9, 10

            # Estimate comfortable row height from description length
            lines = max(1, (len(item["desc"]) // 78) + 1)
            ws.row_dimensions[idx].height = min(105, max(22, lines * 14.5))

            for col, v in enumerate(vals, start=1):
                c = ws.cell(row=idx, column=col, value=v)
                c.fill = fill
                c.border = CELL_BORDER
                if col == status_col:
                    apply_status_badge(c, str(v))
                elif col == cnt_col:
                    c.font = FONT_BODY_BOLD if int(v) > 0 else FONT_MUTED
                    c.alignment = Alignment(horizontal="right", vertical="center")
                    c.number_format = "#,##0"
                elif col == desc_col:
                    c.font = FONT_BODY
                    c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
                elif col == (4 if is_electivo else (7 if include_ciclo else 6)):  # OA code
                    c.font = FONT_BODY_BOLD
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.font = FONT_BODY
                    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

            set_link_cell(ws.cell(row=idx, column=link_col), folder_url(item["folder_id"]), "Ver carpeta", fill)

        ws.freeze_panes = "A5"
        ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{max(4, len(rows) + 4)}"

    c1_rows = [r for r in all_oas if r["ciclo"] == "1° Ciclo"]
    c2_rows = [r for r in all_oas if r["ciclo"] == "2° Ciclo"]
    med_rows = [r for r in all_oas if r["ciclo"] == "Enseñanza Media"]
    el_rows = [r for r in all_oas if r["curso"] == "Electivos"]

    add_oa_sheet("1° Ciclo (1° a 4° Básico)", f"{len(c1_rows)} OA oficiales MINEDUC · Educación Básica 1° Ciclo", c1_rows)
    add_oa_sheet("2° Ciclo (5° a 8° Básico)", f"{len(c2_rows)} OA oficiales MINEDUC · Educación Básica 2° Ciclo", c2_rows)
    add_oa_sheet("Media FG (1° a 4° Medio)", f"{len(med_rows)} OA oficiales MINEDUC · Formación General Enseñanza Media", med_rows)
    add_oa_sheet("Electivos HC (3° y 4° Medio)", f"{len(el_rows)} OA oficiales MINEDUC · 27 Asignaturas Plan Diferenciado HC", el_rows, is_electivo=True)
    add_oa_sheet(f"Todos los OA ({len(all_oas)})", f"Tabla maestra consolidada del colegio ({len(all_oas)} OA) — usa los filtros de la fila 4", all_oas, include_ciclo=True)

    wb.save(out_path)
    return {
        "total": len(all_oas),
        "c1": len(c1_rows),
        "c2": len(c2_rows),
        "media": len(med_rows),
        "electivos": len(el_rows),
    }


def build_banco_material(data: dict[str, Any], out_path: Path) -> dict[str, int]:
    wb = openpyxl.Workbook()
    folder_by_unit, folder_by_asig, folder_by_course, _, _ = build_lookup_maps(data)

    ciclos_d = data["dict"]["ciclos"]
    cursos_d = data["dict"]["cursos"]
    asigs_d = data["dict"]["asigs"]
    unidades_d = data["dict"]["unidades"]
    tipos_d = data["dict"]["tipos"]

    all_mats: list[dict[str, Any]] = []
    for row in data["materials"]:
        mid, drive_id, name, kind, fid, anio, ci, cui, ai, el, ui, ti, oas, extracto = row
        curso = cursos_d[cui]
        asig = asigs_d[ai]
        unidad = unidades_d[ui]
        tipo = tipos_d[ti]
        ciclo = curso_to_ciclo(curso)
        url, link_lbl = doc_url(drive_id, kind)
        clean_extract = clean_text(re.sub(r"\s+", " ", (extracto or "")).strip())
        if len(clean_extract) > 220:
            clean_extract = clean_extract[:217].rstrip() + "..."
        all_mats.append(
            {
                "id": mid,
                "drive_id": drive_id,
                "name": clean_text(name),
                "kind": kind,
                "formato": kind_label(kind, name),
                "folder_id": fid or folder_by_unit.get((curso, asig, unidad)) or folder_by_course.get(curso) or data["meta"]["material_folder_id"],
                "anio": int(anio) if anio else 0,
                "ciclo": ciclo,
                "curso": curso,
                "asig": asig,
                "unidad": unidad,
                "tipo": tipo,
                "oas": ", ".join(oas) if oas else "",
                "has_oa": len(oas) > 0,
                "extracto": clean_extract,
                "doc_url": url,
                "doc_label": link_lbl,
            }
        )

    all_mats.sort(
        key=lambda x: (
            CURSO_RANK.get(x["curso"], 99),
            x["asig"].lower(),
            UNIT_RANK.get(x["unidad"], 99),
            x["tipo"].lower(),
            x["name"].lower(),
        )
    )

    fecha = datetime.now().strftime("%d-%m-%Y")

    # ── TAB 1: Resumen del Banco ──
    ws_sum = wb.active
    ws_sum.title = "Resumen del Banco"
    style_banner(
        ws_sum,
        10,
        "COLEGIO MARINA DE CHILE — BANCO DE MATERIAL PEDAGÓGICO (BANCO-MATERIAL)",
        f"Inventario completo y depurado de {len(all_mats):,} recursos (0 PII) alojados en la carpeta única Material/ · Actualizado {fecha}".replace(",", "."),
    )

    headers_sum = [
        "Ciclo / Área",
        "Curso / Categoría",
        "Total Archivos",
        "Word (.docx/.doc)",
        "PDF",
        "PPT / Excel / Otros",
        "Con OA Etiquetado",
        "Año 2025",
        "Año 2026",
        "Carpeta en Drive",
    ]
    widths_sum = [24, 20, 14, 17, 11, 18, 18, 12, 12, 18]
    style_table_header(ws_sum, 4, headers_sum, widths_sum)

    by_course: dict[str, dict[str, int]] = {}
    for m in all_mats:
        g = by_course.setdefault(
            m["curso"],
            {"tot": 0, "word": 0, "pdf": 0, "other": 0, "oa": 0, "y25": 0, "y26": 0},
        )
        g["tot"] += 1
        if m["kind"] == "doc":
            g["word"] += 1
        elif m["kind"] == "pdf":
            g["pdf"] += 1
        else:
            g["other"] += 1
        if m["has_oa"]:
            g["oa"] += 1
        if m["anio"] == 2025:
            g["y25"] += 1
        elif m["anio"] == 2026:
            g["y26"] += 1

    ordered_courses = sorted(by_course.keys(), key=lambda c: CURSO_RANK.get(c, 99))
    r_idx = 5
    for i, curso in enumerate(ordered_courses):
        g = by_course[curso]
        fill = FILL_ZEBRA if i % 2 == 1 else FILL_WHITE
        ws_sum.row_dimensions[r_idx].height = 22
        vals = [
            curso_to_ciclo(curso),
            curso,
            g["tot"],
            g["word"],
            g["pdf"],
            g["other"],
            g["oa"],
            g["y25"],
            g["y26"],
        ]
        for col, v in enumerate(vals, start=1):
            c = ws_sum.cell(row=r_idx, column=col, value=v)
            c.font = FONT_BODY_BOLD if col in (2, 3) else FONT_BODY
            c.fill = fill
            c.border = CELL_BORDER
            if col >= 3:
                c.alignment = Alignment(horizontal="right", vertical="center")
                c.number_format = "#,##0"
            else:
                c.alignment = Alignment(horizontal="left", vertical="center")

        cfid = folder_by_course.get(curso) or data["meta"]["material_folder_id"]
        set_link_cell(ws_sum.cell(row=r_idx, column=10), folder_url(cfid), "Abrir carpeta", fill)
        r_idx += 1

    last_row = r_idx - 1
    ws_sum.row_dimensions[r_idx].height = 25
    tot_vals = [
        "TOTAL BANCO",
        f"{len(ordered_courses)} categorías",
        f"=SUM(C5:C{last_row})",
        f"=SUM(D5:D{last_row})",
        f"=SUM(E5:E{last_row})",
        f"=SUM(F5:F{last_row})",
        f"=SUM(G5:G{last_row})",
        f"=SUM(H5:H{last_row})",
        f"=SUM(I5:I{last_row})",
    ]
    for col, v in enumerate(tot_vals, start=1):
        c = ws_sum.cell(row=r_idx, column=col, value=v)
        c.font = FONT_TOTAL
        c.fill = FILL_TOTAL
        c.border = TOTAL_BORDER
        if col >= 3:
            c.alignment = Alignment(horizontal="right", vertical="center")
            c.number_format = "#,##0"
        else:
            c.alignment = Alignment(horizontal="left", vertical="center")
    set_link_cell(
        ws_sum.cell(row=r_idx, column=10),
        data["meta"]["material_folder_url"],
        "Carpeta Material/",
        FILL_TOTAL,
    )
    ws_sum.cell(row=r_idx, column=10).border = TOTAL_BORDER

    # Guide below summary
    g_row = r_idx + 2
    ws_sum.cell(row=g_row, column=1, value="Guía rápida de uso:").font = FONT_SECTION
    notes = [
        ("Enlaces directos", "Los documentos Word (.docx/.doc) abren directo en Google Docs (todas las páginas); los PDF abren en Google Drive."),
        ("Pestañas por ciclo", "Usa 1° Ciclo, 2° Ciclo, Enseñanza Media, Electivos HC o Transversal y Profesores para navegar sin ruido."),
        ("Todo el Material", "Contiene los 4.124 recursos en una sola tabla filtrable por curso, asignatura, unidad, tipo, formato o año."),
        ("Cobertura por Unidad", "Muestra qué unidades tienen material suficiente y exactamente qué OA faltan por cubrir."),
    ]
    for off, (k, txt) in enumerate(notes, start=1):
        rr = g_row + off
        ws_sum.row_dimensions[rr].height = 20
        ws_sum.cell(row=rr, column=1, value=k).font = FONT_BODY_BOLD
        ws_sum.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=10)
        ws_sum.cell(row=rr, column=2, value=txt).font = FONT_MUTED

    ws_sum.freeze_panes = "A5"

    # Helper for Material detail sheets
    def add_mat_sheet(title: str, subtitle: str, rows: list[dict[str, Any]], include_ciclo: bool = False):
        ws = wb.create_sheet(title=title)
        if include_ciclo:
            headers = [
                "Ciclo / Área",
                "Curso",
                "Asignatura",
                "Unidad",
                "Tipo de Recurso",
                "Formato",
                "Año",
                "Nombre del Archivo",
                "OA Vinculados",
                "Resumen del Contenido",
                "Abrir Documento",
                "Carpeta Drive",
            ]
            widths = [20, 13, 28, 13, 17, 13, 8, 44, 18, 46, 16, 15]
        else:
            headers = [
                "Curso",
                "Asignatura",
                "Unidad",
                "Tipo de Recurso",
                "Formato",
                "Año",
                "Nombre del Archivo",
                "OA Vinculados",
                "Resumen del Contenido",
                "Abrir Documento",
                "Carpeta Drive",
            ]
            widths = [13, 28, 13, 17, 13, 8, 46, 18, 48, 16, 15]

        style_banner(ws, len(headers), f"BANCO-MATERIAL · {title.upper()}", subtitle)
        style_table_header(ws, 4, headers, widths)

        for idx, m in enumerate(rows, start=5):
            fill = FILL_ZEBRA if idx % 2 == 1 else FILL_WHITE
            if include_ciclo:
                vals = [
                    m["ciclo"],
                    m["curso"],
                    m["asig"],
                    m["unidad"],
                    m["tipo"],
                    m["formato"],
                    m["anio"] or "",
                    m["name"],
                    m["oas"] or "—",
                    m["extracto"],
                ]
                anio_col, name_col, oa_col, ext_col, doc_col, fld_col = 7, 8, 9, 10, 11, 12
            else:
                vals = [
                    m["curso"],
                    m["asig"],
                    m["unidad"],
                    m["tipo"],
                    m["formato"],
                    m["anio"] or "",
                    m["name"],
                    m["oas"] or "—",
                    m["extracto"],
                ]
                anio_col, name_col, oa_col, ext_col, doc_col, fld_col = 6, 7, 8, 9, 10, 11

            lines = max(1, len(m["name"]) // 44 + 1, len(m["extracto"]) // 48 + 1)
            ws.row_dimensions[idx].height = min(68, max(22, lines * 14))

            for col, v in enumerate(vals, start=1):
                c = ws.cell(row=idx, column=col, value=v)
                c.fill = fill
                c.border = CELL_BORDER
                if col == anio_col:
                    c.font = FONT_BODY
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif col == name_col:
                    c.font = FONT_BODY_BOLD
                    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                elif col == oa_col:
                    c.font = Font(name="Arial", size=9.5, bold=m["has_oa"], color=OK_FG if m["has_oa"] else INK_MUTED)
                    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                elif col == ext_col:
                    c.font = FONT_MUTED
                    c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
                else:
                    c.font = FONT_BODY
                    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

            set_link_cell(ws.cell(row=idx, column=doc_col), m["doc_url"], m["doc_label"], fill)
            set_link_cell(ws.cell(row=idx, column=fld_col), folder_url(m["folder_id"]), "Ver carpeta", fill)

        ws.freeze_panes = "A5"
        ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{max(4, len(rows) + 4)}"

    c1_m = [m for m in all_mats if m["ciclo"] == "1° Ciclo"]
    c2_m = [m for m in all_mats if m["ciclo"] == "2° Ciclo"]
    med_m = [m for m in all_mats if m["ciclo"] == "Enseñanza Media"]
    el_m = [m for m in all_mats if m["curso"] == "Electivos"]
    tr_m = [m for m in all_mats if m["curso"] in ("Transversal", "Profesores")]

    add_mat_sheet("1° Ciclo (Kínder a 4°B)", f"{len(c1_m)} recursos pedagógicos · Kínder a 4° Básico", c1_m)
    add_mat_sheet("2° Ciclo (5° a 8°B)", f"{len(c2_m)} recursos pedagógicos · 5° a 8° Básico", c2_m)
    add_mat_sheet("Media (1° a 4° Medio)", f"{len(med_m)} recursos pedagógicos · Enseñanza Media Formación General", med_m)
    add_mat_sheet("Electivos HC (3° y 4°M)", f"{len(el_m)} recursos pedagógicos · Plan Diferenciado Humanista-Científico", el_m)
    add_mat_sheet("Transversal y Profesores", f"{len(tr_m)} recursos · Gestión/Transversal ({sum(1 for x in tr_m if x['curso']=='Transversal')}) y Profesores ({sum(1 for x in tr_m if x['curso']=='Profesores')})", tr_m)
    add_mat_sheet(f"Todo el Material ({len(all_mats)})", f"Tabla maestra consolidada ({len(all_mats)} recursos sin PII) — filtra en la fila 4", all_mats, include_ciclo=True)

    # ── TAB 8: Cobertura por Unidad ──
    ws_cov = wb.create_sheet(title="Cobertura por Unidad")
    headers_cov = [
        "Ciclo",
        "Curso",
        "Asignatura",
        "Unidad",
        "Total OA",
        "OA Cubiertos",
        "OA Faltantes",
        "% Cobertura",
        "N° Materiales",
        "Estado",
        "OA Faltantes por Cubrir",
        "Carpeta Drive",
    ]
    widths_cov = [20, 13, 30, 12, 11, 13, 13, 13, 13, 15, 36, 15]
    style_banner(
        ws_cov,
        len(headers_cov),
        "BANCO-MATERIAL · COBERTURA CURRICULAR POR UNIDAD",
        f"Diagnóstico de brechas OA en {len(data['coverage'])} unidades del colegio — ideal para priorizar creación de nuevo material",
    )
    style_table_header(ws_cov, 4, headers_cov, widths_cov)

    cov_sorted = sorted(
        data["coverage"],
        key=lambda x: (CURSO_RANK.get(x["curso"], 99), x["asig"].lower(), UNIT_RANK.get(x["unidad"], 99)),
    )
    for idx, cov in enumerate(cov_sorted, start=5):
        fill = FILL_ZEBRA if idx % 2 == 1 else FILL_WHITE
        tot = int(cov["tot"])
        covered = int(cov["cov"])
        missing = tot - covered
        pct = (covered / tot) if tot else 0.0
        status = "Completa" if pct >= 0.8 else ("Parcial" if pct >= 0.35 else "Crítica")
        missing_oas = ", ".join(o[0] for o in cov["oas"] if int(o[1]) == 0) or "Todos cubiertos"
        fid = (
            folder_by_unit.get((cov["curso"], cov["asig"], cov["unidad"]))
            or folder_by_asig.get((cov["curso"], cov["asig"]))
            or folder_by_course.get(cov["curso"])
            or data["meta"]["material_folder_id"]
        )
        ws_cov.row_dimensions[idx].height = 22
        vals = [
            curso_to_ciclo(cov["curso"]),
            cov["curso"],
            cov["asig"],
            cov["unidad"],
            tot,
            covered,
            missing,
            pct,
            int(cov["mats"]),
            status,
            missing_oas,
        ]
        for col, v in enumerate(vals, start=1):
            c = ws_cov.cell(row=idx, column=col, value=v)
            c.fill = fill
            c.border = CELL_BORDER
            if col == 10:
                apply_status_badge(c, str(v))
            elif col in (5, 6, 7, 9):
                c.font = FONT_BODY
                c.alignment = Alignment(horizontal="right", vertical="center")
                c.number_format = "#,##0"
            elif col == 8:
                c.font = FONT_BODY_BOLD
                c.alignment = Alignment(horizontal="right", vertical="center")
                c.number_format = "0.0%"
            elif col == 11:
                c.font = FONT_MUTED if missing == 0 else FONT_BODY
                c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            else:
                c.font = FONT_BODY_BOLD if col == 2 else FONT_BODY
                c.alignment = Alignment(horizontal="left", vertical="center")

        set_link_cell(ws_cov.cell(row=idx, column=12), folder_url(fid), "Ver carpeta", fill)

    ws_cov.freeze_panes = "A5"
    ws_cov.auto_filter.ref = f"A4:L{max(4, len(cov_sorted) + 4)}"

    wb.save(out_path)
    return {
        "total": len(all_mats),
        "c1": len(c1_m),
        "c2": len(c2_m),
        "media": len(med_m),
        "electivos": len(el_m),
        "transversal_prof": len(tr_m),
        "unidades": len(cov_sorted),
    }


def main() -> None:
    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    oa_path = OUT_DIR / "Banco-OA.xlsx"
    mat_path = OUT_DIR / "Banco-Material.xlsx"
    s_oa = build_banco_oa(data, oa_path)
    s_mat = build_banco_material(data, mat_path)
    print("Generated Banco-OA.xlsx:", s_oa, f"({oa_path.stat().st_size:,} bytes)")
    print("Generated Banco-Material.xlsx:", s_mat, f"({mat_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
