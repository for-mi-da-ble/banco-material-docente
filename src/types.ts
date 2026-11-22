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

export type RelocationAction = "reubicar" | "eliminar" | "pii";

export interface RelocationRequest {
  id: string; // unique request id
  materialId: string;
  driveId: string;
  name: string;
  action: RelocationAction;
  from: {
    ciclo: string;
    curso: string;
    asignatura: string;
    unidad: string;
    folderId: string;
  };
  to?: {
    ciclo: string;
    curso: string;
    asignatura: string;
    unidad: string;
    targetFolderId: string;
    targetRuta: string;
    oas: string[];
  };
  reason: string;
  reportedBy: string;
  createdAt: string;
}

export const CICLO_ORDER = ["1° Ciclo", "2° Ciclo", "Enseñanza Media", "Profesores"] as const;

export const CURSOS_POR_CICLO: Record<string, string[]> = {
  "1° Ciclo": ["Kínder", "1° Básico", "2° Básico", "3° Básico", "4° Básico", "Transversal"],
  "2° Ciclo": ["5° Básico", "6° Básico", "7° Básico", "8° Básico", "Transversal"],
  "Enseñanza Media": ["1° Medio", "2° Medio", "3° Medio", "4° Medio", "Electivos", "Transversal"],
  Profesores: ["Profesores"],
};

export const ELECTIVOS_HC: string[] = [
  "Artes Visuales, Audiovisuales y Multimediales",
  "Biología Celular y Molecular",
  "Biología de los Ecosistemas",
  "Ciencias de la Salud",
  "Ciencias del Ejercicio Físico y Deportivo",
  "Comprensión Histórica del Presente",
  "Creación y Composición Musical",
  "Diseño y Arquitectura",
  "Economía y Sociedad",
  "Estética",
  "Expresión Corporal",
  "Filosofía Política",
  "Física",
  "Geografía, Territorio y Desafíos Socioambientales",
  "Geometría 3D",
  "Interpretación Musical",
  "Interpretación y Creación en Danza",
  "Interpretación y Creación en Teatro",
  "Lectura y Escritura Especializadas",
  "Límites, Derivadas e Integrales",
  "Participación y Argumentación en Democracia",
  "Pensamiento Computacional",
  "Probabilidad y Estadística",
  "Promoción de Estilos de Vida Activos y Saludables",
  "Química",
  "Seminario de Filosofía",
  "Taller de Literatura",
];

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
  "Profesores",
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

export function getAllowedSubjectsForCourse(curso: string): string[] {
  if (curso === "Profesores") {
    return ["Evaluación Docente", "Portafolio y Formación Docente", "Plan Lector y Mediación"];
  }
  if (curso === "Transversal") return ["Gestión y Transversal"];
  if (curso === "Electivos") return ELECTIVOS_HC;
  if (curso === "3° Medio" || curso === "4° Medio") {
    return [...Array.from(BASALES_3M_4M), "Religión", "Orientación"];
  }
  if (curso === "1° Medio" || curso === "2° Medio") {
    return [
      "Lengua y Literatura",
      "Matemática",
      "Historia, Geografía y Ciencias Sociales",
      "Biología",
      "Física",
      "Química",
      "Inglés",
      "Artes Visuales",
      "Música",
      "Educación Física y Salud",
      "Tecnología",
      "Orientación",
      "Religión",
    ];
  }
  const lang = ["Kínder", "1° Básico", "2° Básico", "3° Básico", "4° Básico", "5° Básico", "6° Básico"].includes(curso)
    ? "Lenguaje y Comunicación"
    : "Lengua y Literatura";
  return [
    lang,
    "Matemática",
    "Historia, Geografía y Ciencias Sociales",
    "Ciencias Naturales",
    "Inglés",
    "Artes Visuales",
    "Música",
    "Educación Física y Salud",
    "Tecnología",
    "Orientación",
    "Religión",
  ];
}

export function getRootForCiclo(ciclo: string): { root: string; transversal: string } {
  if (ciclo === "1° Ciclo") {
    return { root: "Material", transversal: "Transversal y Gestión/Transversal 1° Ciclo y Gestión" };
  }
  if (ciclo === "2° Ciclo") {
    return { root: "Material", transversal: "Transversal y Gestión/Transversal 2° Ciclo y Gestión" };
  }
  return { root: "Material", transversal: "Transversal y Gestión/Transversal Media y Gestión" };
}

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
