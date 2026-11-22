import React, { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Github,
  RotateCcw,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { RelocationRequest } from "../types";

interface RelocationsViewProps {
  requests: RelocationRequest[];
  appsScriptUrl: string;
  onSaveAppsScriptUrl: (url: string) => void;
  onRemoveRequest: (id: string) => void;
  onClearAll: () => void;
  onCopyText: (text: string, label: string) => void;
}

const GITHUB_REPO = "for-mi-da-ble/banco-material-docente";

export default function RelocationsView({
  requests,
  appsScriptUrl,
  onSaveAppsScriptUrl,
  onRemoveRequest,
  onClearAll,
  onCopyText,
}: RelocationsViewProps) {
  const [urlInput, setUrlInput] = useState(appsScriptUrl);
  const [showConfig, setShowConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const buildPayloadJson = () =>
    JSON.stringify(
      {
        schema: "cmc_relocations_v1",
        exported_at: new Date().toISOString(),
        total: requests.length,
        requests,
      },
      null,
      2,
    );

  const downloadJson = () => {
    const blob = new Blob([buildPayloadJson()], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reubicaciones_utp_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const headers = [
      "accion",
      "material_id",
      "drive_file_id",
      "nombre_archivo",
      "origen_curso",
      "origen_asignatura",
      "origen_unidad",
      "destino_curso",
      "destino_asignatura",
      "destino_unidad",
      "destino_ruta",
      "motivo",
      "reportado_por",
    ];
    const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...requests.map((r) =>
        [
          r.action,
          r.materialId,
          r.driveId,
          r.name,
          r.from.curso,
          r.from.asignatura,
          r.from.unidad,
          r.to?.curso || "",
          r.to?.asignatura || "",
          r.to?.unidad || "",
          r.to?.targetRuta || "",
          r.reason,
          r.reportedBy,
        ]
          .map(esc)
          .join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reubicaciones_utp_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openGithubIssue = () => {
    const summaryRows = requests
      .map((r) => {
        const dest =
          r.action === "reubicar" && r.to
            ? `${r.to.curso} / ${r.to.asignatura} / ${r.to.unidad}`
            : r.action === "pii"
            ? "CUARENTENA PII/NEE"
            : "ELIMINAR / NO CORRESPONDE";
        return `| \`${r.action}\` | ${r.name} | ${r.from.curso} / ${r.from.asignatura} / ${r.from.unidad} | ${dest} | ${r.reason} |`;
      })
      .join("\n");

    const title = `Solicitud de reubicación de material (${requests.length} archivo${requests.length > 1 ? "s" : ""})`;
    const body = [
      `## Solicitud de Reubicación / Corrección Curricular`,
      "",
      "| Acción | Archivo | Ubicación actual | Destino propuesto | Motivo |",
      "|---|---|---|---|---|",
      summaryRows,
      "",
      "### Lote JSON para aplicar automáticamente (`pipeline/apply_relocations.py`)",
      "```json",
      buildPayloadJson().slice(0, 4500),
      "```",
    ].join("\n");

    const url = `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSyncAppsScript = async () => {
    if (!appsScriptUrl.trim()) {
      setShowConfig(true);
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(appsScriptUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: buildPayloadJson(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSyncMessage({
        ok: true,
        text: `Aplicado en Google Drive y BD_App_Banco_Material_UTP: ${json.moved || 0} movidos, ${json.trashed || 0} enviados a papelera, ${json.pii || 0} en cuarentena PII.`,
      });
    } catch (err) {
      setSyncMessage({
        ok: false,
        text: `No se pudo conectar al Web App de Google Apps Script (${String(err)}). Puedes usar "Copiar para Antigravity" o "Enviar reporte a UTP".`,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section aria-label="Bandeja de reubicaciones y correcciones">
      <div className="section-head">
        <div>
          <h1>Reubicaciones y Correcciones Curriculares ({requests.length})</h1>
          <p>
            Los cambios que marques ya se reflejan visualmente en tu navegador. Desde aquí puedes enviarlos a UTP o aplicarlos físicamente en Google Drive y <code>BD_App_Banco_Material_UTP</code>.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-sm" onClick={() => setShowConfig((v) => !v)}>
            <Settings size={14} /> Conectar Drive directo (Apps Script)
          </button>
          {requests.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={onClearAll}>
              <RotateCcw size={13} /> Deshacer todo
            </button>
          )}
        </div>
      </div>

      {/* Configuración opcional de Google Apps Script para mover directo en Drive */}
      {showConfig && (
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Conexión directa a Google Drive + BD_App_Banco_Material_UTP (Opcional, \$0)
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ink-700)" }}>
            En tu hoja <strong>BD_App_Banco_Material_UTP</strong> → <em>Extensiones → Apps Script</em>, pega el código de{" "}
            <a
              href={`https://github.com/${GITHUB_REPO}/blob/main/scripts/apps_script_reubicar.gs`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <code>scripts/apps_script_reubicar.gs</code>
            </a>
            , implementa como <strong>Aplicación Web</strong> y pega aquí la URL <code>https://script.google.com/macros/s/.../exec</code>:
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: "1 1 360px" }}
              placeholder="https://script.google.com/macros/s/.../exec"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onSaveAppsScriptUrl(urlInput.trim());
                setShowConfig(false);
              }}
            >
              Guardar URL
            </button>
          </div>
        </div>
      )}

      {syncMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "11px 14px",
            borderRadius: 10,
            border: `1px solid ${syncMessage.ok ? "var(--ok-bd)" : "var(--warn-bd)"}`,
            background: syncMessage.ok ? "var(--ok-bg)" : "var(--warn-bg)",
            color: syncMessage.ok ? "var(--ok-fg)" : "var(--warn-fg)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {syncMessage.text}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="panel panel-pad" style={{ textAlign: "center", padding: 48, color: "var(--ink-500)" }}>
          <CheckCircle2 size={32} style={{ color: "var(--ok-fg)", marginBottom: 8 }} />
          <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--navy-950)" }}>
            No hay reubicaciones pendientes
          </h2>
          <p style={{ margin: 0, fontSize: 13 }}>
            Si encuentras una guía o prueba ubicada en un curso, asignatura o unidad que no corresponde, haz clic en el botón{" "}
            <strong>"Reubicar"</strong> en la tarjeta o dentro de la vista previa para moverla al lugar correcto.
          </p>
        </div>
      ) : (
        <>
          {/* Barra de acciones para aplicar el lote */}
          <div className="panel panel-pad" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--ink-700)" }}>
              <strong>¿Cómo aplicar estos {requests.length} cambios en Google Drive?</strong> Elige la vía que prefieras:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={syncing}
                onClick={handleSyncAppsScript}
                title="Aplica los movimientos directo en Google Drive vía Apps Script"
              >
                <CloudUpload size={14} />
                {syncing ? "Aplicando en Drive..." : appsScriptUrl ? "Aplicar en Google Drive ahora" : "Conectar y aplicar en Drive"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onCopyText(
                    `Aplica estas reubicaciones en Google Drive y actualiza BD_App_Banco_Material_UTP y la app en GitHub:\n\`\`\`json\n${buildPayloadJson()}\n\`\`\``,
                    "Lote JSON copiado — pégalo en Antigravity para aplicarlo en Drive",
                  )
                }
              >
                <Copy size={14} /> Copiar para Antigravity IA
              </button>
              <button type="button" className="btn" onClick={openGithubIssue}>
                <Github size={14} /> Reportar a UTP (GitHub)
              </button>
              <button type="button" className="btn" onClick={downloadJson}>
                <Download size={14} /> JSON
              </button>
              <button type="button" className="btn" onClick={downloadCsv}>
                <Download size={14} /> CSV
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Archivo</th>
                    <th>Ubicación anterior</th>
                    <th>Nuevo destino</th>
                    <th>Motivo / Reportado por</th>
                    <th style={{ textAlign: "right" }}>Deshacer</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.action === "reubicar" && <span className="badge badge-navy">Reubicar</span>}
                        {r.action === "eliminar" && (
                          <span className="badge badge-warn">
                            <Trash2 size={10} /> No corresponde
                          </span>
                        )}
                        {r.action === "pii" && (
                          <span className="badge badge-err">
                            <ShieldAlert size={10} /> Privacidad PII
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.name}</div>
                        <a
                          href={`https://drive.google.com/file/d/${r.driveId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 3 }}
                        >
                          Ver en Drive <ExternalLink size={10} />
                        </a>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {r.from.curso} · {r.from.asignatura} · {r.from.unidad}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.action === "reubicar" && r.to ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "var(--ok-fg)" }}>
                            <ArrowRight size={13} />
                            {r.to.curso} · {r.to.asignatura} · {r.to.unidad}
                          </div>
                        ) : r.action === "pii" ? (
                          <strong style={{ color: "var(--err-fg)" }}>Retirar a cuarentena_pii</strong>
                        ) : (
                          <strong style={{ color: "var(--warn-fg)" }}>Enviar a papelera en Drive</strong>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div>{r.reason}</div>
                        {r.reportedBy && (
                          <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Por: {r.reportedBy}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => onRemoveRequest(r.id)}
                          title="Deshacer este cambio"
                        >
                          <RotateCcw size={12} /> Deshacer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
