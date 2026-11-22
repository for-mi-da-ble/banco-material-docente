import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, FolderCheck, ShieldAlert, Trash2, X } from "lucide-react";
import {
  CICLO_ORDER,
  CURSOS_POR_CICLO,
  getAllowedSubjectsForCourse,
  getRootForCiclo,
  type BancoDataset,
  type MaterialItem,
  type RelocationAction,
  type RelocationRequest,
} from "../types";

interface RelocateModalProps {
  material: MaterialItem | null;
  dataset: BancoDataset;
  existingRequest?: RelocationRequest | null;
  defaultReporter?: string;
  onClose: () => void;
  onSave: (req: RelocationRequest) => void;
}

export default function RelocateModal({
  material,
  dataset,
  existingRequest,
  defaultReporter = "",
  onClose,
  onSave,
}: RelocateModalProps) {
  const [action, setAction] = useState<RelocationAction>("reubicar");
  const [ciclo, setCiclo] = useState("Enseñanza Media");
  const [curso, setCurso] = useState("1° Medio");
  const [asig, setAsig] = useState("Matemática");
  const [unidad, setUnidad] = useState("Unidad 1");
  const [selectedOas, setSelectedOas] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [reportedBy, setReportedBy] = useState(defaultReporter);

  useEffect(() => {
    if (!material) return;
    if (existingRequest) {
      setAction(existingRequest.action);
      if (existingRequest.to) {
        setCiclo(existingRequest.to.ciclo);
        setCurso(existingRequest.to.curso);
        setAsig(existingRequest.to.asignatura);
        setUnidad(existingRequest.to.unidad);
        setSelectedOas(existingRequest.to.oas || []);
      } else {
        setCiclo(material.ciclo);
        setCurso(material.curso);
        setAsig(material.asignatura);
        setUnidad(material.unidad === "Transversal" ? "Transversal" : material.unidad || "Unidad 1");
        setSelectedOas(material.oas || []);
      }
      setReason(existingRequest.reason || "");
      setReportedBy(existingRequest.reportedBy || defaultReporter);
    } else {
      setAction("reubicar");
      setCiclo(material.ciclo);
      setCurso(material.curso);
      setAsig(material.asignatura);
      setUnidad(material.unidad === "Transversal" ? "Transversal" : material.unidad || "Unidad 1");
      setSelectedOas(material.oas || []);
      setReason("");
      setReportedBy(defaultReporter);
    }
  }, [material, existingRequest, defaultReporter]);

  const cursosForCiclo = CURSOS_POR_CICLO[ciclo] || [];
  const subjectsForCurso = useMemo(() => getAllowedSubjectsForCourse(curso), [curso]);

  useEffect(() => {
    if (!cursosForCiclo.includes(curso)) {
      setCurso(cursosForCiclo[0] || "");
    }
  }, [ciclo, cursosForCiclo, curso]);

  useEffect(() => {
    if (!subjectsForCurso.includes(asig)) {
      setAsig(subjectsForCurso[0] || "");
    }
  }, [subjectsForCurso, asig]);

  useEffect(() => {
    if (curso === "Transversal") {
      setUnidad("Transversal");
    } else if (unidad === "Transversal") {
      setUnidad("Unidad 1");
    }
  }, [curso, unidad]);

  const availableOas = useMemo(() => {
    if (curso === "Transversal") return [];
    const lookupU = curso === "Electivos" ? "General" : unidad;
    return dataset.oaCatalog[`${curso}|${asig}|${lookupU}`] || [];
  }, [dataset.oaCatalog, curso, asig, unidad]);

  const resolvedFolder = useMemo(() => {
    if (curso === "Transversal") {
      return (
        dataset.folders.find(
          (f) => f.ciclo === ciclo && f.ruta.toLowerCase().includes("transversal"),
        ) || null
      );
    }
    return (
      dataset.folders.find(
        (f) => f.ciclo === ciclo && f.curso === curso && f.asig === asig && f.unidad === unidad,
      ) ||
      dataset.folders.find((f) => f.curso === curso && f.asig === asig && f.unidad === unidad) ||
      null
    );
  }, [dataset.folders, ciclo, curso, asig, unidad]);

  if (!material) return null;

  const { root, transversal } = getRootForCiclo(ciclo);
  const targetRuta =
    curso === "Transversal"
      ? `${root}/${transversal}`
      : `${root}/${curso}/${asig}/${unidad}`;

  const isSameLocation =
    action === "reubicar" &&
    ciclo === material.ciclo &&
    curso === material.curso &&
    asig === material.asignatura &&
    unidad === material.unidad;

  const toggleOa = (code: string) => {
    setSelectedOas((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const req: RelocationRequest = {
      id: existingRequest?.id || `REL-${Date.now().toString(36).toUpperCase()}`,
      materialId: material.id,
      driveId: material.driveId,
      name: material.name,
      action,
      from: existingRequest?.from || {
        ciclo: material.ciclo,
        curso: material.curso,
        asignatura: material.asignatura,
        unidad: material.unidad,
        folderId: material.folderId,
      },
      ...(action === "reubicar"
        ? {
            to: {
              ciclo,
              curso,
              asignatura: asig,
              unidad: curso === "Transversal" ? "Transversal" : unidad,
              targetFolderId: resolvedFolder?.id || "",
              targetRuta,
              oas: selectedOas,
            },
          }
        : {}),
      reason: reason.trim() || (action === "reubicar" ? "Reubicación curricular solicitada por docente/UTP" : action === "pii" ? "Contiene datos sensibles de estudiante (PII/NEE)" : "No corresponde al banco o está duplicado"),
      reportedBy: reportedBy.trim(),
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    onSave(req);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Reubicar o marcar material">
      <div
        className="modal-box"
        style={{ width: "min(680px, 95vw)", height: "auto", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <div className="step-label" style={{ marginBottom: 2 }}>
              <ArrowRightLeft size={12} /> Marcar o Reubicar Material
            </div>
            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
              {material.name}
            </h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Ubicación actual */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--surface-warm)",
              border: "1px solid var(--border)",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "var(--ink-500)", fontWeight: 600 }}>Ubicación actual: </span>
            <strong>
              {material.ciclo} → {material.curso} → {material.asignatura} → {material.unidad}
            </strong>
          </div>

          {/* Selector de acción */}
          <div>
            <div className="step-label">1. ¿Qué corresponde hacer con este archivo?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              <button
                type="button"
                className={`course-tile ${action === "reubicar" ? "active" : ""}`}
                onClick={() => setAction("reubicar")}
              >
                <span className="course-tile-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ArrowRightLeft size={14} /> Reubicar
                </span>
                <span className="course-tile-meta">Mover al curso, asignatura o unidad correcta</span>
              </button>

              <button
                type="button"
                className={`course-tile ${action === "eliminar" ? "active" : ""}`}
                onClick={() => setAction("eliminar")}
              >
                <span className="course-tile-name" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--warn-fg)" }}>
                  <Trash2 size={14} /> No corresponde
                </span>
                <span className="course-tile-meta">Duplicado, obsoleto o ficha docente</span>
              </button>

              <button
                type="button"
                className={`course-tile ${action === "pii" ? "active" : ""}`}
                onClick={() => setAction("pii")}
              >
                <span className="course-tile-name" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--err-fg)" }}>
                  <ShieldAlert size={14} /> Privacidad PII
                </span>
                <span className="course-tile-meta">Contiene nombre/RUT alumno o NEE/PIE</span>
              </button>
            </div>
          </div>

          {/* Destino si es Reubicar */}
          {action === "reubicar" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="step-label">2. Selecciona dónde corresponde ubicarlo (Reglas MINEDUC)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div>
                  <label className="step-label" htmlFor="rel-ciclo">Ciclo destino</label>
                  <select id="rel-ciclo" className="select" value={ciclo} onChange={(e) => setCiclo(e.target.value)}>
                    {CICLO_ORDER.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="step-label" htmlFor="rel-curso">Curso / Electivos</label>
                  <select id="rel-curso" className="select" value={curso} onChange={(e) => setCurso(e.target.value)}>
                    {cursosForCiclo.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="step-label" htmlFor="rel-asig">Asignatura destino</label>
                  <select id="rel-asig" className="select" value={asig} onChange={(e) => setAsig(e.target.value)}>
                    {subjectsForCurso.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="step-label" htmlFor="rel-unidad">Unidad destino</label>
                  <select
                    id="rel-unidad"
                    className="select"
                    value={unidad}
                    disabled={curso === "Transversal"}
                    onChange={(e) => setUnidad(e.target.value)}
                  >
                    {curso === "Transversal" ? (
                      <option value="Transversal">Transversal</option>
                    ) : (
                      <>
                        <option value="Unidad 1">Unidad 1</option>
                        <option value="Unidad 2">Unidad 2</option>
                        <option value="Unidad 3">Unidad 3</option>
                        <option value="Unidad 4">Unidad 4</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Ruta destino resuelta */}
              <div
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  background: "var(--ok-bg)",
                  border: "1px solid var(--ok-bd)",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <FolderCheck size={16} style={{ color: "var(--ok-fg)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: "var(--ok-fg)" }}>Nueva ruta en Google Drive:</div>
                  <div className="mono" style={{ wordBreak: "break-all" }}>{targetRuta}</div>
                  {!resolvedFolder && (
                    <div style={{ fontSize: 11, color: "var(--ink-700)", marginTop: 2 }}>
                      (La subcarpeta se creará automáticamente al sincronizar en Drive)
                    </div>
                  )}
                </div>
              </div>

              {/* OAs sugeridos del destino */}
              {availableOas.length > 0 && (
                <div>
                  <div className="step-label">Actualizar OA MINEDUC vinculados (opcional)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 110, overflowY: "auto" }}>
                    {availableOas.map((o) => {
                      const active = selectedOas.includes(o.oa);
                      return (
                        <button
                          key={o.oa}
                          type="button"
                          className={`badge mono ${active ? "badge-ok" : "badge-neutral"}`}
                          style={{ cursor: "pointer", padding: "4px 9px" }}
                          title={o.desc}
                          onClick={() => toggleOa(o.oa)}
                        >
                          {active ? "✓ " : "+ "}
                          {o.oa}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isSameLocation && (
                <div
                  style={{
                    padding: "8px 11px",
                    borderRadius: 7,
                    background: "var(--warn-bg)",
                    border: "1px solid var(--warn-bd)",
                    color: "var(--warn-fg)",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <AlertTriangle size={14} /> Selecciona un curso, asignatura o unidad diferente a la ubicación actual.
                </div>
              )}
            </div>
          )}

          {/* Motivo y docente */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
            <div>
              <label className="step-label" htmlFor="rel-reason">Motivo / observación</label>
              <input
                id="rel-reason"
                className="input"
                placeholder={
                  action === "reubicar"
                    ? "Ej. El encabezado corresponde a 3° Medio Unidad 2"
                    : "Ej. Archivo repetido o no corresponde al nivel"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <label className="step-label" htmlFor="rel-who">Reportado por (opcional)</label>
              <input
                id="rel-who"
                className="input"
                placeholder="Ej. Prof. Ana / UTP"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSameLocation}>
              {action === "reubicar"
                ? "Reubicar material"
                : action === "pii"
                ? "Marcar para cuarentena PII"
                : "Marcar que no corresponde"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
