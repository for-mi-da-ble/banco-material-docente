import React, { useMemo, useState } from "react";
import { ArrowRight, Copy, ExternalLink, FolderOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import { CICLO_ORDER, scanPiiText, sortCursos, type BancoDataset } from "../types";

interface CoveragePrepViewProps {
  dataset: BancoDataset;
  onOpenUnitInPlanner: (ciclo: string, curso: string, asig: string, unidad: string) => void;
  onCopyText: (text: string, label: string) => void;
}

export default function CoveragePrepView({
  dataset,
  onOpenUnitInPlanner,
  onCopyText,
}: CoveragePrepViewProps) {
  const [ciclo, setCiclo] = useState("");
  const [curso, setCurso] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(true);

  // Estado del Asistente de Preparación / Privacidad PII
  const [prepFile, setPrepFile] = useState("2026-09-10_Guia_Unidad2_OA3.docx");
  const [prepHeader, setPrepHeader] = useState("");

  const piiStatus = useMemo(() => scanPiiText(prepFile, prepHeader), [prepFile, prepHeader]);

  const cursosAvail = useMemo(
    () => sortCursos(Array.from(new Set(dataset.coverage.filter((r) => !ciclo || r.ciclo === ciclo).map((r) => r.curso)))),
    [dataset.coverage, ciclo],
  );

  const filteredCov = useMemo(
    () =>
      dataset.coverage.filter((r) => {
        if (ciclo && r.ciclo !== ciclo) return false;
        if (curso && r.curso !== curso) return false;
        if (onlyGaps && r.cov >= r.tot) return false;
        return true;
      }),
    [dataset.coverage, ciclo, curso, onlyGaps],
  );

  const cycleSummary = useMemo(() => {
    return CICLO_ORDER.map((c) => {
      const rows = dataset.coverage.filter((r) => r.ciclo === c);
      const tot = rows.reduce((a, r) => a + r.tot, 0);
      const cov = rows.reduce((a, r) => a + r.cov, 0);
      const mats = rows.reduce((a, r) => a + r.mats, 0);
      return {
        ciclo: c,
        tot,
        cov,
        mats,
        pct: tot > 0 ? Math.round((cov / tot) * 1000) / 10 : 0,
      };
    });
  }, [dataset.coverage]);

  return (
    <section aria-label="Cobertura OA y preparación de nuevo material">
      <div className="section-head">
        <div>
          <h1>Cobertura Curricular OA y Preparación de Material</h1>
          <p>
            Identifica rápidamente qué Objetivos de Aprendizaje aún no tienen guías o pruebas, y verifica tu archivo nuevo con la barrera de privacidad antes de subirlo a Drive.
          </p>
        </div>
        <a href={dataset.meta.sheet_bd_url} target="_blank" rel="noopener noreferrer" className="btn">
          Abrir BD completa en Sheets <ExternalLink size={13} />
        </a>
      </div>

      {/* Tarjetas de avance por ciclo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 18 }}>
        {cycleSummary.map((c) => (
          <div
            key={c.ciclo}
            className="panel panel-pad"
            style={{
              cursor: "pointer",
              borderColor: ciclo === c.ciclo ? "var(--navy-800)" : undefined,
            }}
            onClick={() => {
              setCiclo(ciclo === c.ciclo ? "" : c.ciclo);
              setCurso("");
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{c.ciclo}</strong>
              <span className="mono tabular" style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-800)" }}>
                {c.pct}%
              </span>
            </div>
            <div className="progress-track" style={{ margin: "9px 0" }}>
              <div
                className="progress-fill"
                style={{ width: `${c.pct}%`, background: c.pct >= 40 ? "var(--ok-fg)" : "var(--navy-700)" }}
              />
            </div>
            <div className="tabular" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-500)" }}>
              <span>{c.cov} / {c.tot} OA cubiertos</span>
              <span>{c.mats.toLocaleString("es-CL")} recursos</span>
            </div>
          </div>
        ))}
      </div>

      {/* Asistente rápido de privacidad antes de subir a Drive */}
      <div className="panel panel-pad" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <strong style={{ fontSize: 14.5 }}>
            Verificador de Privacidad (PII/NEE) antes de subir un nuevo material a Drive
          </strong>
          <span className="badge badge-navy">Regla UTP Colegio Marina de Chile</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              className="input"
              placeholder="Nombre del archivo que vas a subir..."
              value={prepFile}
              onChange={(e) => setPrepFile(e.target.value)}
            />
            <textarea
              rows={2}
              className="textarea"
              placeholder="Opcional: pega el encabezado de tu documento para verificar que no incluya RUT ni datos NEE/PIE..."
              value={prepHeader}
              onChange={(e) => setPrepHeader(e.target.value)}
            />
          </div>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${piiStatus.blocked ? "var(--err-bd)" : "var(--ok-bd)"}`,
              background: piiStatus.blocked ? "var(--err-bg)" : "var(--ok-bg)",
              color: piiStatus.blocked ? "var(--err-fg)" : "var(--ok-fg)",
              fontSize: 12.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 4 }}>
              {piiStatus.blocked ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
              {piiStatus.blocked
                ? piiStatus.kind === "feedback"
                  ? "No corresponde al Banco Pedagógico (Ficha docente)"
                  : "Bloqueado por Privacidad PII / NEE"
                : "Aprobado — Sin datos sensibles detectados"}
            </div>
            <div>
              {piiStatus.blocked
                ? `Regla(s): ${piiStatus.reasons.join(", ")}. Retira nombres/RUT de estudiantes, informes PIE/PACI/PAEC o nóminas antes de compartir en el banco.`
                : "Incluye siempre en el encabezado del documento: Curso real, Asignatura oficial MINEDUC y código de OA (ej. OA 3)."}
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Brechas y Cobertura por Unidad */}
      <div className="panel">
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "var(--surface-warm)",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="select"
              style={{ width: 175 }}
              value={ciclo}
              onChange={(e) => {
                setCiclo(e.target.value);
                setCurso("");
              }}
            >
              <option value="">Todos los ciclos</option>
              {CICLO_ORDER.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="select"
              style={{ width: 165 }}
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
            >
              <option value="">Todos los cursos</option>
              {cursosAvail.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
              Solo unidades con OA faltantes
            </label>
          </div>
          <span className="tabular" style={{ fontSize: 12, color: "var(--ink-500)" }}>
            Mostrando {filteredCov.length} unidades
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Curso / Asignatura</th>
                <th>Unidad</th>
                <th style={{ minWidth: 140 }}>Avance OA</th>
                <th>OA cubiertos y brechas (clic para copiar OA)</th>
                <th style={{ textAlign: "right" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredCov.slice(0, 120).map((r) => {
                const lookupU = r.curso === "Electivos" ? "General" : r.unidad;
                const oaEntries = dataset.oaCatalog[`${r.curso}|${r.asig}|${lookupU}`] || [];
                const folder = dataset.folders.find(
                  (f) => f.curso === r.curso && f.asig === r.asig && (r.unidad === "General" ? !f.unidad : f.unidad === r.unidad),
                );
                return (
                  <tr key={`${r.ciclo}|${r.curso}|${r.asig}|${r.unidad}`}>
                    <td>
                      <strong>{r.curso}</strong>
                      <div style={{ fontSize: 12, color: "var(--ink-700)" }}>{r.asig}</div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {r.unidad === "General" ? "Plan Diferenciado" : r.unidad}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${r.pct}%`,
                              background: r.pct >= 70 ? "var(--ok-fg)" : r.pct > 0 ? "var(--navy-700)" : "var(--warn-fg)",
                            }}
                          />
                        </div>
                        <span className="mono tabular" style={{ fontSize: 11.5, fontWeight: 700, minWidth: 40 }}>
                          {r.pct}%
                        </span>
                      </div>
                      <div className="tabular" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
                        {r.cov}/{r.tot} OA · {r.mats} archivos
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {r.oas.map(([code, isCov, cnt]) => {
                          const entry = oaEntries.find((o) => o.oa === code);
                          return (
                            <button
                              key={code}
                              type="button"
                              className={`badge mono ${isCov ? "badge-ok" : "badge-warn"}`}
                              style={{ cursor: "pointer" }}
                              title={entry ? `${code}: ${entry.desc} (clic para copiar)` : code}
                              onClick={() =>
                                onCopyText(
                                  entry ? `${code} (${r.curso} ${r.asig}): ${entry.desc}` : code,
                                  `${code} copiado al portapapeles`,
                                )
                              }
                            >
                              {code}
                              {isCov ? ` (${cnt})` : ""}
                              <Copy size={9} style={{ opacity: 0.65 }} />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 5 }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            onOpenUnitInPlanner(
                              r.ciclo,
                              r.curso,
                              r.asig,
                              r.unidad === "General" ? "Todas" : r.unidad,
                            )
                          }
                        >
                          Explorar <ArrowRight size={12} />
                        </button>
                        {folder && (
                          <a
                            href={`https://drive.google.com/drive/folders/${folder.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                            title="Abrir carpeta en Drive para subir material"
                          >
                            <FolderOpen size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
