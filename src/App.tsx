import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  sortCursos,
  unpackDataset,
  type BancoDataset,
  type LessonMoment,
  type LessonPlanState,
  type MaterialItem,
} from "./types";
import PlannerBoard from "./components/PlannerBoard";
import VisualSearch from "./components/VisualSearch";
import LessonBasket from "./components/LessonBasket";
import CoveragePrepView from "./components/CoveragePrepView";
import PreviewModal from "./components/PreviewModal";

type ActiveTab = "planner" | "search" | "basket" | "coverage";

const STORAGE_KEY = "cmc_banco_docente_plan_v1";

const DEFAULT_PLAN: LessonPlanState = {
  title: "",
  teacher: "",
  courseLabel: "",
  dateRange: "",
  methodNotes: "",
  items: [],
};

function inferDefaultMoment(tipo: string): LessonMoment {
  const low = tipo.toLowerCase();
  if (low.includes("diagn") || low.includes("present") || low.includes("lectura")) return "inicio";
  if (low.includes("evalua") || low.includes("rúbrica") || low.includes("rubrica")) return "evaluacion";
  return "desarrollo";
}

export default function App() {
  const [dataset, setDataset] = useState<BancoDataset | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<ActiveTab>("planner");

  const [selectedCiclo, setSelectedCiclo] = useState("Enseñanza Media");
  const [selectedCurso, setSelectedCurso] = useState("1° Medio");
  const [selectedAsig, setSelectedAsig] = useState("Matemática");
  const [selectedUnit, setSelectedUnit] = useState("Unidad 1");

  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);
  const [toast, setToast] = useState("");

  const [plan, setPlan] = useState<LessonPlanState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_PLAN, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PLAN;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // ignore
    }
  }, [plan]);

  useEffect(() => {
    fetch("./data/banco-docente.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => setDataset(unpackDataset(raw)))
      .catch((err) => setLoadError(String(err)));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? "" : cur));
    }, 2600);
  }, []);

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(() => showToast(label));
      } else {
        showToast(label);
      }
    },
    [showToast],
  );

  const plannedIds = useMemo(() => new Set(plan.items.map((x) => x.materialId)), [plan.items]);

  const handleTogglePlan = useCallback(
    (m: MaterialItem) => {
      setPlan((prev) => {
        const exists = prev.items.some((x) => x.materialId === m.id);
        if (exists) {
          showToast("Quitado de Mi Planificación");
          return { ...prev, items: prev.items.filter((x) => x.materialId !== m.id) };
        }
        showToast(`Agregado a Mi Planificación (${m.tipo})`);
        return {
          ...prev,
          courseLabel: prev.courseLabel || `${m.curso} · ${m.asignatura}`,
          items: [
            ...prev.items,
            { materialId: m.id, moment: inferDefaultMoment(m.tipo), note: "" },
          ],
        };
      });
    },
    [showToast],
  );

  const handleSelectCiclo = useCallback(
    (ciclo: string) => {
      setSelectedCiclo(ciclo);
      if (!dataset) return;
      const cursos = sortCursos(
        Array.from(new Set(dataset.materials.filter((m) => m.ciclo === ciclo).map((m) => m.curso))),
      );
      const nextCurso = cursos[0] || "";
      setSelectedCurso(nextCurso);
      const asigs = Array.from(
        new Set(
          dataset.materials
            .filter((m) => m.ciclo === ciclo && m.curso === nextCurso)
            .map((m) => m.asignatura),
        ),
      ).sort((a, b) => a.localeCompare(b, "es"));
      setSelectedAsig(asigs[0] || "");
      setSelectedUnit(nextCurso === "Transversal" ? "Transversal" : "Unidad 1");
    },
    [dataset],
  );

  const handleSelectCurso = useCallback(
    (curso: string) => {
      setSelectedCurso(curso);
      if (!dataset) return;
      const counts = new Map<string, number>();
      for (const m of dataset.materials) {
        if (m.ciclo === selectedCiclo && m.curso === curso) {
          counts.set(m.asignatura, (counts.get(m.asignatura) || 0) + 1);
        }
      }
      const bestAsig = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      setSelectedAsig(bestAsig);
      setSelectedUnit(curso === "Transversal" ? "Transversal" : "Todas");
    },
    [dataset, selectedCiclo],
  );

  const handleOpenUnitInPlanner = useCallback(
    (ciclo: string, curso: string, asig: string, unidad: string) => {
      setSelectedCiclo(ciclo);
      setSelectedCurso(curso);
      setSelectedAsig(asig);
      setSelectedUnit(unidad);
      setTab("planner");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [],
  );

  if (loadError) {
    return (
      <div className="shell">
        <div className="panel panel-pad">
          <h2>No se pudo cargar el banco de material</h2>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="shell" style={{ textAlign: "center", paddingTop: 90 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--navy-900)" }}>
          Cargando Banco de Material Docente — Colegio Marina de Chile...
        </div>
        <p style={{ color: "var(--ink-500)", fontSize: 13 }}>
          Preparando 4.023 recursos y 2.663 Objetivos de Aprendizaje MINEDUC
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">CMC</div>
            <div>
              <div className="brand-title">Planificador y Banco Docente</div>
              <div className="brand-sub">Colegio Marina de Chile · 1° Básico a 4° Medio + Electivos HC</div>
            </div>
          </div>

          <nav className="nav-tabs" aria-label="Navegación principal">
            <button
              type="button"
              className={`nav-tab ${tab === "planner" ? "active" : ""}`}
              onClick={() => setTab("planner")}
            >
              <BookOpen size={15} /> Planificador Visual
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === "search" ? "active" : ""}`}
              onClick={() => setTab("search")}
            >
              <Search size={15} /> Buscador ({dataset.meta.totals.materiales.toLocaleString("es-CL")})
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === "basket" ? "active" : ""}`}
              onClick={() => setTab("basket")}
            >
              <ClipboardList size={15} /> Mi Planificación
              {plan.items.length > 0 && (
                <span className="nav-pill-count tabular">{plan.items.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === "coverage" ? "active" : ""}`}
              onClick={() => setTab("coverage")}
            >
              <BarChart3 size={15} /> Cobertura OA y Preparación
            </button>
          </nav>

          <a
            href={dataset.meta.sheet_bd_url}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-link"
          >
            BD Sheets <ExternalLink size={12} />
          </a>
        </div>
      </header>

      <main className="shell">
        {tab === "planner" && (
          <PlannerBoard
            dataset={dataset}
            plannedIds={plannedIds}
            selectedCiclo={selectedCiclo}
            selectedCurso={selectedCurso}
            selectedAsig={selectedAsig}
            selectedUnit={selectedUnit}
            onSelectCiclo={handleSelectCiclo}
            onSelectCurso={handleSelectCurso}
            onSelectAsig={setSelectedAsig}
            onSelectUnit={setSelectedUnit}
            onPreview={setPreviewMaterial}
            onTogglePlan={handleTogglePlan}
            onCopyText={handleCopyText}
          />
        )}

        {tab === "search" && (
          <VisualSearch
            dataset={dataset}
            plannedIds={plannedIds}
            onPreview={setPreviewMaterial}
            onTogglePlan={handleTogglePlan}
          />
        )}

        {tab === "basket" && (
          <LessonBasket
            dataset={dataset}
            plan={plan}
            onUpdatePlan={setPlan}
            onPreview={setPreviewMaterial}
            onRemoveItem={(id) =>
              setPlan((p) => ({ ...p, items: p.items.filter((x) => x.materialId !== id) }))
            }
            onClearAll={() => {
              setPlan(DEFAULT_PLAN);
              showToast("Planificación vaciada");
            }}
            onCopyText={handleCopyText}
          />
        )}

        {tab === "coverage" && (
          <CoveragePrepView
            dataset={dataset}
            onOpenUnitInPlanner={handleOpenUnitInPlanner}
            onCopyText={handleCopyText}
          />
        )}
      </main>

      <PreviewModal
        material={previewMaterial}
        oaCatalog={dataset.oaCatalog}
        isPlanned={previewMaterial ? plannedIds.has(previewMaterial.id) : false}
        onClose={() => setPreviewMaterial(null)}
        onTogglePlan={handleTogglePlan}
        onCopyText={handleCopyText}
      />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
