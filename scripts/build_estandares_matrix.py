#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de la Matriz Estándares de Aprendizaje SIMCE × OA por Unidad
y del dataset JSON integrado en la app banco-material-docente.

Produce:
  1. public/data/estandares-oa.json
  2. public/data/matriz_estandares_oa_unidad.csv
  3. /tmp/simce_estandares/Matriz_Estandares_SIMCE_OA_por_Unidad.xlsx
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from standards_catalog_data import STANDARDS_DOCS
from standards_oa_mapping import COURSE_DOC_LINKS, OA_STANDARD_MAP

REPO_ROOT = Path(__file__).resolve().parent.parent
BANCO_JSON = REPO_ROOT / "public" / "data" / "banco-docente.json"
OUT_JSON = REPO_ROOT / "public" / "data" / "estandares-oa.json"
OUT_CSV = REPO_ROOT / "public" / "data" / "matriz_estandares_oa_unidad.csv"
OUT_ANNUAL_CSV = REPO_ROOT / "public" / "data" / "plan_anual_por_estandares.csv"
OUT_XLSX = Path("/tmp/simce_estandares/Matriz_Estandares_SIMCE_OA_por_Unidad.xlsx")

CICLO_BY_CURSO = {
    "1° Básico": "1° Ciclo",
    "2° Básico": "1° Ciclo",
    "3° Básico": "1° Ciclo",
    "4° Básico": "1° Ciclo",
    "5° Básico": "2° Ciclo",
    "6° Básico": "2° Ciclo",
    "7° Básico": "2° Ciclo",
    "8° Básico": "2° Ciclo",
    "1° Medio": "Enseñanza Media",
    "2° Medio": "Enseñanza Media",
}


def sort_units(units: list[str]) -> list[str]:
    def key(u: str) -> tuple[int, str]:
        if u.startswith("Unidad "):
            tail = u.split(" ", 1)[1]
            if tail.isdigit():
                return (0, f"{int(tail):02d}")
        if u.startswith("Transversal"):
            return (1, u)
        return (2, u)

    return sorted(units, key=key)


def oa_sort_key(oa: str) -> tuple[int, str]:
    parts = oa.split()
    if len(parts) >= 2 and parts[1].isdigit():
        return (int(parts[1]), oa)
    return (999, oa)


