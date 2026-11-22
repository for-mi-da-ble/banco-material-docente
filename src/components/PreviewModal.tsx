import React from "react";
import { BookmarkCheck, BookmarkPlus, Copy, ExternalLink, FolderOpen, X } from "lucide-react";
import type { MaterialItem, OaEntry } from "../types";

interface PreviewModalProps {
  material: MaterialItem | null;
  oaCatalog: Record<string, OaEntry[]>;
  isPlanned: boolean;
  onClose: () => void;
  onTogglePlan: (m: MaterialItem) => void;
  onCopyText: (text: string, label: string) => void;
}

export default function PreviewModal({
  material,
  oaCatalog,
  isPlanned,
  onClose,
  onTogglePlan,
  onCopyText,
}: PreviewModalProps) {
  if (!material) return null;

  const lookupUnit = material.curso === "Electivos" ? "General" : material.unidad;
  const unitOas = oaCatalog[`${material.curso}|${material.asignatura}|${lookupUnit}`] || [];
  const linkedDetails = material.oas.map((code) => ({
    code,
    entry: unitOas.find((o) => o.oa === code),
  }));

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Vista previa del material">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
              <span className="badge badge-navy mono">{material.id}</span>
              <span className="badge badge-neutral">{material.curso}</span>
              <span className="badge badge-neutral">{material.asignatura}</span>
              <span className="badge badge-neutral">{material.unidad}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
              {material.name}
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className={`btn btn-sm ${isPlanned ? "btn-ok" : "btn-primary"}`}
              onClick={() => onTogglePlan(material)}
            >
              {isPlanned ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
              {isPlanned ? "En mi planificación" : "Agregar a mi clase"}
            </button>
            <a href={material.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              <ExternalLink size={13} /> Abrir en Drive
            </a>
            <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Cerrar vista previa">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="modal-body-split">
          <div className="modal-iframe-col">
            <iframe
              src={material.previewUrl}
              title={`Vista previa de ${material.name}`}
              allow="autoplay"
            />
            <div
              style={{
                padding: "7px 12px",
                fontSize: 11.5,
                background: "#f1f5f9",
                color: "var(--ink-700)",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>
                Si tu cuenta institucional no tiene sesión activa en este navegador, usa <strong>Abrir en Drive</strong>.
              </span>
              {material.folderId && (
                <a
                  href={`https://drive.google.com/drive/folders/${material.folderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                >
                  <FolderOpen size={12} /> Ir a la carpeta
                </a>
              )}
            </div>
          </div>

          <div className="modal-meta-col">
            <div>
              <div className="step-label">Encabezado interno validado</div>
              <div className="mat-excerpt" style={{ WebkitLineClamp: "unset", fontSize: 12.5 }}>
                {material.extracto || "Documento visual o escaneado sin extracto de texto."}
              </div>
            </div>

            <div>
              <div className="step-label">Objetivos de Aprendizaje MINEDUC vinculados</div>
              {linkedDetails.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-500)" }}>
                  Este archivo no trae un código de OA explícito en su encabezado. Puedes revisar los OA de {material.unidad} en el panel del Planificador.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {linkedDetails.map(({ code, entry }) => (
                    <div
                      key={code}
                      style={{
                        padding: "9px 11px",
                        borderRadius: 8,
                        background: "var(--ok-bg)",
                        border: "1px solid var(--ok-bd)",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <strong className="mono" style={{ color: "var(--ok-fg)" }}>
                          {code} {entry?.eje ? `· ${entry.eje}` : ""}
                        </strong>
                        {entry?.desc && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ padding: "2px 7px", fontSize: 11 }}
                            onClick={() => onCopyText(`${code}: ${entry.desc}`, `${code} copiado`)}
                          >
                            <Copy size={11} /> Copiar
                          </button>
                        )}
                      </div>
                      <div style={{ color: "var(--ink-900)" }}>
                        {entry?.desc || "Objetivo oficial del Programa de Estudio MINEDUC."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onCopyText(
                    `${material.name} (${material.curso} · ${material.asignatura} · ${material.unidad})\n${material.driveUrl}`,
                    "Enlace copiado para compartir",
                  )
                }
              >
                <Copy size={13} /> Copiar enlace para Classroom / colegas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
