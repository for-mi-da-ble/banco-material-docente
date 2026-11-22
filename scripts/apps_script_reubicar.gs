/**
 * Google Apps Script — Conector directo de Reubicaciones para BD_App_Banco_Material_UTP
 * Colegio Marina de Chile (UTP)
 *
 * Instalación (1 sola vez, ~1 minuto):
 * 1. Abre tu Google Sheet `BD_App_Banco_Material_UTP`.
 * 2. Menú: Extensiones -> Apps Script.
 * 3. Pega este archivo y guarda.
 * 4. Botón "Implementar" -> "Nueva implementación" -> Tipo: "Aplicación web".
 *    - Ejecutar como: "Yo" (la cuenta dueña de las carpetas Material-*)
 *    - Quién tiene acceso: "Cualquier persona" (o usuarios del dominio @andaliensur.cl)
 * 5. Copia la URL `https://script.google.com/macros/s/.../exec` y pégala en la pestaña
 *    "Reubicaciones -> Conectar Drive directo" de la App Docente.
 *
 * NUNCA toca `OA por Unidad – Programas de Estudio MINEDUC`.
 */

const UNIFIED_MATERIAL_ROOT_ID = "1xw20x9I5jbkHiRSrDEIB1PMBI3KTL_tu";

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function resolveOrCreateTargetFolder_(to) {
  if (to.targetFolderId) {
    try {
      return DriveApp.getFolderById(to.targetFolderId);
    } catch (e) {}
  }
  let folder = DriveApp.getFolderById(UNIFIED_MATERIAL_ROOT_ID);
  const parts = String(to.targetRuta || "").split("/").slice(1);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) folder = getOrCreateSubfolder_(folder, parts[i]);
  }
  return folder;
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const requests = payload.requests || [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const wsMat = ss.getSheetByName("materiales");
    const wsPii = ss.getSheetByName("cuarentena_pii");
    const wsLog = ss.getSheetByName("log_auditoria");

    const matData = wsMat.getDataRange().getValues();
    const headers = matData[0];
    const colIdx = (name) => headers.indexOf(name);
    const idCol = colIdx("drive_file_id");

    let moved = 0, trashed = 0, pii = 0;
    const now = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd HH:mm 'UTC'");

    requests.forEach((req) => {
      const file = DriveApp.getFileById(req.driveId);
      let rowNum = -1;
      for (let r = 1; r < matData.length; r++) {
        if (String(matData[r][idCol]) === String(req.driveId)) {
          rowNum = r + 1;
          break;
        }
      }

      if (req.action === "reubicar" && req.to) {
        const destFolder = resolveOrCreateTargetFolder_(req.to);
        file.moveTo(destFolder);
        moved++;

        if (rowNum > 0) {
          wsMat.getRange(rowNum, colIdx("folder_id_actual") + 1).setValue(destFolder.getId());
          wsMat.getRange(rowNum, colIdx("ruta_actual") + 1).setValue(req.to.targetRuta + "/" + file.getName());
          wsMat.getRange(rowNum, colIdx("ciclo") + 1).setValue(req.to.ciclo);
          wsMat.getRange(rowNum, colIdx("curso") + 1).setValue(req.to.curso);
          wsMat.getRange(rowNum, colIdx("asignatura") + 1).setValue(req.to.asignatura);
          wsMat.getRange(rowNum, colIdx("es_electivo") + 1).setValue(req.to.curso === "Electivos" ? "SI" : "NO");
          wsMat.getRange(rowNum, colIdx("unidad") + 1).setValue(req.to.unidad);
          if (req.to.oas && req.to.oas.length > 0) {
            wsMat.getRange(rowNum, colIdx("oas_codigos") + 1).setValue(req.to.oas.join("; "));
          }
          wsMat.getRange(rowNum, colIdx("estado_validacion") + 1).setValue("verificado_utp");
          wsMat.getRange(rowNum, colIdx("notas_ia_utp") + 1).setValue("Reubicado desde App Docente: " + (req.reason || ""));
        }
        wsLog.appendRow([now, "app_docente", "Reubicación Drive", "move", req.driveId, req.from.curso + "/" + req.from.asignatura, req.to.targetRuta, req.reason || ""]);
      } else if (req.action === "eliminar") {
        file.setTrashed(true);
        trashed++;
        if (rowNum > 0) wsMat.deleteRow(rowNum);
        wsLog.appendRow([now, "app_docente", "Depuración", "trash", req.driveId, req.from.curso + "/" + req.from.asignatura, "Papelera", req.reason || ""]);
      } else if (req.action === "pii") {
        pii++;
        if (rowNum > 0) wsMat.deleteRow(rowNum);
        const obf = String(req.name || "").slice(0, 26) + "... [OFUSCADO]";
        wsPii.appendRow([now, req.from.ciclo, req.driveId, req.from.curso + "/" + req.from.asignatura, obf, "REPORTE_DOCENTE_PII", "excluido_revisar_retiro", req.reason || ""]);
        wsLog.appendRow([now, "app_docente", "Cuarentena PII", "quarantine", req.driveId, req.from.curso + "/" + req.from.asignatura, "cuarentena_pii", "Reportado desde App Docente"]);
      }
    });

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, moved: moved, trashed: trashed, pii: pii })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