def main() -> None:
    with BANCO_JSON.open("r", encoding="utf-8") as f:
        banco = json.load(f)

    oa_catalog: dict[str, list[dict]] = banco["oaCatalog"]
    coverage_index: dict[tuple[str, str, str], dict] = {
        (r["curso"], r["asig"], r["unidad"]): r for r in banco["coverage"]
    }

    # Index docs & indicators
    docs_by_id = {d["docId"]: d for d in STANDARDS_DOCS}
    ind_by_code: dict[str, tuple[str, dict]] = {}
    for d in STANDARDS_DOCS:
        for ind in d["indicadores"]:
            assert ind["code"] not in ind_by_code, f"Duplicate indicator code {ind['code']}"
            ind_by_code[ind["code"]] = (d["docId"], ind)

    # Validate all mappings
    used_indicators: set[str] = set()
    missing_oas: list[str] = []

    course_links_out = []
    # unitKey ("Curso|Asig|Unidad") -> { docId, vinculo, notaVinculo, oas: [...], indicadoresUnicos: [...] }
    unit_links_out: dict[str, dict] = {}
    # For CSV & Excel detailed rows
    detailed_rows: list[dict] = []
    unit_summary_rows: list[dict] = []

    total_oa_unit_evaluated = 0
    total_oa_unit_mapped = 0
    total_oa_unit_non_simce = 0

    for curso, asig, doc_id, vinculo, nota_vinculo in COURSE_DOC_LINKS:
        doc = docs_by_id[doc_id]
        ciclo = CICLO_BY_CURSO[curso]
        ca_key = f"{curso}|{asig}"
        oa_map = OA_STANDARD_MAP[ca_key]

        # Verify all codes in oa_map belong to doc_id
        for oa_code, (codes, _sug) in oa_map.items():
            for c in codes:
                assert c in ind_by_code, f"Unknown indicator code {c} in {ca_key} {oa_code}"
                owner_doc, _ = ind_by_code[c]
                assert owner_doc == doc_id, f"Indicator {c} belongs to {owner_doc}, not {doc_id} ({ca_key} {oa_code})"
                used_indicators.add(c)

        units = sort_units(
            [k.split("|")[2] for k in oa_catalog if k.startswith(f"{curso}|{asig}|")]
        )
        assert units, f"No units found in oaCatalog for {ca_key}"

        course_links_out.append(
            {
                "ciclo": ciclo,
                "curso": curso,
                "asignatura": asig,
                "docId": doc_id,
                "vinculo": vinculo,
                "notaVinculo": nota_vinculo,
                "unidades": units,
            }
        )

        for unidad in units:
            u_key = f"{curso}|{asig}|{unidad}"
            entries = sorted(oa_catalog[u_key], key=lambda e: oa_sort_key(e["oa"]))
            cov = coverage_index.get((curso, asig, unidad))
            cov_oa_map = {code: (is_cov, cnt) for code, is_cov, cnt in (cov["oas"] if cov else [])}

            unit_ind_codes: list[str] = []
            unit_oas_out = []
            mapped_in_unit = 0
            non_simce_in_unit = 0
            ejes_simce_unit: list[str] = []
            has_elem = False
            has_adec = False
            has_avanz = False

            for e in entries:
                oa_code = e["oa"]
                oa_eje = e["eje"]
                oa_desc = e["desc"]
                total_oa_unit_evaluated += 1
                is_cov, mat_cnt = cov_oa_map.get(oa_code, (0, 0))

                if oa_code in oa_map:
                    codes, sugerencia = oa_map[oa_code]
                    mapped_in_unit += 1
                    total_oa_unit_mapped += 1
                    for c in codes:
                        if c not in unit_ind_codes:
                            unit_ind_codes.append(c)
                        _, ind = ind_by_code[c]
                        if ind["eje"] not in ejes_simce_unit:
                            ejes_simce_unit.append(ind["eje"])
                        if ind["elemental"]:
                            has_elem = True
                        if ind["adecuado"]:
                            has_adec = True
                        if ind["avanzado"]:
                            has_avanz = True
                        detailed_rows.append(
                            {
                                "ciclo": ciclo,
                                "curso": curso,
                                "asignatura": asig,
                                "unidad": unidad,
                                "oa": oa_code,
                                "eje_oa": oa_eje,
                                "descripcion_oa": oa_desc,
                                "estado_banco": f"Con material ({mat_cnt})" if is_cov else "Brecha (0 recursos)",
                                "doc_estandar": doc["fileName"],
                                "tipo_vinculo": vinculo,
                                "codigo_estandar": ind["code"],
                                "eje_estandar": ind["eje"],
                                "tema_estandar": ind["tema"],
                                "nivel_minimo": ind["nivelMinimo"],
                                "req_elemental": ind["elemental"] or "No exigido como mínimo en Nivel Elemental (abordar desde andamiaje previo).",
                                "req_adecuado": ind["adecuado"] or "Evaluado en Expectativa Curricular / Sobre Nivel Adecuado.",
                                "expectativa_avanzada": ind["avanzado"] or "Consolidar dominio autónomo en situaciones variadas o no rutinarias.",
                                "sugerencia_guia": sugerencia,
                            }
                        )
                    unit_oas_out.append(
                        {
                            "oa": oa_code,
                            "eje": oa_eje,
                            "indicadores": codes,
                            "sugerencia": sugerencia,
                        }
                    )
                else:
                    # Only Escritura / Comunicación oral in Lenguaje should be unmapped
                    is_non_lectura_leng = ("Lengua" in asig) and (oa_eje in ("Escritura", "Comunicación oral"))
                    if not is_non_lectura_leng:
                        missing_oas.append(f"{u_key} -> {oa_code} ({oa_eje})")
                    else:
                        non_simce_in_unit += 1
                        total_oa_unit_non_simce += 1

            unit_links_out[u_key] = {
                "docId": doc_id,
                "vinculo": vinculo,
                "notaVinculo": nota_vinculo,
                "indicadoresUnidad": unit_ind_codes,
                "oas": unit_oas_out,
                "totalOasUnidad": len(entries),
                "oasVinculados": mapped_in_unit,
                "oasOtroEje": non_simce_in_unit,
            }

            niveles_presentes = []
            if has_elem:
                niveles_presentes.append("Elemental")
            if has_adec:
                niveles_presentes.append("Adecuado")
            if has_avanz:
                niveles_presentes.append("Expectativa Curricular")

            unit_summary_rows.append(
                {
                    "ciclo": ciclo,
                    "curso": curso,
                    "asignatura": asig,
                    "unidad": unidad,
                    "doc_estandar": doc["fileName"],
                    "tipo_vinculo": vinculo,
                    "nota_vinculo": nota_vinculo,
                    "puntaje_elemental": doc["puntajes"]["elemental"],
                    "puntaje_adecuado": doc["puntajes"]["adecuado"],
                    "total_oas": len(entries),
                    "oas_vinculados": mapped_in_unit,
                    "oas_otro_eje": non_simce_in_unit,
                    "n_indicadores": len(unit_ind_codes),
                    "ejes_simce": " · ".join(ejes_simce_unit),
                    "codigos_estandares": ", ".join(unit_ind_codes),
                    "niveles_cubiertos": " / ".join(niveles_presentes),
                    "cobertura_banco_pct": cov["pct"] if cov else 0,
                    "materiales_banco": cov["mats"] if cov else 0,
                }
            )

    # Validation checks
    unused = sorted(set(ind_by_code.keys()) - used_indicators)
    assert not missing_oas, f"Unmapped target OAs found:\n" + "\n".join(missing_oas)
    assert not unused, f"Orphan standard indicators never mapped:\n" + "\n".join(unused)

    # Build Annual Standard-First rows (1 row per unique Course x Subject x Standard, independent of units)
    annual_std_rows: list[dict] = []
    for curso, asig, doc_id, vinculo, nota_vinculo in COURSE_DOC_LINKS:
        doc = docs_by_id[doc_id]
        ciclo = CICLO_BY_CURSO[curso]
        ca_key = f"{curso}|{asig}"
        oa_map = OA_STANDARD_MAP[ca_key]
        units = sort_units(
            [k.split("|")[2] for k in oa_catalog if k.startswith(f"{curso}|{asig}|")]
        )
        # Collect unique OAs for this course-subject across all units
        oa_info_by_code: dict[str, dict] = {}
        for u in units:
            u_key = f"{curso}|{asig}|{u}"
            cov = coverage_index.get((curso, asig, u))
            cov_oa_map = {code: (is_cov, cnt) for code, is_cov, cnt in (cov["oas"] if cov else [])}
            for e in oa_catalog[u_key]:
                oa_c = e["oa"]
                if oa_c not in oa_info_by_code:
                    oa_info_by_code[oa_c] = {
                        "oa": oa_c,
                        "eje": e["eje"],
                        "desc": e["desc"],
                        "units": [],
                        "covered": False,
                        "mats": 0,
                    }
                if u not in oa_info_by_code[oa_c]["units"]:
                    oa_info_by_code[oa_c]["units"].append(u)
                is_cov, cnt = cov_oa_map.get(oa_c, (0, 0))
                if is_cov:
                    oa_info_by_code[oa_c]["covered"] = True
                oa_info_by_code[oa_c]["mats"] += cnt

        for ind in doc["indicadores"]:
            code = ind["code"]
            involved_oas = sorted(
                [oa_c for oa_c, (codes, _sug) in oa_map.items() if code in codes and oa_c in oa_info_by_code],
                key=oa_sort_key,
            )
            if not involved_oas:
                continue
            ref_units: list[str] = []
            oa_details: list[str] = []
            oa_sugs: list[str] = []
            cov_count = 0
            for oa_c in involved_oas:
                info = oa_info_by_code[oa_c]
                if info["covered"]:
                    cov_count += 1
                for u in info["units"]:
                    short_u = "Transversal" if u.startswith("Transversal") else u
                    if short_u not in ref_units:
                        ref_units.append(short_u)
                short_desc = info["desc"].strip()
                if len(short_desc) > 220:
                    short_desc = short_desc[:217].rstrip() + "..."
                oa_details.append(f"{oa_c} ({info['eje']}): {short_desc}")
                sug = oa_map[oa_c][1]
                oa_sugs.append(f"{oa_c}: {sug}")

            annual_std_rows.append(
                {
                    "ciclo": ciclo,
                    "curso": curso,
                    "asignatura": asig,
                    "doc_estandar": doc["fileName"],
                    "tipo_vinculo": vinculo,
                    "eje_estandar": ind["eje"],
                    "codigo_estandar": code,
                    "tema_estandar": ind["tema"],
                    "nivel_minimo": ind["nivelMinimo"],
                    "req_elemental": ind["elemental"] or "No exigido como mínimo en Elemental (andamiaje previo).",
                    "req_adecuado": ind["adecuado"] or "Evaluado en Expectativa Curricular / Sobre Nivel Adecuado.",
                    "expectativa_avanzada": ind["avanzado"] or "Consolidar dominio autónomo en situaciones variadas o no rutinarias.",
                    "n_oas": len(involved_oas),
                    "oas_codigos": ", ".join(involved_oas),
                    "oas_detalle": "\n".join(oa_details),
                    "unidades_ref": ", ".join(ref_units),
                    "cobertura_oas": f"{cov_count}/{len(involved_oas)} OA con material",
                    "orientaciones": "\n".join(oa_sugs),
                }
            )

    # Build JSON for web app
    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "source_folder_url": "https://drive.google.com/drive/folders/1xzfw_bs3C0r3Fd-znc_hvdHPLP1pylE7",
            "sheet_matrix_url": "https://docs.google.com/spreadsheets/d/1oSpFEPllj4Jv_Nd5mgkcIc90_ag_ODi-JVGortwY-mI/edit",
            "totals": {
                "documentos": len(STANDARDS_DOCS),
                "indicadores": len(ind_by_code),
                "cursos_asignaturas": len(course_links_out),
                "unidades_vinculadas": len(unit_links_out),
                "oas_unidad_vinculados": total_oa_unit_mapped,
                "oas_unidad_otro_eje": total_oa_unit_non_simce,
                "filas_cruce_oa_estandar": len(detailed_rows),
                "estandares_anuales_curso": len(annual_std_rows),
            },
        },
        "docs": STANDARDS_DOCS,
        "courseLinks": course_links_out,
        "unitLinks": unit_links_out,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    # Build CSV (UTF-8 BOM for clean Excel opening)
    csv_fields = [
        "ciclo",
        "curso",
        "asignatura",
        "unidad",
        "oa",
        "eje_oa",
        "descripcion_oa",
        "estado_banco",
        "doc_estandar",
        "tipo_vinculo",
        "codigo_estandar",
        "eje_estandar",
        "tema_estandar",
        "nivel_minimo",
        "req_elemental",
        "req_adecuado",
        "expectativa_avanzada",
        "sugerencia_guia",
    ]
    csv_headers = {
        "ciclo": "Ciclo",
        "curso": "Curso",
        "asignatura": "Asignatura",
        "unidad": "Unidad",
        "oa": "OA",
        "eje_oa": "Eje OA MINEDUC",
        "descripcion_oa": "Descripción OA MINEDUC",
        "estado_banco": "Estado Banco Material",
        "doc_estandar": "Documento Estándares SIMCE",
        "tipo_vinculo": "Tipo de Vínculo",
        "codigo_estandar": "Código Estándar",
        "eje_estandar": "Dimensión / Eje Estándar",
        "tema_estandar": "Tema del Estándar",
        "nivel_minimo": "Nivel Mínimo Exigido",
        "req_elemental": "Requisito Mínimo Elemental (Inicio / Nivelación)",
        "req_adecuado": "Requisito Mínimo Adecuado (Meta Guía / Evaluación)",
        "expectativa_avanzada": "Expectativa Curricular / Sobre Adecuado (Desafío)",
        "sugerencia_guia": "Orientación para Preparar Guías y Evaluaciones",
    }
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([csv_headers[k] for k in csv_fields])
        for row in detailed_rows:
            writer.writerow([row[k] for k in csv_fields])

    # Build Annual Standard-First CSV (independent of units)
    annual_fields = [
        "ciclo",
        "curso",
        "asignatura",
        "doc_estandar",
        "tipo_vinculo",
        "eje_estandar",
        "codigo_estandar",
        "tema_estandar",
        "nivel_minimo",
        "n_oas",
        "oas_codigos",
        "oas_detalle",
        "unidades_ref",
        "cobertura_oas",
        "req_elemental",
        "req_adecuado",
        "expectativa_avanzada",
        "orientaciones",
    ]
    annual_headers = {
        "ciclo": "Ciclo",
        "curso": "Curso",
        "asignatura": "Asignatura",
        "doc_estandar": "Documento Estándares",
        "tipo_vinculo": "Tipo de Vínculo",
        "eje_estandar": "Eje / Habilidad SIMCE",
        "codigo_estandar": "Código Estándar",
        "tema_estandar": "Tema del Estándar",
        "nivel_minimo": "Nivel Mínimo Exigido",
        "n_oas": "N° OA Involucrados",
        "oas_codigos": "OA Involucrados",
        "oas_detalle": "Detalle de OA Involucrados (MINEDUC)",
        "unidades_ref": "Unidades de Referencia (informativo)",
        "cobertura_oas": "Cobertura Banco Material",
        "req_elemental": "Requisito Mínimo Elemental (Inicio / Nivelación)",
        "req_adecuado": "Requisito Mínimo Adecuado (Meta Guía / Evaluación)",
        "expectativa_avanzada": "Expectativa Curricular / Sobre Adecuado (Desafío)",
        "orientaciones": "Orientaciones por OA para Guías",
    }
    with OUT_ANNUAL_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([annual_headers[k] for k in annual_fields])
        for row in annual_std_rows:
            writer.writerow([row[k] for k in annual_fields])

    # Build formatted Excel workbook
    build_excel(annual_std_rows, unit_summary_rows, detailed_rows, STANDARDS_DOCS, payload["meta"])

    print("SUCCESS!")
    print(f"  Docs: {len(STANDARDS_DOCS)} | Indicators: {len(ind_by_code)} (100% mapped, 0 orphans)")
    print(f"  Course-Subjects: {len(course_links_out)} | Units: {len(unit_links_out)}")
    print(f"  Annual standard-first rows: {len(annual_std_rows)}")
    print(f"  OA-Unit entries mapped: {total_oa_unit_mapped} (+ {total_oa_unit_non_simce} Escritura/Oral non-SIMCE Lectura)")
    print(f"  Detailed OA x Standard rows: {len(detailed_rows)}")
    print(f"  JSON:       {OUT_JSON} ({OUT_JSON.stat().st_size / 1024:.1f} KB)")
    print(f"  CSV (OA):   {OUT_CSV} ({OUT_CSV.stat().st_size / 1024:.1f} KB)")
    print(f"  CSV (Anual):{OUT_ANNUAL_CSV} ({OUT_ANNUAL_CSV.stat().st_size / 1024:.1f} KB)")
    print(f"  XLSX:       {OUT_XLSX} ({OUT_XLSX.stat().st_size / 1024:.1f} KB)")


