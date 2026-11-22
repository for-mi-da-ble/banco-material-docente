import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  normText,
  sortCursos,
  unpackDataset,
  type BancoDataset,
  type LessonMoment,
  type LessonPlanState,
  type MaterialItem,
  type RelocationRequest,
} from "./types";
import PlannerBoard from "./components/PlannerBoard";
import VisualSearch from "./components/VisualSearch";
import LessonBasket from "./components/LessonBasket";
import CoveragePrepView from "./components/CoveragePrepView";
import RelocationsView from "./components/RelocationsView";
import PreviewModal from "./components/PreviewModal";
import RelocateModal from "./components/RelocateModal";

type ActiveTab = "planner" | "search" | "basket" | "relocations" | "coverage";

const PLAN_STORAGE_KEY = "cmc_banco_docente_plan_v1";
const REL_STORAGE_KEY = "cmc_banco_docente_relocations_v1";
const APPS_SCRIPT_KEY = "cmc_banco_docente_apps_script_url_v1";

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
  const [baseDataset, setBaseDataset] = useState<BancoDataset | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<ActiveTab>("planner");

  const [selectedCiclo, setSelectedCiclo] = useState("Enseñanza Media");
  const [selectedCurso, setSelectedCurso] = useState("1° Medio");
  const [selectedAsig, setSelectedAsig] = useState("Matemática");
  const [selectedUnit, setSelectedUnit] = useState("Unidad 1");

  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);
  const [relocateTarget, setRelocateTarget] = useState<MaterialItem | null>(null);
  const [toast, setToast] = useState("");

  const [plan, setPlan] = useState<LessonPlanState>(() => {
    try {
      const saved = localStorage.getItem(PLAN_STORAGE_KEY);
      if (saved) return { ...DEFAULT_PLAN, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PLAN;
  });

  const [relocations, setRelocations] = useState<RelocationRequest[]>(() => {
    try {
      const saved = localStorage.getItem(REL_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as RelocationRequest[];
    } catch {
      // ignore
    }
    return [];
  });

  const [appsScriptUrl, setAppsScriptUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(APPS_SCRIPT_KEY) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // ignore
    }
  }, [plan]);

  useEffect(() => {
    try {
      localStorage.setItem(REL_STORAGE_KEY, JSON.stringify(relocations));
    } catch {
      // ignore
    }
  }, [relocations]);

  const handleSaveAppsScriptUrl = useCallback((url: string) => {
    setAppsScriptUrl(url);
    try {
      localStorage.setItem(APPS_SCRIPT_KEY, url);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch("./data/banco-docente.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => setBaseDataset(unpackDataset(raw)))
      .catch((err) => setLoadError(String(err)));
  }, []);

  // Aplicar visualmente las reubicaciones pendientes en tiempo real
  const relocationByMatId = useMemo(() => {
    const map = new Map<string, RelocationRequest>();
    for (const r of relocations) map.set(r.materialId, r);
    return map;
  }, [relocations]);

  const relocatedIds = useMemo(
    () => new Set(relocations.filter((r) => r.action === "reubicar").map((r) => r.materialId)),
    [relocations],
  );

  const dataset = useMemo<BancoDataset | null>(() => {
    if (!baseDataset) return null;
    if (relocations.length === 0) return baseDataset;

    const effectiveMaterials: MaterialItem[] = [];
    for (const m of baseDataset.materials) {
      const req = relocationByMatId.get(m.id);
      if (!req) {
        effectiveMaterials.push(m);
        continue;
      }
      if (req.action === "eliminar" || req.action === "pii") {
        // Ocultar visualmente del banco hasta deshacer o aplicar
        continue;
      }
      if (req.action === "reubicar" && req.to) {
        const nextCurso = req.to.curso;
        const nextAsig = req.to.asignatura;
        const nextUnit = req.to.unidad;
        const nextOas = req.to.oas.length > 0 ? req.to.oas : m.oas;
        effectiveMaterials.push({
          ...m,
          ciclo: req.to.ciclo,
          curso: nextCurso,
          asignatura: nextAsig,
          esElectivo: nextCurso === "Electivos",
          unidad: nextUnit,
          folderId: req.to.targetFolderId || m.folderId,
          oas: nextOas,
          searchText: normText(
            `${m.name} ${nextCurso} ${nextAsig} ${nextUnit} ${m.tipo} ${nextOas.join(" ")} ${m.extracto} ${m.id}`,
          ),
        });
      }
    }

    return {
      ...baseDataset,
      meta: {
        ...baseDataset.meta,
        totals: {
          ...baseDataset.meta.totals,
          materiales: effectiveMaterials.length,
        },
      },
      materials: effectiveMaterials,
    };
  }, [baseDataset, relocations, relocationByMatId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? "" : cur));
    }, 3000);
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

  const handleSaveRelocation = useCallback(
    (req: RelocationRequest) => {
      setRelocations((prev) => {
        const filtered = prev.filter((x) => x.materialId !== req.materialId);
        return [req, ...filtered];
      });
      if (req.action === "reubicar" && req.to) {
        showToast(`Reubicado visualmente a ${req.to.curso} · ${req.to.asignatura} (${req.to.unidad})`);
      } else if (req.action === "pii") {
        showToast("Marcado para cuarentena PII y ocultado de tu vista");
      } else {
        showToast("Marcado como 'No corresponde' (revisa la pestaña Reubicaciones)");
      }
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
              <BookOpen size={15} /> Planificador
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
              className={`nav-tab ${tab === "relocations" ? "active" : ""}`}
              onClick={() => setTab("relocations")}
            >
              <ArrowRightLeft size={15} /> Reubicaciones
              {relocations.length > 0 && (
                <span className="nav-pill-count tabular" style={{ background: "#fb923c" }}>
                  {relocations.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === "coverage" ? "active" : ""}`}
              onClick={() => setTab("coverage")}
            >
              <BarChart3 size={15} /> Cobertura OA
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
            relocatedIds={relocatedIds}
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
            onRelocate={setRelocateTarget}
            onCopyText={handleCopyText}
          />
        )}

        {tab === "search" && (
          <VisualSearch
            dataset={dataset}
            plannedIds={plannedIds}
            relocatedIds={relocatedIds}
            onPreview={setPreviewMaterial}
            onTogglePlan={handleTogglePlan}
            onRelocate={setRelocateTarget}
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

        {tab === "relocations" && (
          <RelocationsView
            requests={relocations}
            appsScriptUrl={appsScriptUrl}
            onSaveAppsScriptUrl={(url) => {
              handleSaveAppsScriptUrl(url);
              showToast("URL de Apps Script guardada");
            }}
            onRemoveRequest={(id) => {
              setRelocations((prev) => prev.filter((r) => r.id !== id));
              showToast("Cambio deshecho");
            }}
            onClearAll={() => {
              setRelocations([]);
              showToast("Se deshicieron todas las reubicaciones pendientes");
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
        onRelocate={setRelocateTarget}
        onCopyText={handleCopyText}
      />

      <RelocateModal
        material={relocateTarget}
        dataset={dataset}
        existingRequest={relocateTarget ? relocationByMatId.get(relocateTarget.id) : null}
        defaultReporter={plan.teacher}
        onClose={() => setRelocateTarget(null)}
        onSave={handleSaveRelocation}
      />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
