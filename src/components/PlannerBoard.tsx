import React, { useMemo, useState } from "react";
import {
  Award,
  BookMarked,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FolderOpen,
  Layers,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  BASALES_3M_4M,
  buildOaGuideBlueprint,
  CICLO_ORDER,
  isExternalSource,
  sortCursos,
  type BancoDataset,
  type MaterialItem,
  type StandardDoc,
  type StandardIndicator,
  type StandardsDataset,
} from "../types";
import MaterialCard from "./MaterialCard";

interface PlannerBoardProps {
  dataset: BancoDataset;
  standards: StandardsDataset | null;
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
  onOpenStandards?: (curso: string, asig: string, unidad: string) => void;
}

export default function PlannerBoard({
  dataset,
  standards,
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
  onOpenStandards,
}: PlannerBoardProps) {
  const [tipoFilter, setTipoFilter] = useState("");
  const [anioFilter, setAnioFilter] = useState("");
  const [origenFilter, setOrigenFilter] = useState("");
  const [oaFilter, setOaFilter] = useState("");
  const [localQ, setLocalQ] = useState("");
  const [expandedOaKey, setExpandedOaKey] = useState<string | null>(null);

  // Índices de estándares SIMCE (cuando existen para la combinación Curso/Asignatura)
  const stdDocById = useMemo(() => {
    const map = new Map<string, StandardDoc>();
    if (standards) {
      for (const d of standards.docs) map.set(d.docId, d);
    }
    return map;
  }, [standards]);

  const stdIndicatorByCode = useMemo(() => {
    const map = new Map<string, StandardIndicator>();
    if (standards) {
      for (const d of standards.docs) {
        for (const ind of d.indicadores) map.set(ind.code, ind);
      }
    }
    return map;
  }, [standards]);

  const activeCourseStdLink = useMemo(() => {
    if (!standards) return null;
    return (
      standards.courseLinks.find(
        (c) => c.curso === selectedCurso && c.asignatura === selectedAsig,
      ) || null
    );
  }, [standards, selectedCurso, selectedAsig]);

  const activeStdDoc = activeCourseStdLink ? stdDocById.get(activeCourseStdLink.docId) || null : null;

  // Conteos por ciclo
  const cicloCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of dataset.materials) {
      map.set(m.ciclo, (map.get(m.ciclo) || 0) + 1);
    }
    return map;
  }, [dataset.materials]);

  // Cursos disponibles en el ciclo activo (o todos los cursos unificados si selectedCiclo === "")
  const coursesInCiclo = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of dataset.materials) {
      if (!selectedCiclo || m.ciclo === selectedCiclo) {
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
      if ((!selectedCiclo || m.ciclo === selectedCiclo) && m.curso === selectedCurso) {
        counts.set(m.asignatura, (counts.get(m.asignatura) || 0) + 1);
      }
    }
    const covMap = new Map<string, { cov: number; tot: number }>();
    for (const r of dataset.coverage) {
      if ((!selectedCiclo || r.ciclo === selectedCiclo) && r.curso === selectedCurso) {
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

  // Materiales de la combinación (Curso, Asignatura)
  const subjectMaterials = useMemo(
    () =>
      dataset.materials.filter(
        (m) => (!selectedCiclo || m.ciclo === selectedCiclo) && m.curso === selectedCurso && m.asignatura === selectedAsig,
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
  const isProfesores = selectedCurso === "Profesores";
  const catalogUnitsForSubject = useMemo(() => {
    if (isTransversal || isProfesores || selectedCurso === "Electivos") return [];
    const prefix = `${selectedCurso}|${selectedAsig}|`;
    const found = Object.keys(dataset.oaCatalog)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
    return found.sort((a, b) => {
      const aNum = a.startsWith("Unidad ") ? Number(a.slice(7)) : 99;
      const bNum = b.startsWith("Unidad ") ? Number(b.slice(7)) : 99;
      if (aNum !== bNum) return aNum - bNum;
      return a.localeCompare(b, "es");
    });
  }, [dataset.oaCatalog, selectedCurso, selectedAsig, isTransversal, isProfesores]);

  const unitTabs = useMemo(() => {
    if (isTransversal) return ["Transversal"];
    if (isProfesores) return ["Todas"];
    if (catalogUnitsForSubject.length > 0) {
      return ["Todas", ...catalogUnitsForSubject];
    }
    return ["Todas", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4"];
  }, [isTransversal, isProfesores, catalogUnitsForSubject]);

  // Materiales visibles tras filtrar unidad, tipo, origen, año, OA y texto
  const visibleMaterials = useMemo(() => {
    const q = localQ.trim().toLowerCase();
    return subjectMaterials.filter((m) => {
      if (selectedUnit && selectedUnit !== "Todas" && m.unidad !== selectedUnit) return false;
      if (tipoFilter && m.tipo !== tipoFilter) return false;
      if (origenFilter === "__EXT__") {
        if (!isExternalSource(m.origen)) return false;
      } else if (origenFilter && m.origen !== origenFilter) {
        return false;
      }
      if (anioFilter && String(m.anio) !== anioFilter) return false;
      if (oaFilter && !m.oas.includes(oaFilter)) return false;
      if (q && !m.searchText.includes(q)) return false;
      return true;
    });
  }, [subjectMaterials, selectedUnit, tipoFilter, origenFilter, anioFilter, oaFilter, localQ]);

  // Orígenes presentes en la selección actual
  const origenesAvailable = useMemo(() => {
    const set = new Set<string>();
    let hasExt = false;
    for (const m of subjectMaterials) {
      if (selectedUnit === "Todas" || m.unidad === selectedUnit) {
        set.add(m.origen);
        if (isExternalSource(m.origen)) hasExt = true;
      }
    }
    return { list: Array.from(set).sort((a, b) => a.localeCompare(b, "es")), hasExt };
  }, [subjectMaterials, selectedUnit]);

  // Tipos disponibles en la selección actual
  const tiposAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const m of subjectMaterials) {
      if (selectedUnit === "Todas" || m.unidad === selectedUnit) set.add(m.tipo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [subjectMaterials, selectedUnit]);

  // OAs oficiales MINEDUC para esta (Curso, Asignatura, Unidad) + Estándares SIMCE asociados
  const unitOaCards = useMemo(() => {
    if (isTransversal || isProfesores) return [];
    const lookupUnits =
      selectedCurso === "Electivos"
        ? ["General"]
        : selectedUnit === "Todas"
        ? catalogUnitsForSubject.length > 0
          ? catalogUnitsForSubject
          : ["Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4"]
        : [selectedUnit];

    const oaCounts = new Map<string, number>();
    for (const m of subjectMaterials) {
      if (selectedUnit !== "Todas" && selectedCurso !== "Electivos" && m.unidad !== selectedUnit) continue;
      for (const code of m.oas) {
        oaCounts.set(code, (oaCounts.get(code) || 0) + 1);
      }
    }

    const seen = new Set<string>();
    const list: Array<{
      oa: string;
      eje: string;
      desc: string;
      unidad: string;
      count: number;
      stdIndicators: StandardIndicator[];
      stdSugerencia: string;
    }> = [];
    for (const u of lookupUnits) {
      const uKey = `${selectedCurso}|${selectedAsig}|${u}`;
      const entries = dataset.oaCatalog[uKey] || [];
      const uStd = standards?.unitLinks[uKey];
      const oaStdMap = new Map((uStd?.oas || []).map((o) => [o.oa, o]));

      for (const e of entries) {
        const key = `${u}|${e.oa}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const oaStd = oaStdMap.get(e.oa);
        const stdIndicators = oaStd
          ? oaStd.indicadores
              .map((code) => stdIndicatorByCode.get(code))
              .filter((x): x is StandardIndicator => Boolean(x))
          : [];
        list.push({
          oa: e.oa,
          eje: e.eje,
          desc: e.desc,
          unidad: u,
          count: oaCounts.get(e.oa) || 0,
          stdIndicators,
          stdSugerencia: oaStd?.sugerencia || "",
        });
      }
    }
    return list;
  }, [
    dataset.oaCatalog,
    standards,
    stdIndicatorByCode,
    catalogUnitsForSubject,
    selectedCurso,
    selectedAsig,
    selectedUnit,
    subjectMaterials,
    isTransversal,
    isProfesores,
  ]);

  // Carpeta real en Google Drive para la unidad seleccionada
  const activeDriveFolder = useMemo(() => {
    if (isTransversal) {
      return dataset.folders.find(
        (f) => (!selectedCiclo || f.ciclo === selectedCiclo) && f.ruta.toLowerCase().includes("transversal"),
      );
    }
    if (isProfesores) {
      return (
        dataset.folders.find((f) => f.curso === "Profesores" && f.asig === selectedAsig) ||
        dataset.folders.find((f) => f.curso === "Profesores")
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
  }, [dataset.folders, selectedCiclo, selectedCurso, selectedAsig, selectedUnit, isTransversal, isProfesores]);

  return (
    <section aria-label="Planificador visual por curso y unidad">
      <div className="section-head">
        <div>
          <h1>Planificador Visual por Curso y Unidad</h1>
          <p>
            Todo el banco unificado en una sola carpeta <strong>Material/</strong>: elige tu curso y asignatura para explorar recursos junto a los OA MINEDUC oficiales.
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

      {/* Selector visual unificado */}
      <div className="selector-panel">
        <div>
          <div className="step-label">1. Filtrar por Ciclo (opcional)</div>
          <div className="cycle-pills">
            <button
              type="button"
              className={`cycle-pill ${selectedCiclo === "" ? "active" : ""}`}
              onClick={() => {
                onSelectCiclo("");
                setTipoFilter("");
                setOaFilter("");
              }}
            >
              <span>Todos los cursos</span>
              <span className="tabular" style={{ opacity: 0.78, fontSize: 12 }}>
                {dataset.materials.length.toLocaleString("es-CL")}
              </span>
            </button>
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
                {u.startsWith("Transversal") ? "Transversal" : u}
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
          {origenesAvailable.list.length > 1 && (
            <select
              className="select"
              style={{ width: 170 }}
              value={origenFilter}
              onChange={(e) => setOrigenFilter(e.target.value)}
              aria-label="Filtrar por origen"
            >
              <option value="">Origen: Todos</option>
              <option value="Docentes Colegio">Docentes Colegio</option>
              {origenesAvailable.hasExt && <option value="__EXT__">Solo Externos</option>}
              {origenesAvailable.list
                .filter((o) => o !== "Docentes Colegio")
                .map((o) => (
                  <option key={o} value={o}>
                    ↳ {o}
                  </option>
                ))}
            </select>
          )}

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

      {/* Panel de Objetivos de Aprendizaje MINEDUC de la Unidad + Estándares SIMCE */}
      {unitOaCards.length > 0 && (
        <div className="oa-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

          {activeStdDoc && activeCourseStdLink && (
            <div className="std-banner-strip">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Award size={15} style={{ color: "var(--navy-800)", flexShrink: 0 }} />
                <strong style={{ fontSize: 12.5, color: "var(--navy-950)" }}>
                  {activeStdDoc.titulo}
                </strong>
                <span
                  className={`badge ${
                    activeCourseStdLink.vinculo === "Directo"
                      ? "badge-ok"
                      : activeCourseStdLink.vinculo.includes("Progresión")
                      ? "badge-navy"
                      : "badge-adv"
                  }`}
                >
                  {activeCourseStdLink.vinculo}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-700)" }}>
                  Elemental: {activeStdDoc.puntajes.elemental} · Adecuado: {activeStdDoc.puntajes.adecuado}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {onOpenStandards && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      onOpenStandards(
                        selectedCurso,
                        selectedAsig,
                        selectedUnit === "Todas" ? activeCourseStdLink.unidades[0] || "Unidad 1" : selectedUnit,
                      )
                    }
                  >
                    <Target size={12} /> Pauta de Guías (3 niveles)
                  </button>
                )}
                <a
                  href={`https://drive.google.com/file/d/${activeStdDoc.driveId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                >
                  PDF SIMCE <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}

          <div className="oa-grid">
            {unitOaCards.map((item) => {
              const cardKey = `${item.unidad}-${item.oa}`;
              const isSel = oaFilter === item.oa;
              const covered = item.count > 0;
              const hasStd = item.stdIndicators.length > 0;
              const isExpanded = expandedOaKey === cardKey;
              return (
                <div
                  key={cardKey}
                  className={`oa-box ${isSel ? "selected" : ""}`}
                >
                  <div>
                    <div className="oa-box-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong className="mono" style={{ fontSize: 12.5, color: "var(--navy-900)" }}>
                          {item.oa}
                        </strong>
                        {selectedUnit === "Todas" && item.unidad !== "General" && (
                          <span className="badge badge-neutral">
                            {item.unidad.startsWith("Transversal") ? "Transv." : item.unidad}
                          </span>
                        )}
                      </div>
                      <span className={`badge ${covered ? "badge-ok" : "badge-warn"} tabular`}>
                        {covered ? `${item.count} recurso${item.count > 1 ? "s" : ""}` : "Sin material (brecha)"}
                      </span>
                    </div>
                    <div className="oa-box-desc" style={{ marginTop: 6 }} title={item.desc}>
                      {item.desc}
                    </div>

                    {hasStd && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                          {item.stdIndicators.map((ind) => (
                            <span
                              key={ind.code}
                              className={`badge mono ${
                                ind.nivelMinimo.includes("Expectativa") ? "badge-adv" : "badge-navy"
                              }`}
                              style={{ fontSize: 10 }}
                              title={`${ind.code} (${ind.eje}): ${ind.tema}`}
                            >
                              {ind.code}
                            </span>
                          ))}
                        </div>

                        {isExpanded && (
                          <div className="std-inline-drawer">
                            {item.stdSugerencia && (
                              <div style={{ fontSize: 11.5, color: "var(--navy-900)", marginBottom: 6 }}>
                                <strong>Guía:</strong> {item.stdSugerencia}
                              </div>
                            )}
                            {item.stdIndicators.map((ind) => (
                              <div key={ind.code} className="std-inline-item">
                                <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--navy-950)", marginBottom: 3 }}>
                                  <span className="mono">{ind.code}</span> · {ind.tema}
                                </div>
                                {ind.elemental && (
                                  <div style={{ fontSize: 11, color: "var(--warn-fg)", marginBottom: 2 }}>
                                    <strong>Elemental:</strong> {ind.elemental}
                                  </div>
                                )}
                                {ind.adecuado && (
                                  <div style={{ fontSize: 11, color: "var(--ok-fg)", marginBottom: 2 }}>
                                    <strong>Adecuado:</strong> {ind.adecuado}
                                  </div>
                                )}
                                {ind.avanzado && (
                                  <div style={{ fontSize: 11, color: "#3730a3" }}>
                                    <strong>Avanzado:</strong> {ind.avanzado}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onCopyText(`${item.oa}: ${item.desc}`, `${item.oa} copiado para tu guía/prueba`)}
                        title="Copiar redacción oficial MINEDUC para pegar en el encabezado de tu Word/Docs"
                      >
                        <Copy size={11} /> Copiar OA
                      </button>
                      {hasStd && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setExpandedOaKey(isExpanded ? null : cardKey)}
                            title="Ver descriptores Elemental, Adecuado y Expectativa Curricular asociados a este OA"
                          >
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {isExpanded ? "Ocultar" : `Estándares (${item.stdIndicators.length})`}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ok"
                            onClick={() =>
                              onCopyText(
                                buildOaGuideBlueprint({
                                  curso: selectedCurso,
                                  asignatura: selectedAsig,
                                  unidad: item.unidad,
                                  oa: item.oa,
                                  oaDesc: item.desc,
                                  docTitle: activeStdDoc?.titulo || "",
                                  vinculo: activeCourseStdLink?.vinculo || "",
                                  sugerencia: item.stdSugerencia,
                                  indicators: item.stdIndicators,
                                }),
                                `Pauta ${item.oa} + Estándares copiada para tu guía`,
                              )
                            }
                            title="Copiar OA junto con los niveles Elemental, Adecuado y Desafío para diseñar tu guía"
                          >
                            <Copy size={11} /> Guía
                          </button>
                        </>
                      )}
                    </div>
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
              setOrigenFilter("");
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