def build_excel(
    annual_std_rows: list[dict],
    unit_summary_rows: list[dict],
    detailed_rows: list[dict],
    docs: list[dict],
    meta: dict,
) -> None:
    wb = Workbook()

    # Palette matching Colegio Marina de Chile web app
    navy_fill = PatternFill("solid", fgColor="13294B")
    sub_fill = PatternFill("solid", fgColor="E7EFFA")
    warm_fill = PatternFill("solid", fgColor="FAF9F6")
    ok_fill = PatternFill("solid", fgColor="E6F6F3")
    warn_fill = PatternFill("solid", fgColor="FEF5E7")
    adv_fill = PatternFill("solid", fgColor="EEF2FF")
    thin_side = Side(border_style="thin", color="D6D3CB")
    border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="13294B")
    subtitle_font = Font(name="Calibri", size=10, italic=True, color="3D4F66")
    body_font = Font(name="Calibri", size=10, color="152236")
    bold_font = Font(name="Calibri", size=10, bold=True, color="13294B")

    def style_sheet_header(ws, title: str, subtitle: str, headers: list[str], widths: list[int]) -> None:
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
        c1 = ws.cell(row=1, column=1, value=title)
        c1.font = title_font
        c1.alignment = Alignment(vertical="center")
        ws.row_dimensions[1].height = 24
        c2 = ws.cell(row=2, column=1, value=subtitle)
        c2.font = subtitle_font
        c2.alignment = Alignment(vertical="center")
        ws.row_dimensions[2].height = 18

        ws.row_dimensions[4].height = 28
        for idx, h in enumerate(headers, 1):
            cell = ws.cell(row=4, column=idx, value=h)
            cell.font = header_font
            cell.fill = navy_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border
            ws.column_dimensions[get_column_letter(idx)].width = widths[idx - 1]
        ws.freeze_panes = "A5"
        ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}4"

    # ---------------- SHEET 0 (PRIMERA PESTAÑA): Plan Anual por Estándares ----------------
    ws0 = wb.active
    ws0.title = "Plan Anual por Estándares"
    h0 = [
        "Ciclo",
        "Curso",
        "Asignatura",
        "Documento Estándares",
        "Tipo de Vínculo",
        "Eje / Habilidad SIMCE",
        "Código Estándar",
        "Tema del Estándar",
        "Nivel Mínimo Exigido",
        "N° OA",
        "OA Involucrados",
        "Detalle de OA Involucrados (MINEDUC)",
        "Unidades Ref. (informativo)",
        "Cobertura Banco Material",
        "Requisito Mínimo Elemental (Inicio / Nivelación)",
        "Requisito Mínimo Adecuado (Meta Guía / Evaluación)",
        "Expectativa Curricular / Sobre Adecuado (Desafío)",
        "Orientaciones por OA para Guías",
    ]
    w0 = [14, 11, 26, 17, 20, 24, 14, 28, 22, 9, 22, 52, 22, 22, 42, 44, 42, 46]
    style_sheet_header(
        ws0,
        "Plan Anual Organizado por Estándares de Aprendizaje (Independiente de Unidades)",
        f"Cada fila representa un estándar único del año por curso/asignatura ({len(annual_std_rows)} estándares-año) indicando todos los OA MINEDUC que involucra, sin dividir el estándar en cada OA. Generado: {meta['generated_at']}.",
        h0,
        w0,
    )
    for r_idx, row in enumerate(annual_std_rows, 5):
        vals = [
            row["ciclo"],
            row["curso"],
            row["asignatura"],
            row["doc_estandar"],
            row["tipo_vinculo"],
            row["eje_estandar"],
            row["codigo_estandar"],
            row["tema_estandar"],
            row["nivel_minimo"],
            row["n_oas"],
            row["oas_codigos"],
            row["oas_detalle"],
            row["unidades_ref"],
            row["cobertura_oas"],
            row["req_elemental"],
            row["req_adecuado"],
            row["expectativa_avanzada"],
            row["orientaciones"],
        ]
        for c_idx, val in enumerate(vals, 1):
            cell = ws0.cell(row=r_idx, column=c_idx, value=val)
            cell.font = bold_font if c_idx in (2, 7, 11) else body_font
            cell.border = border
            cell.alignment = Alignment(
                vertical="top",
                horizontal="center" if c_idx == 10 else "left",
                wrap_text=True,
            )
            if c_idx == 5:
                cell.fill = ok_fill if val == "Directo" else (sub_fill if "Tramo" in str(val) else warm_fill)
            elif c_idx == 9:
                if "Expectativa" in str(val):
                    cell.fill = adv_fill
                elif val == "Adecuado":
                    cell.fill = sub_fill
                else:
                    cell.fill = ok_fill
            elif r_idx % 2 == 1:
                cell.fill = warm_fill
    ws0.auto_filter.ref = f"A4:{get_column_letter(len(h0))}{len(annual_std_rows) + 4}"

    # ---------------- SHEET 1: Resumen por Curso y Unidad ----------------
    ws1 = wb.create_sheet("Resumen por Curso y Unidad")
    h1 = [
        "Ciclo",
        "Curso",
        "Asignatura",
        "Unidad",
        "Documento Estándares",
        "Tipo de Vínculo",
        "Alcance del Tramo",
        "Puntaje Elemental",
        "Puntaje Adecuado",
        "Total OAs Unidad",
        "OAs con Estándar",
        "OAs Otros Ejes",
        "N° Estándares",
        "Ejes / Habilidades SIMCE",
        "Códigos Estándares Asociados",
        "Niveles Cubiertos",
        "Cobertura Banco (%)",
        "Materiales en Banco",
    ]
    w1 = [15, 12, 30, 18, 18, 22, 34, 17, 17, 12, 12, 12, 12, 34, 34, 24, 13, 13]
    style_sheet_header(
        ws1,
        "Matriz Estándares de Aprendizaje SIMCE × OA por Unidad — Colegio Marina de Chile",
        f"Resumen curricular de 1° Básico a 2° Medio ({meta['totals']['documentos']} documentos oficiales, {meta['totals']['unidades_vinculadas']} unidades vinculadas, {meta['totals']['oas_unidad_vinculados']} OA-unidad asociados). Generado: {meta['generated_at']}.",
        h1,
        w1,
    )
    for r_idx, row in enumerate(unit_summary_rows, 5):
        vals = [
            row["ciclo"],
            row["curso"],
            row["asignatura"],
            row["unidad"],
            row["doc_estandar"],
            row["tipo_vinculo"],
            row["nota_vinculo"],
            row["puntaje_elemental"],
            row["puntaje_adecuado"],
            row["total_oas"],
            row["oas_vinculados"],
            row["oas_otro_eje"],
            row["n_indicadores"],
            row["ejes_simce"],
            row["codigos_estandares"],
            row["niveles_cubiertos"],
            row["cobertura_banco_pct"],
            row["materiales_banco"],
        ]
        for c_idx, val in enumerate(vals, 1):
            cell = ws1.cell(row=r_idx, column=c_idx, value=val)
            cell.font = bold_font if c_idx in (2, 4) else body_font
            cell.border = border
            cell.alignment = Alignment(
                vertical="top",
                horizontal="center" if c_idx in (10, 11, 12, 13, 17, 18) else "left",
                wrap_text=True,
            )
            if c_idx == 6:
                cell.fill = ok_fill if val == "Directo" else (sub_fill if "Tramo" in val else warm_fill)
            elif r_idx % 2 == 1:
                cell.fill = warm_fill
    ws1.auto_filter.ref = f"A4:{get_column_letter(len(h1))}{len(unit_summary_rows) + 4}"

    # ---------------- SHEET 2: Cruce OA x Estándares ----------------
    ws2 = wb.create_sheet("Cruce OA x Estándares")
    h2 = [
        "Ciclo",
        "Curso",
        "Asignatura",
        "Unidad",
        "OA",
        "Eje OA MINEDUC",
        "Descripción OA MINEDUC",
        "Estado Banco Material",
        "Documento Estándares",
        "Tipo de Vínculo",
        "Código Estándar",
        "Eje / Habilidad Estándar",
        "Tema del Estándar",
        "Nivel Mínimo Exigido",
        "Requisito Mínimo Elemental (Inicio / Nivelación)",
        "Requisito Mínimo Adecuado (Meta Guía / Evaluación)",
        "Expectativa Curricular / Sobre Adecuado (Desafío)",
        "Orientación para Preparar Guías y Evaluaciones",
    ]
    w2 = [14, 11, 26, 16, 9, 22, 42, 18, 17, 20, 14, 24, 28, 22, 42, 44, 42, 44]
    style_sheet_header(
        ws2,
        "Cruce Detallado: Objetivos de Aprendizaje por Unidad × Estándares de Aprendizaje SIMCE",
        "Filtra por Curso, Asignatura y Unidad para diseñar guías de aprendizaje y evaluaciones escalonadas en 3 niveles (Nivelación Elemental → Meta Adecuado → Desafío Expectativa Curricular).",
        h2,
        w2,
    )
    for r_idx, row in enumerate(detailed_rows, 5):
        vals = [
            row["ciclo"],
            row["curso"],
            row["asignatura"],
            row["unidad"],
            row["oa"],
            row["eje_oa"],
            row["descripcion_oa"],
            row["estado_banco"],
            row["doc_estandar"],
            row["tipo_vinculo"],
            row["codigo_estandar"],
            row["eje_estandar"],
            row["tema_estandar"],
            row["nivel_minimo"],
            row["req_elemental"],
            row["req_adecuado"],
            row["expectativa_avanzada"],
            row["sugerencia_guia"],
        ]
        for c_idx, val in enumerate(vals, 1):
            cell = ws2.cell(row=r_idx, column=c_idx, value=val)
            cell.font = bold_font if c_idx in (5, 11) else body_font
            cell.border = border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if c_idx == 8:
                cell.fill = ok_fill if "Con material" in str(val) else warn_fill
            elif c_idx == 14:
                if "Expectativa" in str(val):
                    cell.fill = adv_fill
                elif val == "Adecuado":
                    cell.fill = sub_fill
                else:
                    cell.fill = ok_fill
            elif r_idx % 2 == 1:
                cell.fill = warm_fill
    ws2.auto_filter.ref = f"A4:{get_column_letter(len(h2))}{len(detailed_rows) + 4}"

    # ---------------- SHEET 3: Catálogo 10 Docs SIMCE ----------------
    ws3 = wb.create_sheet("Catálogo Estándares (10 Docs)")
    h3 = [
        "Documento PDF",
        "Curso Evaluado",
        "Asignatura Estándar",
        "Cobertura Oficial",
        "Decreto / Currículum",
        "Corte Insuficiente",
        "Corte Elemental",
        "Corte Adecuado",
        "Código Estándar",
        "Eje / Habilidad",
        "Tema",
        "Nivel Mínimo",
        "Requisito Mínimo Elemental",
        "Requisito Mínimo Adecuado",
        "Expectativa Curricular / Sobre Adecuado",
        "Enlace PDF en Google Drive",
    ]
    w3 = [18, 12, 24, 24, 30, 17, 17, 17, 14, 24, 28, 22, 42, 44, 42, 44]
    style_sheet_header(
        ws3,
        "Catálogo Oficial Verbatim de Estándares de Aprendizaje (10 Documentos SIMCE)",
        "Requisitos mínimos de Nivel Elemental y Adecuado más descriptores de Expectativa Curricular / Sobre Nivel Adecuado extraídos de los 10 PDFs de Banco Material / SIMCE estándares.",
        h3,
        w3,
    )
    r_idx = 5
    for d in docs:
        url = f"https://drive.google.com/file/d/{d['driveId']}/view"
        for ind in d["indicadores"]:
            vals = [
                d["fileName"],
                d["cursoEvaluado"],
                d["asignatura"],
                d["cobertura"],
                d["decreto"],
                d["puntajes"]["insuficiente"],
                d["puntajes"]["elemental"],
                d["puntajes"]["adecuado"],
                ind["code"],
                ind["eje"],
                ind["tema"],
                ind["nivelMinimo"],
                ind["elemental"] or "—",
                ind["adecuado"] or "—",
                ind["avanzado"] or "—",
                url,
            ]
            for c_idx, val in enumerate(vals, 1):
                cell = ws3.cell(row=r_idx, column=c_idx, value=val)
                cell.font = bold_font if c_idx in (1, 9) else body_font
                cell.border = border
                cell.alignment = Alignment(vertical="top", wrap_text=True)
                if c_idx == 16:
                    cell.hyperlink = url
                    cell.font = Font(name="Calibri", size=10, color="1D4ED8", underline="single")
                elif r_idx % 2 == 1:
                    cell.fill = warm_fill
            r_idx += 1
    ws3.auto_filter.ref = f"A4:{get_column_letter(len(h3))}{r_idx - 1}"

    # ---------------- SHEET 4: Guía Diseño Material 3 Niveles ----------------
    ws4 = wb.create_sheet("Pauta Diseño Guías")
    h4 = [
        "Momento / Tramo de la Guía",
        "Nivel de Aprendizaje SIMCE",
        "Propósito Pedagógico",
        "Cómo redactar actividades en Lectura",
        "Cómo redactar actividades en Matemática",
        "Cómo redactar actividades en Historia",
        "Peso sugerido en Guía / Evaluación",
    ]
    w4 = [24, 24, 34, 42, 42, 42, 20]
    style_sheet_header(
        ws4,
        "Pauta Práctica para Preparar Guías de Aprendizaje y Evaluaciones Pensando en los Estándares",
        "Estructura recomendada por UTP para diseñar material didáctico con progresión explícita de demanda cognitiva.",
        h4,
        w4,
    )
    guide_rows = [
        (
            "1. Inicio / Activación y Nivelación",
            "Superar Insuficiente → Consolidar Elemental",
            "Asegurar acceso a todos los estudiantes mediante situaciones directas, apoyos visuales y pistas explícitas antes de subir complejidad.",
            "Textos breves de tema familiar con títulos/negritas; localizar datos explícitos destacados; inferencias en el mismo párrafo; vocabulario con sinónimos explícitos.",
            "Situaciones directas y problemas rutinarios de 1 paso con enunciado breve y datos explícitos; representación concreta/pictórica; operaciones básicas o patrones al término siguiente.",
            "Líneas de tiempo guiadas con fechas dadas; lectura de mapas sencillos con simbología clara; extracción directa de una fuente breve o tabla simple.",
            "25% – 30%",
        ),
        (
            "2. Desarrollo / Meta Curricular",
            "Consolidar Nivel Adecuado (meta mínima esperada)",
            "Desarrollar autonomía en problemas rutinarios de varios pasos, discriminación de distractores e integración de información.",
            "Textos continuos, discontinuos y mixtos de tema poco familiar; localizar discriminando información similar; inferir causas, motivaciones y lenguaje figurado por claves; opinar citando el texto.",
            "Problemas rutinarios de 1 o más pasos donde el estudiante selecciona datos, organiza información y elige procedimiento; lenguaje algebraico, fracciones/decimales, ángulos, gráficos y probabilidad simple.",
            "Interpretar y comparar 2 fuentes escritas/iconográficas; ordenar en años/décadas/siglos; explicar procesos de Chile/América/Mundo y relaciones de continuidad y cambio.",
            "50% – 55%",
        ),
        (
            "3. Cierre / Desafío y Profundización",
            "Sobre Nivel Adecuado (Expectativa Curricular)",
            "Movilizar pensamiento complejo, problemas no rutinarios, transferencia entre ejes y argumentación fundamentada.",
            "Integrar dos textos con posturas que compiten; interpretar lenguaje figurado desde el sentido global; evaluar suficiencia de argumentos y detectar falacias o sesgos.",
            "Problemas no rutinarios novedosos que combinan contenidos (ej.: función cuadrática, trigonometría, Pitágoras, Tales, volumen de cuerpos, combinatoria, justificación de procedimientos).",
            "Analizar fuentes históricas primarias complejas y redactar explicaciones multicausales o juicios ciudadanos fundamentados con evidencia histórica y estadística.",
            "15% – 25%",
        ),
    ]
    for r_idx, row in enumerate(guide_rows, 5):
        for c_idx, val in enumerate(row, 1):
            cell = ws4.cell(row=r_idx, column=c_idx, value=val)
            cell.font = bold_font if c_idx <= 2 else body_font
            cell.border = border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if r_idx == 5:
                cell.fill = warn_fill
            elif r_idx == 6:
                cell.fill = ok_fill
            else:
                cell.fill = adv_fill
        ws4.row_dimensions[r_idx].height = 88

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)


if __name__ == "__main__":
    main()
