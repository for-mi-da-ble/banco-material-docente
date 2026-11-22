import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarRange,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  Printer,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  buildOaGuideBlueprint,
  buildStandardAnnualBlueprint,
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

type ViewMode = "annualByStd" | "byUnit" | "byDoc";

function vinculoBadgeClass(vinculo: string): string {
  if (vinculo === "Directo") return "badge badge-ok";
  if (vinculo.includes("Progresión")) return "badge badge-navy";
  return "badge badge-adv";
}

function oaNumericKey(oa: string): number {
  const m = oa.match(/\d+/);
  return m ? Number(m[0]) : 999;
}

function shortUnitLabel(u: string): string {
  if (u.startsWith("Transversal")) return "Transversal";
  if (u.startsWith("Unidad ")) return `U${u.slice(7)}`;
  return u;
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
  // Si el docente viene desde una unidad específica del Planificador, abre "Por Curso y Unidad";
  // al entrar directo a la pestaña Estándares SIMCE, abre "Plan Anual por Estándares" (sin unidades).
  const [mode, setMode] = useState<ViewMode>(initialUnit ? "byUnit" : "annualByStd");

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

  // Filtros exclusivos del Plan Anual por Estándares
  const [annualEjeFilter, setAnnualEjeFilter] = useState<string>("");
  const [annualNivelFilter, setAnnualNivelFilter] = useState<string>("");
  const [annualQuery, setAnnualQuery] = useState<string>("");

  // Estado para vista "Por Documento"
  const [selDocId, setSelDocId] = useState<string>(defaultLink?.docId || standards.docs[0]?.docId || "");
  const [ejeFilter, setEjeFilter] = useState<string>("");
  const [docSearch, setDocSearch] = useState<string>("");

  // Índices maestros
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

  // Índice inverso global: indicatorCode -> usos por curso/unidad/OA
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

  // Cursos y asignaturas disponibles en el ciclo activo
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

  const activeCourseDoc = activeCourseLink ? docById.get(activeCourseLink.docId) || null : null;

  // =========================================================================
  // DATOS PARA MODO 1: PLAN ANUAL POR ESTÁNDARES (INDEPENDIENTE DE UNIDADES)
  // =========================================================================
  const annualStandardData = useMemo(() => {
    if (!activeCourseLink || !activeCourseDoc) {
      return {
        activeStandards: [] as Array<{
          indicator: StandardIndicator;
          oas: Array<{
            oa: string;
            eje: string;
            desc: string;
            units: string[];
            sugerencia: string;
            covered: boolean;
            matCount: number;
          }>;
          coveredOas: number;
        }>,
        otherCourseStandards: [] as Array<{
          indicator: StandardIndicator;
          otherCourses: Array<{ ciclo: string; curso: string; asig: string }>;
        }>,
        ejesSummary: [] as Array<{ eje: string; stdCount: number; uniqueOaCount: number }>,
        totalUniqueOas: 0,
        totalCoveredUniqueOas: 0,
        nonSimceUniqueOas: [] as Array<{ oa: string; eje: string; desc: string }>,
      };
    }

    // 1) Reunir todos los OA únicos del curso/asignatura a lo largo de TODO el año (independiente de unidades)
    const uniqueOaMap = new Map<
      string,
      {
        oa: string;
        eje: string;
        desc: string;
        units: string[];
        sugerencia: string;
        indicadores: Set<string>;
        covered: boolean;
        matCount: number;
      }
    >();

    // Cobertura agregada por OA en el curso/asignatura
    const covByOaAnnual = new Map<string, { covered: boolean; count: number }>();
    for (const c of dataset.coverage) {
      if (c.curso === selCurso && c.asig === selAsig) {
        for (const [oaCode, isCov, cnt] of c.oas) {
          const prev = covByOaAnnual.get(oaCode) || { covered: false, count: 0 };
          covByOaAnnual.set(oaCode, {
            covered: prev.covered || isCov === 1,
            count: prev.count + cnt,
          });
        }
      }
    }

    for (const u of activeCourseLink.unidades) {
      const uKey = `${selCurso}|${selAsig}|${u}`;
      const catEntries = dataset.oaCatalog[uKey] || [];
      const uStd = standards.unitLinks[uKey];
      const oaStdMap = new Map((uStd?.oas || []).map((o) => [o.oa, o]));

      for (const entry of catEntries) {
        let item = uniqueOaMap.get(entry.oa);
        if (!item) {
          const cov = covByOaAnnual.get(entry.oa) || { covered: false, count: 0 };
          item = {
            oa: entry.oa,
            eje: entry.eje,
            desc: entry.desc,
            units: [],
            sugerencia: "",
            indicadores: new Set<string>(),
            covered: cov.covered,
            matCount: cov.count,
          };
          uniqueOaMap.set(entry.oa, item);
        }
        if (!item.units.includes(u)) item.units.push(u);
        const link = oaStdMap.get(entry.oa);
        if (link) {
          if (!item.sugerencia && link.sugerencia) item.sugerencia = link.sugerencia;
          for (const code of link.indicadores) item.indicadores.add(code);
        }
      }
    }

    // 2) Invertir: cada estándar del documento aparece UNA SOLA VEZ agrupando todos los OA del curso que involucra
    const activeStandards: Array<{
      indicator: StandardIndicator;
      oas: Array<{
        oa: string;
        eje: string;
        desc: string;
        units: string[];
        sugerencia: string;
        covered: boolean;
        matCount: number;
      }>;
      coveredOas: number;
    }> = [];

    const otherCourseStandards: Array<{
      indicator: StandardIndicator;
      otherCourses: Array<{ ciclo: string; curso: string; asig: string }>;
    }> = [];

    const ejeStats = new Map<string, { stdCount: number; oaSet: Set<string> }>();
    const allLinkedOas = new Set<string>();

    for (const ind of activeCourseDoc.indicadores) {
      const involved = Array.from(uniqueOaMap.values())
        .filter((o) => o.indicadores.has(ind.code))
        .sort((a, b) => oaNumericKey(a.oa) - oaNumericKey(b.oa));

      if (involved.length > 0) {
        const coveredOas = involved.filter((o) => o.covered).length;
        activeStandards.push({
          indicator: ind,
          oas: involved.map((o) => ({
            oa: o.oa,
            eje: o.eje,
            desc: o.desc,
            units: o.units,
            sugerencia: o.sugerencia,
            covered: o.covered,
            matCount: o.matCount,
          })),
          coveredOas,
        });
        const st = ejeStats.get(ind.eje) || { stdCount: 0, oaSet: new Set<string>() };
        st.stdCount += 1;
        for (const o of involved) {
          st.oaSet.add(o.oa);
          allLinkedOas.add(o.oa);
        }
        ejeStats.set(ind.eje, st);
      } else {
        // Estándar del documento trabajado en otros cursos del tramo/ciclo
        const usages = indicatorUsage.get(ind.code) || [];
        const seenOther = new Set<string>();
        const otherCourses: Array<{ ciclo: string; curso: string; asig: string }> = [];
        for (const u of usages) {
          const k = `${u.curso}|${u.asig}`;
          if (u.curso !== selCurso && !seenOther.has(k)) {
            seenOther.add(k);
            otherCourses.push({ ciclo: u.ciclo, curso: u.curso, asig: u.asig });
          }
        }
        otherCourseStandards.push({ indicator: ind, otherCourses });
      }
    }

    const ejesSummary = Array.from(ejeStats.entries()).map(([eje, st]) => ({
      eje,
      stdCount: st.stdCount,
      uniqueOaCount: st.oaSet.size,
    }));

    const totalUniqueOas = allLinkedOas.size;
    const totalCoveredUniqueOas = Array.from(allLinkedOas).filter(
      (oaCode) => uniqueOaMap.get(oaCode)?.covered,
    ).length;

    const nonSimceUniqueOas = Array.from(uniqueOaMap.values())
      .filter((o) => o.indicadores.size === 0)
      .sort((a, b) => oaNumericKey(a.oa) - oaNumericKey(b.oa))
      .map((o) => ({ oa: o.oa, eje: o.eje, desc: o.desc }));

    return {
      activeStandards,
      otherCourseStandards,
      ejesSummary,
      totalUniqueOas,
      totalCoveredUniqueOas,
      nonSimceUniqueOas,
    };
  }, [activeCourseLink, activeCourseDoc, dataset.oaCatalog, dataset.coverage, standards.unitLinks, indicatorUsage, selCurso, selAsig]);

  const filteredAnnualStandards = useMemo(() => {
    const q = normText(annualQuery.trim());
    return annualStandardData.activeStandards.filter((item) => {
      if (annualEjeFilter && item.indicator.eje !== annualEjeFilter) return false;
      if (annualNivelFilter) {
        if (annualNivelFilter === "Elemental" && item.indicator.nivelMinimo !== "Elemental") return false;
        if (annualNivelFilter === "Adecuado" && item.indicator.nivelMinimo !== "Adecuado") return false;
        if (
          annualNivelFilter === "Expectativa" &&
          !item.indicator.nivelMinimo.includes("Expectativa")
        )
          return false;
      }
      if (!q) return true;
      const hay = normText(
        `${item.indicator.code} ${item.indicator.eje} ${item.indicator.tema} ${item.indicator.elemental || ""} ${item.indicator.adecuado || ""} ${item.indicator.avanzado || ""} ${item.oas
          .map((o) => `${o.oa} ${o.eje} ${o.desc} ${o.sugerencia}`)
          .join(" ")}`,
      );
      return hay.includes(q);
    });
  }, [annualStandardData.activeStandards, annualEjeFilter, annualNivelFilter, annualQuery]);

  // Agrupar estándares filtrados por Eje SIMCE preservando orden oficial del documento
  const annualGroupedByEje = useMemo(() => {
    const groups: Array<{ eje: string; items: typeof filteredAnnualStandards }> = [];
    const idxByEje = new Map<string, number>();
    for (const item of filteredAnnualStandards) {
      const existing = idxByEje.get(item.indicator.eje);
      if (existing === undefined) {
        idxByEje.set(item.indicator.eje, groups.length);
        groups.push({ eje: item.indicator.eje, items: [item] });
      } else {
        groups[existing].items.push(item);
      }
    }
    return groups;
  }, [filteredAnnualStandards]);

  const handleCopyFullAnnualPlan = () => {
    if (!activeCourseDoc || !activeCourseLink) return;
    const header = [
      `====================================================================`,
      `PLAN ANUAL ORGANIZADO POR ESTÁNDARES DE APRENDIZAJE (SIN UNIDADES)`,
      `${selCurso} · ${selAsig}`,
      `Referente oficial: ${activeCourseDoc.titulo} (${activeCourseLink.vinculo})`,
      `Estándares activos del año: ${annualStandardData.activeStandards.length} · OA únicos integrados: ${annualStandardData.totalUniqueOas}`,
      `Puntajes SIMCE: Insuficiente (${activeCourseDoc.puntajes.insuficiente}) | Elemental (${activeCourseDoc.puntajes.elemental}) | Adecuado (${activeCourseDoc.puntajes.adecuado})`,
      `====================================================================`,
    ];
    const blocks = filteredAnnualStandards.map((item) =>
      buildStandardAnnualBlueprint({
        curso: selCurso,
        asignatura: selAsig,
        docTitle: activeCourseDoc.titulo,
        vinculo: activeCourseLink.vinculo,
        indicator: item.indicator,
        oas: item.oas,
      }),
    );
    onCopyText(
      [...header, ...blocks].join("\n\n--------------------------------------------------------------------\n\n"),
      `Plan Anual por Estándares de ${selCurso} · ${selAsig} copiado`,
    );
  };

  // =========================================================================
  // DATOS PARA MODO 2: POR CURSO Y UNIDAD
  // =========================================================================
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
    setAnnualEjeFilter("");
    const first = standards.courseLinks.find((cl) => cl.ciclo === ciclo);
    if (first) {
      setSelCurso(first.curso);
      setSelAsig(first.asignatura);
      setSelUnit(first.unidades[0] || "Unidad 1");
    }
  };

  const handleSelectCurso = (curso: string) => {
    setSelCurso(curso);
    setAnnualEjeFilter("");
    const sameAsig = standards.courseLinks.find((cl) => cl.curso === curso && cl.asignatura === selAsig);
    const target = sameAsig || standards.courseLinks.find((cl) => cl.curso === curso);
    if (target) {
      setSelAsig(target.asignatura);
      setSelUnit(target.unidades.includes(selUnit) ? selUnit : target.unidades[0] || "Unidad 1");
    }
  };

  const handleSelectAsig = (asig: string) => {
    setSelAsig(asig);
    setAnnualEjeFilter("");
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

  // =========================================================================
  // DATOS PARA MODO 3: POR DOCUMENTO DE ESTÁNDARES (10 PDFs)
  // =========================================================================
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
    <section aria-label="Estándares de Aprendizaje SIMCE asociados a OA">
      <div className="section-head">
        <div>
          <h1>Estándares de Aprendizaje SIMCE × Objetivos de Aprendizaje</h1>
          <p>
            Organiza el año completo por <strong>Estándares de Aprendizaje</strong> (viendo qué OA involucra cada estándar) o revisa el detalle por unidad y por documento oficial.
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="https://for-mi-da-ble.github.io/trayectorias-simce/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <ExternalLink size={14} /> Mapa Visual de Trayectorias SIMCE
          </a>
          <a
            href={standards.meta.sheet_matrix_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            <ExternalLink size={14} /> Matriz en Google Sheets
          </a>
          <a
            href="./data/plan_anual_por_estandares.csv"
            download="plan_anual_por_estandares.csv"
            className="btn"
          >
            <Download size={14} /> CSV Plan Anual
          </a>
          <a
            href="./data/matriz_estandares_oa_unidad.csv"
            download="matriz_estandares_oa_unidad.csv"
            className="btn"
          >
            <Download size={14} /> CSV por Unidad
          </a>
          <a
            href={standards.meta.source_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            <FolderOpen size={14} /> PDFs SIMCE
          </a>
        </div>
      </div>

      {/* Selector de Vista (3 modos) */}
      <div className="panel panel-pad no-print" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${mode === "annualByStd" ? "btn-primary" : ""}`}
            onClick={() => setMode("annualByStd")}
          >
            <CalendarRange size={14} /> Plan Anual por Estándares (sin unidades)
          </button>
          <button
            type="button"
            className={`btn ${mode === "byUnit" ? "btn-primary" : ""}`}
            onClick={() => setMode("byUnit")}
          >
            <Target size={14} /> Por Curso y Unidad
          </button>
          <button
            type="button"
            className={`btn ${mode === "byDoc" ? "btn-primary" : ""}`}
            onClick={() => setMode("byDoc")}
          >
            <FileText size={14} /> Por Documento (10 PDFs)
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--ink-500)" }}>
          <span className="badge badge-warn">Elemental: Nivelación (25–30%)</span>
          <span className="badge badge-ok">Adecuado: Meta (50–55%)</span>
          <span className="badge badge-adv">Expectativa Curricular: Desafío (15–25%)</span>
        </div>
      </div>

      {/* Selectores compartidos de Ciclo -> Curso -> Asignatura para "annualByStd" y "byUnit" */}
      {mode !== "byDoc" && (
        <div className="selector-panel no-print">
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
                      {hasDirect ? "Directo" : "Progresión a Directo"}
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
                  <span className="subject-chip-count">{cl.vinculo}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODO 1: PLAN ANUAL POR ESTÁNDARES (INDEPENDIENTE DE UNIDADES)       */}
      {/* =================================================================== */}
      {mode === "annualByStd" && activeCourseDoc && activeCourseLink && (
        <>
          {/* Cabecera del Plan Anual */}
          <div
            className="panel panel-pad"
            style={{ marginBottom: 16, background: "linear-gradient(135deg, #f3f7fc 0%, #ffffff 72%)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 440px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <CalendarRange size={18} style={{ color: "var(--navy-800)" }} />
                  <strong style={{ fontSize: 16, color: "var(--navy-950)" }}>
                    Plan Anual por Estándares — {selCurso} · {selAsig}
                  </strong>
                  <span className={vinculoBadgeClass(activeCourseLink.vinculo)}>
                    {activeCourseLink.vinculo}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginBottom: 8 }}>
                  Referente: <strong>{activeCourseDoc.titulo}</strong> · {activeCourseLink.notaVinculo} · Cobertura oficial: {activeCourseDoc.cobertura}.
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", fontSize: 12 }}>
                  <span className="badge badge-navy tabular">
                    {annualStandardData.activeStandards.length} estándares únicos en el año
                  </span>
                  <span className="badge badge-ok tabular">
                    {annualStandardData.totalUniqueOas} OA del curso integrados ({annualStandardData.totalCoveredUniqueOas} con material en banco)
                  </span>
                  <span className="badge badge-err">Insuficiente: {activeCourseDoc.puntajes.insuficiente}</span>
                  <span className="badge badge-warn">Elemental: {activeCourseDoc.puntajes.elemental}</span>
                  <span className="badge badge-ok">Adecuado: {activeCourseDoc.puntajes.adecuado}</span>
                </div>
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" onClick={handleCopyFullAnnualPlan}>
                  <Copy size={14} /> Copiar Plan Anual
                </button>
                <button type="button" className="btn" onClick={() => window.print()}>
                  <Printer size={14} /> Imprimir / PDF
                </button>
                <a
                  href={`https://drive.google.com/file/d/${activeCourseDoc.driveId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  <FileText size={14} /> PDF Oficial <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Tarjetas resumen por Eje / Habilidad SIMCE (clic para filtrar el año por eje) */}
            <div className="annual-eje-grid no-print" style={{ marginTop: 14 }}>
              <button
                type="button"
                className={`annual-eje-card ${annualEjeFilter === "" ? "active" : ""}`}
                onClick={() => setAnnualEjeFilter("")}
              >
                <div className="annual-eje-name">Año completo (Todos los ejes)</div>
                <div className="annual-eje-meta tabular">
                  {annualStandardData.activeStandards.length} estándares · {annualStandardData.totalUniqueOas} OA únicos
                </div>
              </button>
              {annualStandardData.ejesSummary.map((es, idx) => (
                <button
                  key={es.eje}
                  type="button"
                  className={`annual-eje-card ${annualEjeFilter === es.eje ? "active" : ""}`}
                  onClick={() => setAnnualEjeFilter(annualEjeFilter === es.eje ? "" : es.eje)}
                >
                  <div className="annual-eje-name">
                    {idx + 1}. {es.eje}
                  </div>
                  <div className="annual-eje-meta tabular">
                    {es.stdCount} estándar{es.stdCount > 1 ? "es" : ""} · {es.uniqueOaCount} OA involucrados
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Barra de filtro rápido por nivel mínimo y buscador */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="filter-pills">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)", marginRight: 2 }}>
                Nivel mínimo del estándar:
              </span>
              {[
                { key: "", label: `Todos (${annualStandardData.activeStandards.length})` },
                { key: "Elemental", label: "Desde Elemental" },
                { key: "Adecuado", label: "Desde Adecuado" },
                { key: "Expectativa", label: "Expectativa Curricular (Sobre Adecuado)" },
              ].map((opt) => (
                <button
                  key={opt.key || "all"}
                  type="button"
                  className={`filter-pill ${annualNivelFilter === opt.key ? "active" : ""}`}
                  onClick={() => setAnnualNivelFilter(annualNivelFilter === opt.key ? "" : opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="search-wrap" style={{ minWidth: 240, maxWidth: 340 }}>
              <Search size={14} />
              <input
                type="search"
                className="input"
                placeholder="Buscar estándar, tema o código OA..."
                value={annualQuery}
                onChange={(e) => setAnnualQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Secciones Anuales agrupadas por Eje / Habilidad SIMCE */}
          {annualGroupedByEje.length === 0 ? (
            <div className="panel panel-pad" style={{ textAlign: "center", padding: 36, color: "var(--ink-500)" }}>
              No hay estándares que coincidan con el filtro actual.{" "}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setAnnualEjeFilter("");
                  setAnnualNivelFilter("");
                  setAnnualQuery("");
                }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {annualGroupedByEje.map((group, gIdx) => (
                <div key={group.eje} className="annual-eje-section">
                  <div className="annual-eje-section-head">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span className="annual-eje-num tabular">{gIdx + 1}</span>
                      <h2 style={{ margin: 0, fontSize: 16.5, color: "var(--navy-950)" }}>
                        {group.eje}
                      </h2>
                      <span className="badge badge-navy tabular">
                        {group.items.length} estándar{group.items.length > 1 ? "es" : ""}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {group.items.map(({ indicator, oas, coveredOas }) => (
                      <article key={indicator.code} className="panel panel-pad annual-std-card">
                        {/* Encabezado único del estándar */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span className="mono badge badge-navy" style={{ fontSize: 12 }}>
                                {indicator.code}
                              </span>
                              <strong style={{ fontSize: 15, color: "var(--navy-950)" }}>
                                {indicator.tema}
                              </strong>
                              {indicator.nivelMinimo.includes("Expectativa") ? (
                                <span className="badge badge-adv">Expectativa Curricular (Sobre Adecuado)</span>
                              ) : indicator.nivelMinimo === "Adecuado" ? (
                                <span className="badge badge-ok">Exigido desde Nivel Adecuado</span>
                              ) : (
                                <span className="badge badge-warn">Progresión Elemental → Adecuado</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
                              Involucra <strong style={{ color: "var(--navy-900)" }}>{oas.length} OA del curso</strong> ({coveredOas}/{oas.length} con material disponible en el banco)
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-sm btn-primary no-print"
                            onClick={() =>
                              onCopyText(
                                buildStandardAnnualBlueprint({
                                  curso: selCurso,
                                  asignatura: selAsig,
                                  docTitle: activeCourseDoc.titulo,
                                  vinculo: activeCourseLink.vinculo,
                                  indicator,
                                  oas,
                                }),
                                `Ficha anual ${indicator.code} + ${oas.length} OA copiada`,
                              )
                            }
                          >
                            <Copy size={12} /> Copiar Estándar + {oas.length} OA
                          </button>
                        </div>

                        {/* Progresión completa del estándar en 3 niveles */}
                        <div className="std-tier-grid">
                          <div className="std-tier-card std-tier-elem">
                            <div className="std-tier-label">Nivel Elemental · Inicio / Nivelación</div>
                            <div className="std-tier-body">
                              {indicator.elemental || "No exigido como requisito mínimo en Elemental. Activar aprendizajes previos con andamiaje guiado."}
                            </div>
                          </div>
                          <div className="std-tier-card std-tier-adec">
                            <div className="std-tier-label">Nivel Adecuado · Meta de Guía / Prueba</div>
                            <div className="std-tier-body">
                              {indicator.adecuado || "Evaluado sobre el puntaje de corte de Nivel Adecuado (ver Expectativa Curricular)."}
                            </div>
                          </div>
                          <div className="std-tier-card std-tier-adv">
                            <div className="std-tier-label">Sobre Adecuado · Desafío / Profundización</div>
                            <div className="std-tier-body">
                              {indicator.avanzado || "Transferir el indicador a contextos nuevos, textos menos familiares o problemas de mayor autonomía."}
                            </div>
                          </div>
                        </div>

                        {/* Bloque unificado de OA del curso involucrados en ESTE estándar */}
                        <div className="annual-oa-container">
                          <div className="annual-oa-container-title">
                            Objetivos de Aprendizaje (OA) de {selCurso} que involucra este estándar ({oas.length})
                          </div>
                          <div className="annual-oa-list">
                            {oas.map((oaItem) => (
                              <div key={oaItem.oa} className="annual-oa-row">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <strong className="mono" style={{ fontSize: 13, color: "var(--navy-900)" }}>
                                      {oaItem.oa}
                                    </strong>
                                    <span className="badge badge-neutral">{oaItem.eje}</span>
                                    <span
                                      className={`badge ${oaItem.covered ? "badge-ok" : "badge-warn"} tabular`}
                                    >
                                      {oaItem.covered
                                        ? `${oaItem.matCount} recurso${oaItem.matCount > 1 ? "s" : ""}`
                                        : "Sin material"}
                                    </span>
                                    <span
                                      className="badge badge-neutral"
                                      style={{ opacity: 0.8 }}
                                      title="Referencia informativa de las unidades del Programa MINEDUC donde aparece este OA"
                                    >
                                      Ref. MINEDUC: {oaItem.units.map(shortUnitLabel).join(", ")}
                                    </span>
                                  </div>
                                  <div className="no-print" style={{ display: "flex", gap: 5 }}>
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      onClick={() =>
                                        onCopyText(
                                          `${oaItem.oa} (${selCurso} · ${selAsig}): ${oaItem.desc}`,
                                          `${oaItem.oa} copiado`,
                                        )
                                      }
                                    >
                                      <Copy size={11} /> OA
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      onClick={() =>
                                        onOpenUnitInPlanner(
                                          selCiclo,
                                          selCurso,
                                          selAsig,
                                          oaItem.units[0] || "Todas",
                                        )
                                      }
                                      title="Abrir recursos de este OA en el Planificador"
                                    >
                                      <BookOpen size={11} /> Recursos
                                    </button>
                                  </div>
                                </div>

                                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-900)", lineHeight: 1.48 }}>
                                  {oaItem.desc}
                                </p>
                                {oaItem.sugerencia && (
                                  <div style={{ marginTop: 5, fontSize: 12, color: "var(--navy-800)", display: "flex", alignItems: "flex-start", gap: 5 }}>
                                    <Sparkles size={12} style={{ flexShrink: 0, marginTop: 3 }} />
                                    <span>
                                      <strong>Foco para guías:</strong> {oaItem.sugerencia}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Estándares del mismo PDF trabajados en otros cursos del tramo/ciclo */}
          {annualStandardData.otherCourseStandards.length > 0 && (
            <div className="panel panel-pad no-print" style={{ marginTop: 18, background: "var(--surface-warm)" }}>
              <strong style={{ fontSize: 13, color: "var(--ink-700)" }}>
                Otros estándares de «{activeCourseDoc.fileName}» trabajados en otros cursos del tramo ({annualStandardData.otherCourseStandards.length})
              </strong>
              <p style={{ margin: "4px 0 10px", fontSize: 12, color: "var(--ink-500)" }}>
                Como este documento evalúa {activeCourseDoc.cobertura.toLowerCase()}, los siguientes estándares corresponden principalmente a otros cursos del mismo ciclo (haz clic en un curso para verlo):
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {annualStandardData.otherCourseStandards.map(({ indicator, otherCourses }) => (
                  <div
                    key={indicator.code}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "#ffffff",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span className="mono badge badge-neutral">{indicator.code}</span>
                      <strong>{indicator.tema}</strong>
                      <span style={{ color: "var(--ink-500)" }}>({indicator.eje})</span>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {otherCourses.map((oc) => (
                        <button
                          key={`${oc.curso}-${oc.asig}`}
                          type="button"
                          className="badge badge-navy"
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setSelCiclo(oc.ciclo);
                            setSelCurso(oc.curso);
                            setSelAsig(oc.asig);
                            setAnnualEjeFilter("");
                          }}
                        >
                          Se trabaja en {oc.curso} →
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OA de Escritura / Comunicación Oral no evaluados en SIMCE Lectura */}
          {annualStandardData.nonSimceUniqueOas.length > 0 && (
            <div className="panel panel-pad no-print" style={{ marginTop: 14, background: "var(--surface-warm)" }}>
              <strong style={{ fontSize: 13, color: "var(--ink-700)" }}>
                OA anuales de Escritura / Comunicación Oral en {selCurso} ({annualStandardData.nonSimceUniqueOas.length} OA complementarios a SIMCE Lectura)
              </strong>
              <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--ink-500)" }}>
                Estos OA no están evaluados directamente en los Estándares de Lectura, pero se desarrollan durante el año en paralelo:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {annualStandardData.nonSimceUniqueOas.map((o) => (
                  <span key={o.oa} className="badge badge-neutral" title={o.desc}>
                    <span className="mono">{o.oa}</span> · {o.eje}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* =================================================================== */}
      {/* MODO 2: POR CURSO Y UNIDAD (VISTA ORIGINAL POR UNIDADES)            */}
      {/* =================================================================== */}
      {mode === "byUnit" && (
        <>
          {activeCourseLink && (
            <div className="unit-bar no-print">
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
                <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  <div className="no-print" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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

                <div className="std-tip-box">
                  <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--navy-800)" }} />
                  <div>
                    <strong>Orientación para preparar guías y evaluaciones: </strong>
                    {link!.sugerencia}
                  </div>
                </div>

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
      )}

      {/* =================================================================== */}
      {/* MODO 3: POR DOCUMENTO DE ESTÁNDARES (10 PDFs)                       */}
      {/* =================================================================== */}
      {mode === "byDoc" && (
        <>
          <div className="selector-panel no-print">
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
                    className="btn btn-primary no-print"
                  >
                    <FileText size={14} /> Abrir {inspectedDoc.fileName} en Drive <ExternalLink size={12} />
                  </a>
                </div>

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

              <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
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

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredDocIndicators.map((ind) => {
                  const usages = indicatorUsage.get(ind.code) || [];
                  // Deduplicar por Curso + OA para que también sea limpio y legible
                  const uniqueByCourseOa = new Map<
                    string,
                    { ciclo: string; curso: string; asig: string; oa: string; vinculo: string; units: string[] }
                  >();
                  for (const u of usages) {
                    const k = `${u.curso}|${u.asig}|${u.oa}`;
                    const cur = uniqueByCourseOa.get(k);
                    if (!cur) {
                      uniqueByCourseOa.set(k, {
                        ciclo: u.ciclo,
                        curso: u.curso,
                        asig: u.asig,
                        oa: u.oa,
                        vinculo: u.vinculo,
                        units: [u.unidad],
                      });
                    } else if (!cur.units.includes(u.unidad)) {
                      cur.units.push(u.unidad);
                    }
                  }
                  const dedupUsages = Array.from(uniqueByCourseOa.values());
                  return (
                    <article key={ind.code} className="panel panel-pad">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <span className="mono badge badge-navy">{ind.code}</span>
                        <strong style={{ fontSize: 14, color: "var(--navy-950)" }}>{ind.tema}</strong>
                        <span className="badge badge-neutral">{ind.eje}</span>
                        <span className="badge badge-ok tabular">{dedupUsages.length} OA involucrados en el tramo</span>
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

                      {dedupUsages.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-500)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                            OA involucrados en los cursos del tramo (clic para abrir el Plan Anual del curso):
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {dedupUsages.map((u) => (
                              <button
                                key={`${u.curso}-${u.asig}-${u.oa}`}
                                type="button"
                                className={vinculoBadgeClass(u.vinculo)}
                                style={{ cursor: "pointer" }}
                                onClick={() => {
                                  setSelCiclo(u.ciclo);
                                  setSelCurso(u.curso);
                                  setSelAsig(u.asig);
                                  setAnnualEjeFilter(ind.eje);
                                  setMode("annualByStd");
                                }}
                              >
                                {u.curso} · <span className="mono">{u.oa}</span>
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
