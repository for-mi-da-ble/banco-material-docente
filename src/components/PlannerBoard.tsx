import React, { useMemo, useState } from "react";
import { BookMarked, Copy, ExternalLink, FolderOpen, Layers, Search, Sparkles } from "lucide-react";
import {
  BASALES_3M_4M,
  CICLO_ORDER,
  sortCursos,
  type BancoDataset,
  type MaterialItem,
} from "../types";
import MaterialCard from "./MaterialCard";

interface PlannerBoardProps {
  dataset: BancoDataset;
  plannedIds: Set<string>;
  relocatedIds: Set<string>;
  selectedCiclo: string;
  selectedCurso: string;
  selectedAsig: string;
  selectedUnit: string;
  onSelectCiclo: (c: string) => void;
  onSelectCurso: (c: string) => void;
  onSelectAsig: (a: string) => void;
  onSelectUnit: (u: string) => void;
  onPreview: (m: MaterialItem) => void;
  onTogglePlan: (m: MaterialItem) => void;
  onRelocate: (m: MaterialItem) => void;
  onCopyText: (text: string, label: string) => void;
}

export default function PlannerBoard({
  dataset,
  plannedIds,
  relocatedIds,
  selectedCiclo,
  selectedCurso,
  selectedAsig,
  selectedUnit,
  onSelectCiclo,
  onSelectCurso,
  onSelectAsig,
  onSelectUnit,
  onPreview,
  onTogglePlan,
  onRelocate,
  onCopyText,
}: PlannerBoardProps) {
  const [tipoFilter, setTipoFilter] = useState("");
  const [anioFilter, setAnioFilter] = useState("");
  const [oaFilter, setOaFilter] = useState("");
  const [localQ, setLocalQ] = useState("");

  // Conteos por ciclo
  const cicloCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of dataset.materials) {
      map.set(m.ciclo, (map.get(m.ciclo) || 0) + 1);
    }
    return map;
  }, [dataset.materials]);

  // Cursos disponibles en el ciclo activo
  const coursesInCiclo = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of dataset.materials) {
      if (m.ciclo === selectedCiclo) {
        counts.set(m.curso, (counts.get(m.curso) || 0) + 1);
      }
    }
    return sortCursos(Array.from(counts.keys())).map((c) => ({
      curso: c,
      count: counts.get(c) || 0,
    }));
  }, [dataset.materials, selectedCiclo]);

  // Asignaturas disponibles en el curso activo + % de cobertura OA
  const subjectsInCurso = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of dataset.materials) {
      if (m.ciclo === selectedCiclo && m.curso === selectedCurso) {
        counts.set(m.asignatura, (counts.get(m.asignatura) || 0) + 1);
      }
    }
    const covMap = new Map<string, { cov: number; tot: number }>();
    for (const r of dataset.coverage) {
      if (r.ciclo === selectedCiclo && r.curso === selectedCurso) {
        const cur = covMap.get(r.asig) || { cov: 0, tot: 0 };
        cur.cov += r.cov;
        cur.tot += r.tot;
        covMap.set(r.asig, cur);
      }
    }
    return Array.from(counts.keys())
      .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b, "es"))
      .map((asig) => {
        const cv = covMap.get(asig);
        const pct = cv && cv.tot > 0 ? Math.round((cv.cov / cv.tot) * 100) : null;
        return { asig, count: counts.get(asig) || 0, pct };
      });
  }, [dataset.materials, dataset.coverage, selectedCiclo, selectedCurso]);

  // Materiales de la combinación (Ciclo, Curso, Asignatura)
  const subjectMaterials = useMemo(
    () =>
      dataset.materials.filter(
        (m) => m.ciclo === selectedCiclo && m.curso === selectedCurso && m.asignatura === selectedAsig,
      ),
    [dataset.materials, selectedCiclo, selectedCurso, selectedAsig],
  );

  // Unidades presentes
  const unitCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of subjectMaterials) {
      map.set(m.unidad, (map.get(m.unidad) || 0) + 1);
    }
    return map;
  }, [subjectMaterials]);

  const isTransversal = selectedCurso === "Transversal";
  const unitTabs = isTransversal
    ? ["Transversal"]
    : ["Todas", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4"];

  // Materiales visibles tras filtrar unidad, tipo, año, OA y texto
  const visibleMaterials = useMemo(() => {
    const q = localQ.trim().toLowerCase();
    return subjectMaterials.filter((m) => {
      if (selectedUnit && selectedUnit !== "Todas" && m.unidad !== selectedUnit) return false;
      if (tipoFilter && m.tipo !== tipoFilter) return false;
      if (anioFilter && String(m.anio) !== anioFilter) return false;
      if (oaFilter && !m.oas.includes(oaFilter)) return false;
      if (q && !m.searchText.includes(q)) return false;
      return true;
    });
  }, [subjectMaterials, selectedUnit, tipoFilter, anioFilter, oaFilter, localQ]);

  // Tipos disponibles en la selección actual
  const tiposAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const m of subjectMaterials) {
      if (selectedUnit === "Todas" || m.unidad === selectedUnit) set.add(m.tipo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [subjectMaterials, selectedUnit]);

  // OAs oficiales MINEDUC para esta (Curso, Asignatura, Unidad)
  const unitOaCards = useMemo(() => {
    if (isTransversal) return [];
    const lookupUnits =
      selectedCurso === "Electivos"
        ? ["General"]
        : selectedUnit === "Todas"
        ? ["Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4"]
        : [selectedUnit];

    const oaCounts = new Map<string, number>();
    for (const m of subjectMaterials) {
      if (selectedUnit !== "Todas" && selectedCurso !== "Electivos" && m.unidad !== selectedUnit) continue;
      for (const code of m.oas) {
        oaCounts.set(code, (oaCounts.get(code) || 0) + 1);
      }
    }

    const seen = new Set<string>();
    const list: Array<{ oa: string; eje: string; desc: string; unidad: string; count: number }> = [];
    for (const u of lookupUnits) {
      const entries = dataset.oaCatalog[`${selectedCurso}|${selectedAsig}|${u}`] || [];
      for (const e of entries) {
        const key = `${u}|${e.oa}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          oa: e.oa,
          eje: e.eje,
          desc: e.desc,
          unidad: u,
          count: oaCounts.get(e.oa) || 0,
        });
      }
    }
    return list;
  }, [dataset.oaCatalog, selectedCurso, selectedAsig, selectedUnit, subjectMaterials, isTransversal]);

  // Carpeta real en Google Drive para la unidad seleccionada
  const activeDriveFolder = useMemo(() => {
    if (isTransversal) {
      return dataset.folders.find(
        (f) => f.ciclo === selectedCiclo && f.ruta.toLowerCase().includes("transversal"),
      );
    }
    if (selectedUnit !== "Todas") {
      return dataset.folders.find(
        (f) => f.curso === selectedCurso && f.asig === selectedAsig && f.unidad === selectedUnit,
      );
    }
    return dataset.folders.find(
      (f) => f.curso === selectedCurso && f.asig === selectedAsig && !f.unidad,
    );
  }, [dataset.folders, selectedCiclo, selectedCurso, selectedAsig, selectedUnit, isTransversal]);

  return (
    <section aria-label="Planificador visual por curso y unidad">
      <div className="section-head">
        <div>
          <h1>Planificador Visual por Curso y Unidad</h1>
          <p>
            Elige tu curso y asignatura para explorar guías, pruebas, presentaciones y rúbricas junto a los Objetivos de Aprendizaje MINEDUC oficiales.
          </p>
        </div>
        {activeDriveFolder && (
          <a
            href={`https://drive.google.com/drive/folders/${activeDriveFolder.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            <FolderOpen size={15} /> Abrir carpeta en Google Drive <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Selector visual de 3 pasos */}
      <div className="selector-panel">
        <div>
          <div className="step-label">1. Selecciona el Ciclo</div>
          <div className="cycle-pills">
            {CICLO_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                className={`cycle-pill ${selectedCiclo === c ? "active" : ""}`}
                onClick={() => {
                  onSelectCiclo(c);
                  setTipoFilter("");
                  setOaFilter("");
                }}
              >
                <span>{c}</span>
                <span className="tabular" style={{ opacity: 0.78, fontSize: 12 }}>
                  {(cicloCounts.get(c) || 0).toLocaleString("es-CL")}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="step-label">2. Elige el Curso o Electivo</div>
          <div className="course-tiles">
            {coursesInCiclo.map(({ curso, count }) => (
              <button
                key={curso}
                type="button"
                className={`course-tile ${selectedCurso === curso ? "active" : ""}`}
                onClick={() => {
                  onSelectCurso(curso);
                  setTipoFilter("");
                  setOaFilter("");
                }}
              >
                <span className="course-tile-name">{curso}</span>
                <span className="course-tile-meta tabular">{count} materiales</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="step-label">
            3. Elige tu Asignatura
            {(selectedCurso === "3° Medio" || selectedCurso === "4° Medio") && (
              <span className="badge badge-navy" style={{ textTransform: "none" }}>
                Asignaturas Basales FG
              </span>
            )}
            {selectedCurso === "Electivos" && (
              <span className="badge badge-ok" style={{ textTransform: "none" }}>
                Plan Diferenciado HC (3° y 4° Medio)
              </span>
            )}
          </div>
          <div className="subject-chips">
            {subjectsInCurso.map(({ asig, count, pct }) => (
              <button
                key={asig}
                type="button"
                className={`subject-chip ${selectedAsig === asig ? "active" : ""}`}
                onClick={() => {
                  onSelectAsig(asig);
                  setTipoFilter("");
                  setOaFilter("");
                }}
              >
                <span>{asig}</span>
                <span className="subject-chip-count tabular">{count}</span>
                {pct !== null && (
                  <span
                    className="mono tabular"
                    style={{
                      fontSize: 10.5,
                      opacity: selectedAsig === asig ? 0.9 : 0.75,
                    }}
                    title="Porcentaje de OA MINEDUC cubiertos"
                  >
                    {pct}% OA
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Barra de Unidades + Filtros rápidos */}
      <div className="unit-bar">
        <div className="unit-tabs">
          {unitTabs.map((u) => {
            const cnt = u === "Todas" ? subjectMaterials.length : unitCounts.get(u) || 0;
            return (
              <button
                key={u}
                type="button"
                className={`unit-tab ${selectedUnit === u ? "active" : ""}`}
                onClick={() => {
                  onSelectUnit(u);
                  setOaFilter("");
                }}
              >
                <Layers size={13} />
                {u}
                <span className="tabular" style={{ opacity: 0.78, fontSize: 11.5 }}>
                  ({cnt})
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-wrap" style={{ minWidth: 220 }}>
            <Search size={14} />
            <input
              type="search"
              className="input"
              placeholder={`Filtrar dentro de ${selectedAsig}...`}
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
            />
          </div>
          <select
            className="select"
            style={{ width: 110 }}
            value={anioFilter}
            onChange={(e) => setAnioFilter(e.target.value)}
            aria-label="Filtrar por año"
          >
            <option value="">Año: Todos</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      {/* Panel de Objetivos de Aprendizaje MINEDUC de la Unidad */}
      {unitOaCards.length > 0 && (
        <div className="oa-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BookMarked size={16} style={{ color: "var(--navy-800)" }} />
              <strong style={{ fontSize: 13.5 }}>
                Objetivos de Aprendizaje MINEDUC — {selectedCurso} · {selectedAsig}
                {selectedUnit !== "Todas" ? ` · ${selectedUnit}` : ""}
              </strong>
              {(selectedCurso === "3° Medio" || selectedCurso === "4° Medio") && BASALES_3M_4M.has(selectedAsig) && (
                <span className="badge badge-navy">Basal</span>
              )}
            </div>
            {oaFilter && (
              <button type="button" className="btn btn-sm" onClick={() => setOaFilter("")}>
                Mostrando solo {oaFilter} — Ver todos
              </button>
            )}
          </div>

          <div className="oa-grid">
            {unitOaCards.map((item) => {
              const isSel = oaFilter === item.oa;
              const covered = item.count > 0;
              return (
                <div
                  key={`${item.unidad}-${item.oa}`}
                  className={`oa-box ${isSel ? "selected" : ""}`}
                >
                  <div>
                    <div className="oa-box-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong className="mono" style={{ fontSize: 12.5, color: "var(--navy-900)" }}>
                          {item.oa}
                        </strong>
                        {selectedUnit === "Todas" && item.unidad !== "General" && (
                          <span className="badge badge-neutral">{item.unidad}</span>
                        )}
                      </div>
                      <span className={`badge ${covered ? "badge-ok" : "badge-warn"} tabular`}>
                        {covered ? `${item.count} recurso${item.count > 1 ? "s" : ""}` : "Sin material (brecha)"}
                      </span>
                    </div>
                    <div className="oa-box-desc" style={{ marginTop: 6 }} title={item.desc}>
                      {item.desc}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onCopyText(`${item.oa}: ${item.desc}`, `${item.oa} copiado para tu guía/prueba`)}
                      title="Copiar redacción oficial MINEDUC para pegar en el encabezado de tu Word/Docs"
                    >
                      <Copy size={11} /> Copiar OA
                    </button>
                    {covered && (
                      <button
                        type="button"
                        className={`btn btn-sm ${isSel ? "btn-primary" : ""}`}
                        onClick={() => setOaFilter(isSel ? "" : item.oa)}
                      >
                        <Sparkles size={11} /> {isSel ? "Quitar filtro" : "Ver recursos"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros por tipo de recurso */}
      {tiposAvailable.length > 1 && (
        <div className="filter-pills" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)", marginRight: 4 }}>
            Tipo de material:
          </span>
          <button
            type="button"
            className={`filter-pill ${tipoFilter === "" ? "active" : ""}`}
            onClick={() => setTipoFilter("")}
          >
            Todos ({subjectMaterials.filter((m) => selectedUnit === "Todas" || m.unidad === selectedUnit).length})
          </button>
          {tiposAvailable.map((t) => (
            <button
              key={t}
              type="button"
              className={`filter-pill ${tipoFilter === t ? "active" : ""}`}
              onClick={() => setTipoFilter(tipoFilter === t ? "" : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Cuadrícula visual de tarjetas de material */}
      {visibleMaterials.length === 0 ? (
        <div className="panel panel-pad" style={{ textAlign: "center", padding: 42, color: "var(--ink-500)" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            No hay materiales con estos filtros en {selectedCurso} · {selectedAsig} ({selectedUnit}).
          </p>
          <p style={{ margin: "6px 0 14px", fontSize: 12.5 }}>
            Prueba seleccionar "Todas" las unidades o limpiar el filtro de tipo/OA.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onSelectUnit(isTransversal ? "Transversal" : "Todas");
              setTipoFilter("");
              setOaFilter("");
              setAnioFilter("");
              setLocalQ("");
            }}
          >
            Ver todo el material de {selectedAsig}
          </button>
        </div>
      ) : (
        <div className="cards-grid">
          {visibleMaterials.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              isPlanned={plannedIds.has(m.id)}
              isRelocated={relocatedIds.has(m.id)}
              onPreview={onPreview}
              onTogglePlan={onTogglePlan}
              onRelocate={onRelocate}
              onClickOa={(code) => setOaFilter(oaFilter === code ? "" : code)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
