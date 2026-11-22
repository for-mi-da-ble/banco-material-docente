import React, { useMemo } from "react";
import { Copy, Download, ExternalLink, Eye, Printer, Trash2 } from "lucide-react";
import type { BancoDataset, LessonMoment, LessonPlanState, MaterialItem } from "../types";

interface LessonBasketProps {
  dataset: BancoDataset;
  plan: LessonPlanState;
  onUpdatePlan: (next: LessonPlanState) => void;
  onPreview: (m: MaterialItem) => void;
  onRemoveItem: (materialId: string) => void;
  onClearAll: () => void;
  onCopyText: (text: string, label: string) => void;
}

const MOMENTS: Array<{ id: LessonMoment; title: string; subtitle: string }> = [
  { id: "inicio", title: "1. Inicio / Activación", subtitle: "Diagnósticos, presentaciones o lecturas motivadoras" },
  { id: "desarrollo", title: "2. Desarrollo / Práctica", subtitle: "Guías, talleres, actividades y ejercitación" },
  { id: "evaluacion", title: "3. Evaluación / Cierre", subtitle: "Pruebas, controles, rúbricas y pautas" },
];

export default function LessonBasket({
  dataset,
  plan,
  onUpdatePlan,
  onPreview,
  onRemoveItem,
  onClearAll,
  onCopyText,
}: LessonBasketProps) {
  const matById = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    for (const m of dataset.materials) map.set(m.id, m);
    return map;
  }, [dataset.materials]);

  const resolvedItems = useMemo(
    () =>
      plan.items
        .map((it) => ({ ...it, material: matById.get(it.materialId) }))
        .filter((x): x is { materialId: string; moment: LessonMoment; note: string; material: MaterialItem } =>
          Boolean(x.material),
        ),
    [plan.items, matById],
  );

  // Recopilar automáticamente los OA oficiales MINEDUC de los materiales elegidos
  const consolidatedOas = useMemo(() => {
    const seen = new Map<string, { curso: string; asig: string; oa: string; desc: string }>();
    for (const { material } of resolvedItems) {
      const lookupU = material.curso === "Electivos" ? "General" : material.unidad;
      const cat = dataset.oaCatalog[`${material.curso}|${material.asignatura}|${lookupU}`] || [];
      for (const oaCode of material.oas) {
        const key = `${material.curso}|${material.asignatura}|${oaCode}`;
        if (!seen.has(key)) {
          const found = cat.find((o) => o.oa === oaCode);
          seen.set(key, {
            curso: material.curso,
            asig: material.asignatura,
            oa: oaCode,
            desc: found?.desc || "Objetivo oficial del Programa de Estudio MINEDUC.",
          });
        }
      }
    }
    return Array.from(seen.values());
  }, [resolvedItems, dataset.oaCatalog]);

  const buildShareText = () => {
    const lines: string[] = [
      `PLANIFICACIÓN DE CLASE — COLEGIO MARINA DE CHILE`,
      `Título: ${plan.title || "Secuencia didáctica"}`,
      plan.courseLabel ? `Curso / Asignatura: ${plan.courseLabel}` : "",
      plan.teacher ? `Docente: ${plan.teacher}` : "",
      plan.dateRange ? `Fecha / Semanas: ${plan.dateRange}` : "",
      "",
      "OBJETIVOS DE APRENDIZAJE MINEDUC:",
      ...(consolidatedOas.length > 0
        ? consolidatedOas.map((o) => `- [${o.curso} · ${o.asig}] ${o.oa}: ${o.desc}`)
        : ["- (Sin OA explícito en los recursos seleccionados)"]),
      "",
      "RECURSOS SELECCIONADOS:",
    ];
    for (const mom of MOMENTS) {
      const group = resolvedItems.filter((x) => x.moment === mom.id);
      if (group.length === 0) continue;
      lines.push(`\n${mom.title}:`);
      for (const g of group) {
        lines.push(`• ${g.material.name} (${g.material.tipo} · ${g.material.unidad})`);
        lines.push(`  Drive: ${g.material.driveUrl}`);
        if (g.note) lines.push(`  Nota docente: ${g.note}`);
      }
    }
    if (plan.methodNotes) {
      lines.push("\nNOTAS METODOLÓGICAS / ADECUACIONES:", plan.methodNotes);
    }
    return lines.filter((l) => l !== undefined).join("\n");
  };

  const downloadMarkdown = () => {
    const content = buildShareText();
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "planificacion_clase_marina_de_chile.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const setItemMoment = (materialId: string, moment: LessonMoment) => {
    onUpdatePlan({
      ...plan,
      items: plan.items.map((it) => (it.materialId === materialId ? { ...it, moment } : it)),
    });
  };

  const setItemNote = (materialId: string, note: string) => {
    onUpdatePlan({
      ...plan,
      items: plan.items.map((it) => (it.materialId === materialId ? { ...it, note } : it)),
    });
  };

  return (
    <section aria-label="Mi Planificación de Clase">
      <div className="section-head">
        <div>
          <h1>Mi Planificación de Clase</h1>
          <p>
            Organiza tus materiales elegidos por momento de la clase, reúne automáticamente sus OA MINEDUC oficiales e imprime o comparte tu secuencia.
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={resolvedItems.length === 0}
            onClick={() => onCopyText(buildShareText(), "Planificación copiada para Classroom / correo")}
          >
            <Copy size={14} /> Copiar para Classroom
          </button>
          <button
            type="button"
            className="btn"
            disabled={resolvedItems.length === 0}
            onClick={downloadMarkdown}
          >
            <Download size={14} /> Descargar Ficha
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={resolvedItems.length === 0}
            onClick={() => window.print()}
          >
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
          {resolvedItems.length > 0 && (
            <button type="button" className="btn" onClick={onClearAll}>
              <Trash2 size={14} /> Vaciar
            </button>
          )}
        </div>
      </div>

      {/* Datos de cabecera editables de la planificación */}
      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <div>
            <div className="step-label">Título de la clase o secuencia</div>
            <input
              className="input"
              placeholder="Ej. Secuencia Unidad 2 — Funciones y Gráficos"
              value={plan.title}
              onChange={(e) => onUpdatePlan({ ...plan, title: e.target.value })}
            />
          </div>
          <div>
            <div className="step-label">Curso y Asignatura</div>
            <input
              className="input"
              placeholder="Ej. 2° Medio A-B · Matemática"
              value={plan.courseLabel}
              onChange={(e) => onUpdatePlan({ ...plan, courseLabel: e.target.value })}
            />
          </div>
          <div>
            <div className="step-label">Docente</div>
            <input
              className="input"
              placeholder="Tu nombre"
              value={plan.teacher}
              onChange={(e) => onUpdatePlan({ ...plan, teacher: e.target.value })}
            />
          </div>
          <div>
            <div className="step-label">Fechas / Semanas</div>
            <input
              className="input"
              placeholder="Ej. Semanas 1 y 2 de Mayo"
              value={plan.dateRange}
              onChange={(e) => onUpdatePlan({ ...plan, dateRange: e.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="step-label">Notas metodológicas, estrategias DUA o recordatorios</div>
          <textarea
            rows={2}
            className="textarea"
            placeholder="Anota aquí orientaciones de inicio, trabajo colaborativo, tiempos o materiales complementarios..."
            value={plan.methodNotes}
            onChange={(e) => onUpdatePlan({ ...plan, methodNotes: e.target.value })}
          />
        </div>
      </div>

      {resolvedItems.length === 0 ? (
        <div className="panel panel-pad" style={{ textAlign: "center", padding: 48, color: "var(--ink-500)" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--navy-950)" }}>
            Tu bandeja de planificación está vacía
          </h2>
          <p style={{ margin: 0, fontSize: 13 }}>
            Mientras exploras el <strong>Planificador</strong> o el <strong>Buscador Rápido</strong>, haz clic en{" "}
            <strong>"Planificar"</strong> en cualquier guía, presentación, lectura o prueba para armar tu clase aquí (se guarda automáticamente en tu navegador).
          </p>
        </div>
      ) : (
        <>
          {/* OA Consolidados automáticamente */}
          {consolidatedOas.length > 0 && (
            <div className="oa-panel" style={{ marginBottom: 16 }}>
              <div className="step-label" style={{ marginBottom: 8 }}>
                Objetivos de Aprendizaje MINEDUC cubiertos en esta planificación ({consolidatedOas.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {consolidatedOas.map((o) => (
                  <div
                    key={`${o.curso}-${o.asig}-${o.oa}`}
                    style={{
                      padding: "8px 11px",
                      borderRadius: 8,
                      background: "var(--ok-bg)",
                      border: "1px solid var(--ok-bd)",
                      fontSize: 12.5,
                    }}
                  >
                    <strong className="mono" style={{ color: "var(--ok-fg)" }}>
                      {o.oa}
                    </strong>{" "}
                    <span style={{ color: "var(--ink-500)", fontSize: 11.5 }}>
                      ({o.curso} · {o.asig})
                    </span>
                    <div style={{ marginTop: 2 }}>{o.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 Columnas: Inicio / Desarrollo / Evaluación */}
          <div className="moments-grid">
            {MOMENTS.map((mom) => {
              const items = resolvedItems.filter((x) => x.moment === mom.id);
              return (
                <div key={mom.id} className="moment-col">
                  <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "var(--navy-950)" }}>
                      {mom.title} ({items.length})
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{mom.subtitle}</div>
                  </div>

                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--ink-500)", padding: "14px 4px" }}>
                      Sin recursos asignados a este momento.
                    </div>
                  ) : (
                    items.map(({ material, note }) => (
                      <div
                        key={material.id}
                        style={{
                          padding: 11,
                          borderRadius: 9,
                          border: "1px solid var(--border)",
                          background: "var(--surface-warm)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 7,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span className="badge badge-navy">{material.tipo}</span>
                          <span className="badge badge-neutral">{material.unidad}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{material.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          {material.curso} · {material.asignatura}
                        </div>

                        <input
                          className="input no-print"
                          style={{ padding: "5px 8px", fontSize: 12 }}
                          placeholder="Nota para este recurso (ej. 20 min en parejas)..."
                          value={note}
                          onChange={(e) => setItemNote(material.id, e.target.value)}
                        />
                        {note && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-700)", fontStyle: "italic" }}>
                            Nota: {note}
                          </div>
                        )}

                        <div className="no-print" style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="select"
                            style={{ width: "auto", padding: "4px 7px", fontSize: 11.5 }}
                            value={mom.id}
                            onChange={(e) => setItemMoment(material.id, e.target.value as LessonMoment)}
                            aria-label="Cambiar momento de clase"
                          >
                            <option value="inicio">Inicio</option>
                            <option value="desarrollo">Desarrollo</option>
                            <option value="evaluacion">Evaluación</option>
                          </select>
                          <button type="button" className="btn btn-sm" onClick={() => onPreview(material)}>
                            <Eye size={12} /> Ver
                          </button>
                          <a href={material.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                            <ExternalLink size={12} />
                          </a>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ marginLeft: "auto" }}
                            onClick={() => onRemoveItem(material.id)}
                            title="Quitar de la planificación"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
