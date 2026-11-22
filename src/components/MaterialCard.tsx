import React from "react";
import { ArrowRightLeft, BookmarkCheck, BookmarkPlus, ExternalLink, Eye, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import type { FileKind, MaterialItem } from "../types";

interface MaterialCardProps {
  material: MaterialItem;
  isPlanned: boolean;
  isRelocated?: boolean;
  onPreview: (m: MaterialItem) => void;
  onTogglePlan: (m: MaterialItem) => void;
  onRelocate: (m: MaterialItem) => void;
  onClickOa?: (oa: string) => void;
  showCourseBadge?: boolean;
}

const KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  doc: "Word",
  ppt: "PPT",
  xls: "Excel",
  file: "Archivo",
};

function KindIcon({ kind }: { kind: FileKind }) {
  if (kind === "ppt") return <Presentation size={12} />;
  if (kind === "xls") return <FileSpreadsheet size={12} />;
  return <FileText size={12} />;
}

export default function MaterialCard({
  material,
  isPlanned,
  isRelocated = false,
  onPreview,
  onTogglePlan,
  onRelocate,
  onClickOa,
  showCourseBadge = false,
}: MaterialCardProps) {
  return (
    <article className={`mat-card ${isPlanned ? "planned" : ""}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="mat-card-top">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className={`file-badge ${material.kind}`}>
              <KindIcon kind={material.kind} /> {KIND_LABELS[material.kind]}
            </span>
            <span className="badge badge-navy">{material.tipo}</span>
            {isRelocated && (
              <span className="badge badge-warn" title="Reubicado visualmente (pendiente sincronizar en Drive)">
                Reubicado
              </span>
            )}
          </div>
          <span className="mono tabular" style={{ fontSize: 11.5, color: "var(--ink-500)", fontWeight: 600 }}>
            {material.anio}
          </span>
        </div>

        <div>
          <div className="mat-title">{material.name}</div>
          {showCourseBadge && (
            <div className="mat-sub">
              {material.curso} · {material.asignatura} · {material.unidad}
            </div>
          )}
        </div>

        {material.extracto && (
          <div className="mat-excerpt" title={material.extracto}>
            {material.extracto}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {material.oas.length > 0 ? (
            material.oas.map((oa) => (
              <button
                key={oa}
                type="button"
                className="badge badge-ok mono"
                style={{ cursor: onClickOa ? "pointer" : "default" }}
                onClick={() => onClickOa?.(oa)}
                title={`Filtrar por ${oa}`}
              >
                {oa}
              </button>
            ))
          ) : (
            <span className="badge badge-neutral">Sin OA etiquetado</span>
          )}
          {!showCourseBadge && (
            <span className="badge badge-neutral">{material.unidad}</span>
          )}
        </div>
      </div>

      <div className="mat-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => onPreview(material)}
          title="Ver vista previa del documento aquí mismo"
        >
          <Eye size={13} /> Vista previa
        </button>

        <a
          href={material.driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm"
          title={
            material.kind === "doc"
              ? "Abrir documento completo en Google Docs (todas las páginas)"
              : "Abrir archivo completo en Google Drive"
          }
        >
          <ExternalLink size={12} />{" "}
          {material.kind === "doc" ? "Docs" : material.kind === "ppt" ? "Slides" : material.kind === "xls" ? "Sheets" : "Drive"}
        </a>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onRelocate(material)}
          title="Marcar que no corresponde aquí o reubicar en otro curso/asignatura/unidad"
        >
          <ArrowRightLeft size={12} /> Reubicar
        </button>

        <button
          type="button"
          className={`btn btn-sm ${isPlanned ? "btn-ok" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => onTogglePlan(material)}
          title={isPlanned ? "Quitar de Mi Planificación" : "Agregar a Mi Planificación de Clase"}
        >
          {isPlanned ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
          {isPlanned ? "En mi clase" : "Planificar"}
        </button>
      </div>
    </article>
  );
}
