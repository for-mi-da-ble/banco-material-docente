export type FileKind = "pdf" | "doc" | "ppt" | "xls" | "file";

export interface MaterialItem {
  id: string;
  driveId: string;
  name: string;
  kind: FileKind;
  folderId: string;
  anio: number;
  ciclo: string;
  curso: string;
  asignatura: string;
  esElectivo: boolean;
  unidad: string;
  tipo: string;
  oas: string[];
  extracto: string;
  driveUrl: string;
  previewUrl: string;
  searchText: string;
}

export interface OaEntry {
  oa: string;
  eje: string;
  u_nom: string;
  desc: string;
}

export interface CoverageItem {
  ciclo: string;
  curso: string;
  asig: string;
  unidad: string;
  tot: number;
  cov: number;
  pct: number;
  mats: number;
  oas: Array<[string, number, number]>; // [oa_code, covered(0/1), mat_count]
}

export interface FolderEntry {
  id: string;
  ciclo: string;
  curso: string;
  asig: string;
  unidad: string;
  ruta: string;
}

export interface BancoDataset {
  meta: {
    generated_at: string;
    sheet_bd_url: string;
    sheet_mineduc_url: string;
    totals: {
      materiales: number;
      carpetas_activas: number;
      unidades: number;
      oas_cubiertos: number;
      oas_totales: number;
    };
  };
  materials: MaterialItem[];
  coverage: CoverageItem[];
  oaCatalog: Record<string, OaEntry[]>;
  folders: FolderEntry[];
}

export type LessonMoment = "inicio" | "desarrollo" | "evaluacion";

export interface PlannedResource {
  materialId: string;
  moment: LessonMoment;
  note: string;
}

export interface LessonPlanState {
  title: string;
  teacher: string;
  courseLabel: string;
  dateRange: string;
  methodNotes: string;
  items: PlannedResource[];
}

export const CICLO_ORDER = ["1° Ciclo", "2° Ciclo", "Enseñanza Media"] as const;

export const CURSO_ORDER = [
  "Kínder",
  "1° Básico",
  "2° Básico",
  "3° Básico",
  "4° Básico",
  "5° Básico",
  "6° Básico",
  "7° Básico",
  "8° Básico",
  "1° Medio",
  "2° Medio",
  "3° Medio",
  "4° Medio",
  "Electivos",
  "Transversal",
];

export const BASALES_3M_4M = new Set([
  "Lengua y Literatura",
  "Matemática",
  "Filosofía",
  "Educación Ciudadana",
  "Ciencias para la Ciudadanía",
  "Inglés",
  "Artes Visuales",
  "Historia",
  "Música",
  "Educación Física y Salud",
]);

export function normText(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function sortCursos(cursos: string[]): string[] {
  return [...cursos].sort((a, b) => {
    const ia = CURSO_ORDER.indexOf(a);
    const ib = CURSO_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "es");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

interface RawPayload {
  meta: BancoDataset["meta"];
  dict: {
    ciclos: string[];
    cursos: string[];
    asigs: string[];
    unidades: string[];
    tipos: string[];
  };
  materials: Array<
    [string, string, string, FileKind, string, number, number, number, number, number, number, number, string[], string]
  >;
  coverage: CoverageItem[];
  oaCatalog: Record<string, OaEntry[]>;
  folders: FolderEntry[];
}

export function unpackDataset(raw: RawPayload): BancoDataset {
  const { ciclos, cursos, asigs, unidades, tipos } = raw.dict;
  const materials: MaterialItem[] = raw.materials.map((row) => {
    const [id, driveId, name, kind, folderId, anio, ci, cui, ai, el, ui, ti, oas, extracto] = row;
    const ciclo = ciclos[ci] || "";
    const curso = cursos[cui] || "";
    const asignatura = asigs[ai] || "";
    const unidad = unidades[ui] || "";
    const tipo = tipos[ti] || "";
    return {
      id,
      driveId,
      name,
      kind,
      folderId,
      anio,
      ciclo,
      curso,
      asignatura,
      esElectivo: el === 1,
      unidad,
      tipo,
      oas,
      extracto,
      driveUrl: `https://drive.google.com/file/d/${driveId}/view`,
      previewUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      searchText: normText(`${name} ${curso} ${asignatura} ${unidad} ${tipo} ${oas.join(" ")} ${extracto} ${id}`),
    };
  });

  return {
    meta: raw.meta,
    materials,
    coverage: raw.coverage,
    oaCatalog: raw.oaCatalog,
    folders: raw.folders,
  };
}

export function scanPiiText(filename: string, text: string): {
  blocked: boolean;
  kind: "ok" | "pii" | "feedback";
  reasons: string[];
} {
  const raw = `${filename}\n${text}`;
  const clean = normText(raw).replace(/[_-]+/g, " ");
  if (/retroalimentacion.*aula|observacion.*aula|acompanamiento\s*docente/i.test(clean)) {
    return { blocked: true, kind: "feedback", reasons: ["FICHA_RETROALIMENTACION_DOCENTE"] };
  }
  const reasons: string[] = [];
  if (/\b\d{1,2}\.\d{3}\.\d{3}\s*[-–]\s*[0-9kK]\b/.test(raw) || /\b(?:run|rut)\s*[:.\-]?\s*\d{7,9}\b/i.test(raw)) {
    reasons.push("RUT_RUN_ESTUDIANTE");
  }
  if (/\b(?:paci|pai)\b/i.test(clean)) reasons.push("PAI_PACI");
  if (/\b(?:integracion\s*escolar|informe\s*pie|paec|tea|acompanamiento\s*emocional)\b/i.test(clean)) {
    reasons.push("PIE_NEE_PAEC");
  }
  if (/\b(?:conners|anamnesis|psicopedagogic|infcafp|certificado\s*anual|resumen\s*(?:de|para)\s*apoderad|nomina\s*de\s*(?:alumnos|estudiantes)|lista\s*de\s*(?:curso|alumnos))\b/i.test(clean)) {
    reasons.push("CLINICO_SIGE_NOMINA");
  }
  return reasons.length > 0
    ? { blocked: true, kind: "pii", reasons }
    : { blocked: false, kind: "ok", reasons: [] };
}
