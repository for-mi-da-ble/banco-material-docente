import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  buildOaGuideBlueprint,
  CICLO_ORDER,
  normText,
  sortCursos,
  type BancoDataset,
  type StandardDoc,
  type StandardIndicator,
  type StandardsDataset,
} from "../types";

interface StandardsViewProps {
  dataset: BancoDataset;
  standards: StandardsDataset;
  initialCurso?: string;
  initialAsig?: string;
  initialUnit?: string;
  onOpenUnitInPlanner: (ciclo: string, curso: string, asig: string, unidad: string) => void;
  onCopyText: (text: string, label: string) => void;
}

type ViewMode = "byUnit" | "byDoc";

function vinculoBadgeClass(vinculo: string): string {
  if (vinculo === "Directo") return "badge badge-ok";
  if (vinculo.includes("Tramo")) return "badge badge-navy";
  return "badge badge-warn";
}

export default function StandardsView({
  dataset,
  standards,
  initialCurso,
  initialAsig,
  initialUnit,
  onOpenUnitInPlanner,
  onCopyText,
}: StandardsViewProps) {
  const [mode, setMode] = useState<ViewMode>("byUnit");

  // Resolve initial selection cleanly against available courseLinks
  const defaultLink = useMemo(() => {
    if (initialCurso && initialAsig) {
      const exact = standards.courseLinks.find(
        (c) => c.curso === initialCurso && c.asignatura === initialAsig,
      );
      if (exact) return exact;
    }
    return (
      standards.courseLinks.find((c) => c.curso === "4° Básico" && c.asignatura === "Matemática") ||
      standards.courseLinks[0]
    );
  }, [standards.courseLinks, initialCurso, initialAsig]);

  const [selCiclo, setSelCiclo] = useState<string>(defaultLink?.ciclo || "1° Ciclo");
  const [selCurso, setSelCurso] = useState<string>(defaultLink?.curso || "4° Básico");
  const [selAsig, setSelAsig] = useState<string>(defaultLink?.asignatura || "Matemática");
  const [selUnit, setSelUnit] = useState<string>(() => {
    if (initialUnit && defaultLink?.unidades.includes(initialUnit)) return initialUnit;
    return defaultLink?.unidades[0] || "Unidad 1";
  });
  const [oaQuery, setOaQuery] = useState("");

  // State for "Por Documento" view
  const [selDocId, setSelDocId] = useState<string>(defaultLink?.docId || standards.docs[0]?.docId || "");
  const [ejeFilter, setEjeFilter] = useState<string>("");
  const [docSearch, setDocSearch] = useState<string>("");

  // Indexes
  const docById = useMemo(() => {
    const map = new Map<string, StandardDoc>();
    for (const d of standards.docs) map.set(d.docId, d);
    return map;
  }, [standards.docs]);

  const indicatorByCode = useMemo(() => {
    const map = new Map<string, StandardIndicator>();
    for (const d of standards.docs) {
      for (const ind of d.indicadores) map.set(ind.code, ind);
    }
    return map;
  }, [standards.docs]);

  // Reverse index: indicatorCode -> list of { ciclo, curso, asig, unidad, oa, vinculo }
  const indicatorUsage = useMemo(() => {
    const map = new Map<
      string,
      Array<{ ciclo: string; curso: string; asig: string; unidad: string; oa: string; vinculo: string }>
    >();
    const cicloByCurso = new Map<string, string>();
    for (const cl of standards.courseLinks) cicloByCurso.set(cl.curso, cl.ciclo);

    for (const [uKey, uLink] of Object.entries(standards.unitLinks)) {
      const [curso, asig, unidad] = uKey.split("|");
      const ciclo = cicloByCurso.get(curso) || "Enseñanza Media";
      for (const oaLink of uLink.oas) {
        for (const code of oaLink.indicadores) {
          const arr = map.get(code) || [];
          arr.push({ ciclo, curso, asig, unidad, oa: oaLink.oa, vinculo: uLink.vinculo });
          map.set(code, arr);
        }
      }
    }
    return map;
  }, [standards]);

  // Available courses & subjects in selected ciclo
  const cursosInCiclo = useMemo(() => {
    const set = new Set<string>();
    for (const cl of standards.courseLinks) {
      if (cl.ciclo === selCiclo) set.add(cl.curso);
    }
    return sortCursos(Array.from(set));
  }, [standards.courseLinks, selCiclo]);

  const asigsInCurso = useMemo(
    () => standards.courseLinks.filter((cl) => cl.ciclo === selCiclo && cl.curso === selCurso),
    [standards.courseLinks, selCiclo, selCurso],
  );

  const activeCourseLink = useMemo(
    () => standards.courseLinks.find((cl) => cl.curso === selCurso && cl.asignatura === selAsig) || null,
    [standards.courseLinks, selCurso, selAsig],
  );

  const activeUnitKey = `${selCurso}|${selAsig}|${selUnit}`;
  const activeUnitLink = standards.unitLinks[activeUnitKey] || null;
  const activeDoc = activeUnitLink ? docById.get(activeUnitLink.docId) || null : null;

  const oaEntriesInUnit = useMemo(
    () => dataset.oaCatalog[activeUnitKey] || [],
    [dataset.oaCatalog, activeUnitKey],
  );

  const covInUnit = useMemo(
    () =>
      dataset.coverage.find(
        (c) => c.curso === selCurso && c.asig === selAsig && c.unidad === selUnit,
      ) || null,
    [dataset.coverage, selCurso, selAsig, selUnit],
  );

  const covByOa = useMemo(() => {
    const map = new Map<string, { covered: boolean; count: number }>();
    if (covInUnit) {
      for (const [code, isCov, cnt] of covInUnit.oas) {
        map.set(code, { covered: isCov === 1, count: cnt });
      }
    }
    return map;
  }, [covInUnit]);

  const unitOaRows = useMemo(() => {
    if (!activeUnitLink) return [];
    const q = normText(oaQuery.trim());
    const mapLink = new Map(activeUnitLink.oas.map((o) => [o.oa, o]));
    return oaEntriesInUnit
      .map((entry) => {
        const link = mapLink.get(entry.oa) || null;
        const inds = link
          ? link.indicadores.map((c) => indicatorByCode.get(c)).filter((x): x is StandardIndicator => Boolean(x))
          : [];
        const cov = covByOa.get(entry.oa) || { covered: false, count: 0 };
        return { entry, link, inds, cov };
      })
      .filter((row) => {
        if (!q) return true;
        const hay = normText(
          `${row.entry.oa} ${row.entry.eje} ${row.entry.desc} ${row.link?.sugerencia || ""} ${row.inds
            .map((i) => `${i.code} ${i.eje} ${i.tema} ${i.elemental || ""} ${i.adecuado || ""} ${i.avanzado || ""}`)
            .join(" ")}`,
        );
        return hay.includes(q);
      });
  }, [activeUnitLink, oaEntriesInUnit, indicatorByCode, covByOa, oaQuery]);

  const linkedOaRows = unitOaRows.filter((r) => r.link !== null);
  const nonSimceOaRows = unitOaRows.filter((r) => r.link === null);

  const handleSelectCiclo = (ciclo: string) => {
    setSelCiclo(ciclo);
    const first = standards.courseLinks.find((cl) => cl.ciclo === ciclo);
    if (first) {
      setSelCurso(first.curso);
      setSelAsig(first.asignatura);
      setSelUnit(first.unidades[0] || "Unidad 1");
    }
  };

  const handleSelectCurso = (curso: string) => {
    setSelCurso(curso);
    const sameAsig = standards.courseLinks.find((cl) => cl.curso === curso && cl.asignatura === selAsig);
    const target = sameAsig || standards.courseLinks.find((cl) => cl.curso === curso);
    if (target) {
      setSelAsig(target.asignatura);
      setSelUnit(target.unidades.includes(selUnit) ? selUnit : target.unidades[0] || "Unidad 1");
    }
  };

  const handleSelectAsig = (asig: string) => {
    setSelAsig(asig);
    const target = standards.courseLinks.find((cl) => cl.curso === selCurso && cl.asignatura === asig);
    if (target) {
      setSelUnit(target.unidades.includes(selUnit) ? selUnit : target.unidades[0] || "Unidad 1");
    }
  };

  const handleCopyFullUnitBlueprint = () => {
    if (!activeDoc || !activeUnitLink) return;
    const header = [
      `====================================================================`,
      `PAUTA DE DISEÑO DE GUÍAS Y EVALUACIONES CON ESTÁNDARES DE APRENDIZAJE`,
      `${selCurso} · ${selAsig} · ${selUnit}`,
      `Referente oficial: ${activeDoc.titulo} (${activeUnitLink.vinculo})`,
      `Puntajes SIMCE: Insuficiente (${activeDoc.puntajes.insuficiente}) | Elemental (${activeDoc.puntajes.elemental}) | Adecuado (${activeDoc.puntajes.adecuado})`,
      `====================================================================`,
      "",
      "ESTRUCTURA SUGERIDA PARA LA GUÍA / EVALUACIÓN:",
      "• 25-30% Inicio / Nivelación (superar Insuficiente → consolidar Nivel Elemental)",
      "• 50-55% Desarrollo / Meta Curricular (consolidar Nivel Adecuado)",
      "• 15-25% Cierre / Desafío (Expectativa Curricular / Sobre Nivel Adecuado)",
      "",
    ];
    const body = linkedOaRows.map((r) =>
      buildOaGuideBlueprint({
        curso: selCurso,
        asignatura: selAsig,
        unidad: selUnit,
        oa: r.entry.oa,
        oaDesc: r.entry.desc,
        docTitle: activeDoc.titulo,
        vinculo: activeUnitLink.vinculo,
        sugerencia: r.link!.sugerencia,
        indicators: r.inds,
      }),
    );
    onCopyText(
      [...header, ...body].join("\n\n--------------------------------------------------------------------\n\n"),
      `Pauta completa de ${selCurso} · ${selAsig} · ${selUnit} copiada`,
    );
  };

  // Active document for "byDoc" view
  const inspectedDoc = docById.get(selDocId) || standards.docs[0];
  const docEjes = useMemo(() => {
    if (!inspectedDoc) return [];
    const list: string[] = [];
    for (const ind of inspectedDoc.indicadores) {
      if (!list.includes(ind.eje)) list.push(ind.eje);
    }
    return list;
  }, [inspectedDoc]);

  const filteredDocIndicators = useMemo(() => {
    if (!inspectedDoc) return [];
    const q = normText(docSearch.trim());
    return inspectedDoc.indicadores.filter((ind) => {
      if (ejeFilter && ind.eje !== ejeFilter) return false;
      if (!q) return true;
      return normText(
        `${ind.code} ${ind.eje} ${ind.tema} ${ind.elemental || ""} ${ind.adecuado || ""} ${ind.avanzado || ""}`,
      ).includes(q);
    });
  }, [inspectedDoc, ejeFilter, docSearch]);

  return (
    <section aria-label="Estándares de Aprendizaje SIMCE asociados a OA por unidad">
      <div className="section-head">
        <div>
          <h1>Estándares de Aprendizaje SIMCE × OA por Unidad</h1>
          <p>
            Asociación de los <strong>{standards.meta.totals.documentos} documentos oficiales</strong> ({standards.meta.totals.indicadores} indicadores) con los{" "}
            <strong>{standards.meta.totals.oas_unidad_vinculados} OA por unidad</strong> (1° Básico a 2° Medio) para diseñar guías y evaluaciones en 3 niveles de logro.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href={standards.meta.sheet_matrix_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <ExternalLink size={14} /> Abrir Matriz en Google Sheets
          </a>
          <a
            href="./data/matriz_estandares_oa_unidad.csv"
            download="matriz_estandares_oa_unidad.csv"
            className="btn"
          >
            <Download size={14} /> Descargar CSV
          </a>
          <a
            href={standards.meta.source_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            <FolderOpen size={14} /> Carpeta PDFs SIMCE
          </a>
        </div>
      </div>

      {/* Switch de Modo */}
      <div className="panel panel-pad" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${mode === "byUnit" ? "btn-primary" : ""}`}
            onClick={() => setMode("byUnit")}
          >
            <Target size={14} /> Por Curso y Unidad (Preparar Guías)
          </button>
          <button
            type="button"
            className={`btn ${mode === "byDoc" ? "btn-primary" : ""}`}
            onClick={() => setMode("byDoc")}
          >
            <FileText size={14} /> Por Documento de Estándares (10 PDFs)
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--ink-500)" }}>
          <span className="badge badge-warn">Elemental: Nivelación / Inicio (25–30%)</span>
          <span className="badge badge-ok">Adecuado: Meta Guía / Evaluación (50–55%)</span>
          <span className="badge badge-adv">Expectativa Curricular: Desafío (15–25%)</span>
        </div>
      </div>

      {mode === "byUnit" ? (
        <>
          {/* Selectores Ciclo -> Curso -> Asignatura -> Unidad */}
          <div className="selector-panel">
            <div>
              <div className="step-label">1. Ciclo</div>
              <div className="cycle-pills">
                {CICLO_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`cycle-pill ${selCiclo === c ? "active" : ""}`}
                    onClick={() => handleSelectCiclo(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="step-label">2. Curso</div>
              <div className="course-tiles">
                {cursosInCiclo.map((curso) => {
                  const hasDirect = standards.courseLinks.some(
                    (cl) => cl.curso === curso && cl.vinculo === "Directo",
                  );
                  return (
                    <button
                      key={curso}
                      type="button"
                      className={`course-tile ${selCurso === curso ? "active" : ""}`}
                      onClick={() => handleSelectCurso(curso)}
                    >
                      <span className="course-tile-name">{curso}</span>
                      <span className="course-tile-meta">
                        {hasDirect ? "Evaluado SIMCE" : "Progresión"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="step-label">3. Asignatura con Estándares SIMCE</div>
              <div className="subject-chips">
                {asigsInCurso.map((cl) => (
                  <button
                    key={cl.asignatura}
                    type="button"
                    className={`subject-chip ${selAsig === cl.asignatura ? "active" : ""}`}
                    onClick={() => handleSelectAsig(cl.asignatura)}
                  >
                    <span>{cl.asignatura}</span>
                    <span className="subject-chip-count">
                      {cl.vinculo === "Directo" ? "Directo" : "Progresión"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Barra de Unidades */}
          {activeCourseLink && (
            <div className="unit-bar">
              <div className="unit-tabs">
                {activeCourseLink.unidades.map((u) => {
                  const uInfo = standards.unitLinks[`${selCurso}|${selAsig}|${u}`];
                  return (
                    <button
                      key={u}
                      type="button"
                      className={`unit-tab ${selUnit === u ? "active" : ""}`}
                      onClick={() => setSelUnit(u)}
                    >
                      <Layers size={13} />
                      {u.startsWith("Transversal") ? "Transversal" : u}
                      {uInfo && (
                        <span className="tabular" style={{ opacity: 0.78, fontSize: 11.5 }}>
                          ({uInfo.oasVinculados} OA)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="search-wrap" style={{ minWidth: 230, maxWidth: 320 }}>
                <Search size={14} />
                <input
                  type="search"
                  className="input"
                  placeholder="Filtrar OA o descriptor..."
                  value={oaQuery}
                  onChange={(e) => setOaQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Tarjeta Resumen del Estándar Activo */}
          {activeDoc && activeUnitLink && (
            <div className="panel panel-pad" style={{ marginBottom: 18, background: "linear-gradient(135deg, #f3f7fc 0%, #ffffff 70%)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 420px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <Award size={17} style={{ color: "var(--navy-800)" }} />
                    <strong style={{ fontSize: 15.5, color: "var(--navy-950)" }}>{activeDoc.titulo}</strong>
                    <span className={vinculoBadgeClass(activeUnitLink.vinculo)}>
                      {activeUnitLink.vinculo}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginBottom: 8 }}>
                    {activeUnitLink.notaVinculo} · Cobertura oficial: <strong>{activeDoc.cobertura}</strong> · {activeDoc.decreto}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    <span className="badge badge-err">Insuficiente: {activeDoc.puntajes.insuficiente}</span>
                    <span className="badge badge-warn">Elemental: {activeDoc.puntajes.elemental}</span>
                    <span className="badge badge-ok">Adecuado: {activeDoc.puntajes.adecuado}</span>
                    <span className="badge badge-neutral tabular">
                      {activeUnitLink.oasVinculados} OA vinculados · {activeUnitLink.indicadoresUnidad.length} indicadores únicos en {selUnit}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" onClick={handleCopyFullUnitBlueprint}>
                    <Copy size={14} /> Copiar Pauta de la Unidad
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpenUnitInPlanner(selCiclo, selCurso, selAsig, selUnit)}
                  >
                    <BookOpen size={14} /> Ver recursos en Planificador <ArrowRight size={13} />
                  </button>
                  <a
                    href={`https://drive.google.com/file/d/${activeDoc.driveId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                  >
                    <FileText size={14} /> PDF Oficial <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Tarjetas OA × Estándares (3 niveles) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {linkedOaRows.map(({ entry, link, inds, cov }) => (
              <article key={entry.oa} className="panel panel-pad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div style={{ flex: "1 1 480px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                      <strong className="mono" style={{ fontSize: 14, color: "var(--navy-900)" }}>
                        {entry.oa}
                      </strong>
                      <span className="badge badge-navy">{entry.eje}</span>
                      <span className={`badge ${cov.covered ? "badge-ok" : "badge-warn"} tabular`}>
                        {cov.covered ? `${cov.count} recurso${cov.count > 1 ? "s" : ""} en banco` : "Sin material en banco (prioritario)"}
                      </span>
                      <span className="badge badge-neutral tabular">
                        {inds.length} estándar{inds.length > 1 ? "es" : ""} asociado{inds.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--ink-900)", lineHeight: 1.5 }}>
                      {entry.desc}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        onCopyText(
                          buildOaGuideBlueprint({
                            curso: selCurso,
                            asignatura: selAsig,
                            unidad: selUnit,
                            oa: entry.oa,
                            oaDesc: entry.desc,
                            docTitle: activeDoc?.titulo || "",
                            vinculo: activeUnitLink?.vinculo || "",
                            sugerencia: link!.sugerencia,
                            indicators: inds,
                          }),
                          `Pauta de ${entry.oa} + Estándares copiada`,
                        )
                      }
                    >
                      <Copy size={12} /> Copiar OA + Estándares
                    </button>
                  </div>
                </div>

                {/* Orientación didáctica para guías */}
                <div className="std-tip-box">
                  <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--navy-800)" }} />
                  <div>
                    <strong>Orientación para preparar guías y evaluaciones: </strong>
                    {link!.sugerencia}
                  </div>
                </div>

                {/* Descriptores por estándar en 3 niveles */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {inds.map((ind) => (
                    <div key={ind.code} className="std-indicator-block">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span className="mono badge badge-navy">{ind.code}</span>
                        <strong style={{ fontSize: 13, color: "var(--navy-950)" }}>{ind.tema}</strong>
                        <span className="badge badge-neutral">{ind.eje}</span>
                        {ind.nivelMinimo.includes("Expectativa") && (
                          <span className="badge badge-adv">Solo Expectativa Curricular (Sobre Adecuado)</span>
                        )}
                      </div>
                      <div className="std-tier-grid">
                        <div className="std-tier-card std-tier-elem">
                          <div className="std-tier-label">Nivel Elemental · Inicio / Nivelación</div>
                          <div className="std-tier-body">
                            {ind.elemental || "No exigido como requisito mínimo en Elemental. Activar aprendizajes previos con andamiaje guiado."}
                          </div>
                        </div>
                        <div className="std-tier-card std-tier-adec">
                          <div className="std-tier-label">Nivel Adecuado · Meta de Guía / Prueba</div>
                          <div className="std-tier-body">
                            {ind.adecuado || "Evaluado sobre el puntaje de corte de Nivel Adecuado (ver Expectativa Curricular)."}
                          </div>
                        </div>
                        <div className="std-tier-card std-tier-adv">
                          <div className="std-tier-label">Sobre Adecuado · Desafío / Profundización</div>
                          <div className="std-tier-body">
                            {ind.avanzado || "Transferir el indicador a contextos nuevos, textos menos familiares o problemas de mayor autonomía."}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {/* Nota transparente sobre OAs de Escritura / Comunicación Oral en Lenguaje */}
          {nonSimceOaRows.length > 0 && (
            <div className="panel panel-pad" style={{ marginTop: 16, background: "var(--surface-warm)" }}>
              <strong style={{ fontSize: 13, color: "var(--ink-700)" }}>
                Otros OA de {selUnit} no evaluados directamente en SIMCE Lectura ({nonSimceOaRows.length} OA de Escritura / Comunicación Oral)
              </strong>
              <p style={{ margin: "4px 0 10px", fontSize: 12, color: "var(--ink-500)" }}>
                Los estándares oficiales disponibles en la carpeta SIMCE corresponden al eje Lectura. Estos OA se trabajan en paralelo para potenciar producción escrita y oralidad:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {nonSimceOaRows.map(({ entry }) => (
                  <span key={entry.oa} className="badge badge-neutral" title={entry.desc}>
                    <span className="mono">{entry.oa}</span> · {entry.eje}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ================== MODO 2: POR DOCUMENTO DE ESTÁNDARES ================== */
        <>
          <div className="selector-panel">
            <div>
              <div className="step-label">Selecciona uno de los 10 Documentos Oficiales de Estándares SIMCE</div>
              <div className="subject-chips">
                {standards.docs.map((d) => (
                  <button
                    key={d.docId}
                    type="button"
                    className={`subject-chip ${selDocId === d.docId ? "active" : ""}`}
                    onClick={() => {
                      setSelDocId(d.docId);
                      setEjeFilter("");
                    }}
                  >
                    <span>{d.fileName.replace(".pdf", "")}</span>
                    <span className="subject-chip-count tabular">{d.indicadores.length}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {inspectedDoc && (
            <>
              <div className="panel panel-pad" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: "var(--navy-950)" }}>{inspectedDoc.titulo}</h2>
                    <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginTop: 4 }}>
                      Cobertura oficial: <strong>{inspectedDoc.cobertura}</strong> · {inspectedDoc.decreto}
                    </div>
                  </div>
                  <a
                    href={`https://drive.google.com/file/d/${inspectedDoc.driveId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    <FileText size={14} /> Abrir {inspectedDoc.fileName} en Drive <ExternalLink size={12} />
                  </a>
                </div>

                {/* Resumen oficial de los 3 niveles + Expectativa */}
                <div className="std-tier-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
                  <div className="std-tier-card std-tier-insuf">
                    <div className="std-tier-label">Insuficiente ({inspectedDoc.puntajes.insuficiente})</div>
                    <div className="std-tier-body">{inspectedDoc.resumenNiveles.insuficiente}</div>
                  </div>
                  <div className="std-tier-card std-tier-elem">
                    <div className="std-tier-label">Elemental ({inspectedDoc.puntajes.elemental})</div>
                    <div className="std-tier-body">{inspectedDoc.resumenNiveles.elemental}</div>
                  </div>
                  <div className="std-tier-card std-tier-adec">
                    <div className="std-tier-label">Adecuado ({inspectedDoc.puntajes.adecuado})</div>
                    <div className="std-tier-body">{inspectedDoc.resumenNiveles.adecuado}</div>
                  </div>
                  <div className="std-tier-card std-tier-adv">
                    <div className="std-tier-label">Sobre Adecuado / Expectativa Curricular</div>
                    <div className="std-tier-body">{inspectedDoc.resumenNiveles.sobreAdecuado}</div>
                  </div>
                </div>
              </div>

              {/* Filtros de Eje + Búsqueda */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <div className="filter-pills">
                  <button
                    type="button"
                    className={`filter-pill ${ejeFilter === "" ? "active" : ""}`}
                    onClick={() => setEjeFilter("")}
                  >
                    Todos los ejes ({inspectedDoc.indicadores.length})
                  </button>
                  {docEjes.map((eje) => (
                    <button
                      key={eje}
                      type="button"
                      className={`filter-pill ${ejeFilter === eje ? "active" : ""}`}
                      onClick={() => setEjeFilter(ejeFilter === eje ? "" : eje)}
                    >
                      {eje}
                    </button>
                  ))}
                </div>
                <div className="search-wrap" style={{ minWidth: 230, maxWidth: 320 }}>
                  <Search size={14} />
                  <input
                    type="search"
                    className="input"
                    placeholder="Buscar indicador..."
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Lista de indicadores con chips de cursos/unidades/OA donde se enseña */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredDocIndicators.map((ind) => {
                  const usages = indicatorUsage.get(ind.code) || [];
                  return (
                    <article key={ind.code} className="panel panel-pad">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <span className="mono badge badge-navy">{ind.code}</span>
                        <strong style={{ fontSize: 14, color: "var(--navy-950)" }}>{ind.tema}</strong>
                        <span className="badge badge-neutral">{ind.eje}</span>
                        <span className="badge badge-ok tabular">{usages.length} OA-unidad asociados</span>
                      </div>

                      <div className="std-tier-grid">
                        <div className="std-tier-card std-tier-elem">
                          <div className="std-tier-label">Nivel Elemental</div>
                          <div className="std-tier-body">{ind.elemental || "—"}</div>
                        </div>
                        <div className="std-tier-card std-tier-adec">
                          <div className="std-tier-label">Nivel Adecuado</div>
                          <div className="std-tier-body">{ind.adecuado || "—"}</div>
                        </div>
                        <div className="std-tier-card std-tier-adv">
                          <div className="std-tier-label">Sobre Adecuado / Expectativa Curricular</div>
                          <div className="std-tier-body">{ind.avanzado || "—"}</div>
                        </div>
                      </div>

                      {usages.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-500)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                            Dónde se enseña (clic para abrir la unidad en Planificador):
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {usages.map((u, idx) => (
                              <button
                                key={`${u.curso}-${u.unidad}-${u.oa}-${idx}`}
                                type="button"
                                className={`badge ${u.vinculo === "Directo" ? "badge-ok" : "badge-navy"}`}
                                style={{ cursor: "pointer" }}
                                onClick={() => onOpenUnitInPlanner(u.ciclo, u.curso, u.asig, u.unidad)}
                              >
                                {u.curso} · {u.unidad.startsWith("Transversal") ? "Transv." : u.unidad} · <span className="mono">{u.oa}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
