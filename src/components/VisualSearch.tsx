import React, { useMemo, useState } from "react";
import { BookmarkCheck, BookmarkPlus, ExternalLink, Eye, LayoutGrid, List, RotateCcw, Search } from "lucide-react";
import { CICLO_ORDER, normText, sortCursos, type BancoDataset, type MaterialItem } from "../types";
import MaterialCard from "./MaterialCard";

interface VisualSearchProps {
  dataset: BancoDataset;
  plannedIds: Set<string>;
  onPreview: (m: MaterialItem) => void;
  onTogglePlan: (m: MaterialItem) => void;
}

export default function VisualSearch({
  dataset,
  plannedIds,
  onPreview,
  onTogglePlan,
}: VisualSearchProps) {
  const [q, setQ] = useState("");
  const [ciclo, setCiclo] = useState("");
  const [curso, setCurso] = useState("");
  const [asig, setAsig] = useState("");
  const [unidad, setUnidad] = useState("");
  const [tipo, setTipo] = useState("");
  const [anio, setAnio] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);
  const pageSize = viewMode === "cards" ? 24 : 35;

  const cursosFacet = useMemo(() => {
    const s = new Set<string>();
    for (const m of dataset.materials) {
      if (!ciclo || m.ciclo === ciclo) s.add(m.curso);
    }
    return sortCursos(Array.from(s));
  }, [dataset.materials, ciclo]);

  const asigsFacet = useMemo(() => {
    const s = new Set<string>();
    for (const m of dataset.materials) {
      if ((!ciclo || m.ciclo === ciclo) && (!curso || m.curso === curso)) s.add(m.asignatura);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [dataset.materials, ciclo, curso]);

  const tiposFacet = useMemo(
    () => Array.from(new Set(dataset.materials.map((m) => m.tipo))).sort((a, b) => a.localeCompare(b, "es")),
    [dataset.materials],
  );

  const filtered = useMemo(() => {
    const tokens = normText(q).split(/\s+/).filter(Boolean);
    return dataset.materials.filter((m) => {
      if (ciclo && m.ciclo !== ciclo) return false;
      if (curso && m.curso !== curso) return false;
      if (asig && m.asignatura !== asig) return false;
      if (unidad && m.unidad !== unidad) return false;
      if (tipo && m.tipo !== tipo) return false;
      if (anio && String(m.anio) !== anio) return false;
      for (const tok of tokens) {
        if (!m.searchText.includes(tok)) return false;
      }
      return true;
    });
  }, [dataset.materials, q, ciclo, curso, asig, unidad, tipo, anio]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const reset = () => {
    setQ("");
    setCiclo("");
    setCurso("");
    setAsig("");
    setUnidad("");
    setTipo("");
    setAnio("");
    setPage(1);
  };

  return (
    <section aria-label="Buscador visual global de materiales">
      <div className="section-head">
        <div>
          <h1>Buscador Rápido ({dataset.meta.totals.materiales.toLocaleString("es-CL")} recursos)</h1>
          <p>
            Busca por tema, OA (ej. <code>OA 3</code>), contenido del encabezado, curso o tipo de evaluación en todo el colegio.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "cards" ? "btn-primary" : ""}`}
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid size={14} /> Tarjetas
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : ""}`}
            onClick={() => setViewMode("table")}
          >
            <List size={14} /> Tabla
          </button>
        </div>
      </div>

      <div className="selector-panel">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="search-wrap">
            <Search size={15} />
            <input
              type="search"
              className="input"
              placeholder="Ej. fracciones, fotosíntesis, comprensión lectora, OA 4, rúbrica..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {(q || ciclo || curso || asig || unidad || tipo || anio) && (
            <button type="button" className="btn btn-sm" onClick={reset}>
              <RotateCcw size={13} /> Limpiar
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <select
            className="select"
            value={ciclo}
            onChange={(e) => {
              setCiclo(e.target.value);
              setCurso("");
              setAsig("");
              setPage(1);
            }}
          >
            <option value="">Ciclo: Todos</option>
            {CICLO_ORDER.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="select"
            value={curso}
            onChange={(e) => {
              setCurso(e.target.value);
              setAsig("");
              setPage(1);
            }}
          >
            <option value="">Curso: Todos</option>
            {cursosFacet.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="select"
            value={asig}
            onChange={(e) => {
              setAsig(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Asignatura: Todas</option>
            {asigsFacet.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            className="select"
            value={unidad}
            onChange={(e) => {
              setUnidad(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Unidad: Todas</option>
            <option value="Unidad 1">Unidad 1</option>
            <option value="Unidad 2">Unidad 2</option>
            <option value="Unidad 3">Unidad 3</option>
            <option value="Unidad 4">Unidad 4</option>
            <option value="Transversal">Transversal</option>
          </select>

          <select
            className="select"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tipo: Todos</option>
            {tiposFacet.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            className="select"
            value={anio}
            onChange={(e) => {
              setAnio(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Año: Todos</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>

        <div className="tabular" style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
          <strong>{filtered.length.toLocaleString("es-CL")}</strong> materiales encontrados · Página {safePage} de {totalPages}
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="cards-grid">
          {pageItems.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              isPlanned={plannedIds.has(m.id)}
              onPreview={onPreview}
              onTogglePlan={onTogglePlan}
              showCourseBadge
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Archivo y encabezado</th>
                  <th>Curso / Asignatura</th>
                  <th>Unidad / OA</th>
                  <th>Tipo / Año</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((m) => {
                  const planned = plannedIds.has(m.id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--navy-950)" }}>{m.name}</div>
                        {m.extracto && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                            {m.extracto.slice(0, 125)}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{m.curso}</strong>
                        <div style={{ fontSize: 11.5, color: "var(--ink-700)" }}>{m.asignatura}</div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{m.unidad}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                          {m.oas.map((o) => (
                            <span key={o} className="badge badge-ok mono">{o}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-navy">{m.tipo}</span>
                        <div className="mono tabular" style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 3 }}>
                          {m.anio}
                        </div>
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 5 }}>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => onPreview(m)}>
                            <Eye size={12} /> Ver
                          </button>
                          <a href={m.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                            <ExternalLink size={12} />
                          </a>
                          <button
                            type="button"
                            className={`btn btn-sm ${planned ? "btn-ok" : ""}`}
                            onClick={() => onTogglePlan(m)}
                          >
                            {planned ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            className="btn"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="btn tabular" style={{ cursor: "default" }}>
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            className="btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
