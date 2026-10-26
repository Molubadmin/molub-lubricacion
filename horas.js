// ============================================================
// HORAS HOMBRE — resumen de horas trabajadas por técnico, a partir
// de las actividades extra registradas (hora de inicio/fin de cada
// una) y el conteo de tareas cerradas.
// ============================================================
// Séptimo módulo separado de app.js (los primeros fueron raci.js,
// lubricantes.js, cartas.js, equipos.js, actividades-extra.js y
// tareas.js), mismo patrón: movimiento de código, no reescritura.
// horasEntre() también la usa actividades-extra.js al guardar una
// actividad — sigue funcionando igual porque todos los archivos
// comparten el mismo espacio global y este se carga ANTES que
// app.js en index.html. Depende de utilidades compartidas que
// siguen en app.js (state, displayExtraUser, displayExtraPhotoData,
// puedeDescargarExcelHoras, mostrarAvisoFlotante, activeEmpresa, sb,
// cfg, ACTIVIDAD_EXTRA_SELECT_LAB, renderModules) y de la librería
// ExcelJS (cargada por CDN en index.html, antes que este archivo).

// Descarga un Excel (.xlsx) con las actividades extra de la empresa
// activa, con la foto de evidencia incrustada en la fila (no un link
// - las fotos se guardan como texto codificado, no como una liga real
// que se pueda abrir, asi que incrustarla es lo unico que de verdad
// funciona). Solo disponible para quien pase puedeDescargarExcelHoras().
// Trae datos frescos de Supabase (no el limite de 20 que usa la
// pantalla) para que el reporte sea completo.
async function descargarExcelHoras() {
  if (!puedeDescargarExcelHoras()) return;
  if (typeof ExcelJS === "undefined") {
    mostrarAvisoFlotante("No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.", "error");
    return;
  }
  if (!cfg.tables.actividades || !state.empresaId) return;

  mostrarAvisoFlotante("Generando Excel, puede tardar un momento...", "ok");

  const { data, error } = await sb
    .from(cfg.tables.actividades)
    .select(ACTIVIDAD_EXTRA_SELECT_LAB)
    .eq("empresa_id", state.empresaId)
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false })
    .limit(500);

  if (error) {
    mostrarAvisoFlotante(`No se pudo generar el Excel: ${error.message}`, "error");
    return;
  }

  const selectedHoras = state.selectedHorasTecnico || "";
  const lista = selectedHoras
    ? (data || []).filter(act => (displayExtraUser(act) || "Sin técnico") === selectedHoras)
    : (data || []);

  if (!lista.length) {
    mostrarAvisoFlotante("No hay movimientos para exportar.", "warn");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Horas hombre");
  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 16 },
    { header: "Técnico", key: "tecnico", width: 24 },
    { header: "Actividad", key: "actividad", width: 40 },
    { header: "Equipo", key: "equipo", width: 20 },
    { header: "Horas", key: "horas", width: 9 },
    { header: "Estatus", key: "estatus", width: 18 },
    { header: "Comentario", key: "comentario", width: 36 },
    { header: "Foto", key: "foto", width: 20 }
  ];
  sheet.getRow(1).font = { bold: true };

  lista.forEach((act, index) => {
    const filaNum = index + 2; // la fila 1 es el encabezado
    sheet.addRow({
      fecha: `${act.fecha || ""} ${act.hora || ""}`.trim(),
      tecnico: displayExtraUser(act) || "Sin técnico",
      actividad: act.descripcion || "Sin descripción",
      equipo: act.equipo_texto || "Sin equipo",
      horas: act.horas_hombre || "",
      estatus: act.status || act.revision_status || "",
      comentario: act.comentario || ""
    });

    const fotoDataUrl = displayExtraPhotoData(act);
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(fotoDataUrl || "");
    if (match) {
      try {
        const extensionCruda = match[1].toLowerCase();
        const extension = extensionCruda === "jpg" ? "jpeg" : extensionCruda;
        if (["jpeg", "png", "gif"].includes(extension)) {
          const imageId = workbook.addImage({ base64: fotoDataUrl, extension });
          sheet.addImage(imageId, {
            tl: { col: 7, row: filaNum - 1 },
            ext: { width: 90, height: 90 }
          });
          sheet.getRow(filaNum).height = 70;
        }
      } catch (err) {
        console.warn("No se pudo incrustar una foto en el Excel:", err.message);
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const empresaArchivo = String(activeEmpresa()?.nombre || "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  link.href = url;
  link.download = `horas-hombre-${empresaArchivo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  mostrarAvisoFlotante("Excel descargado.", "ok");
}

function horasEntre(inicio, fin) {
  if (!inicio || !fin) return null;
  const [ih, im] = inicio.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  if ([ih, im, fh, fm].some(Number.isNaN)) return null;
  let minutos = (fh * 60 + fm) - (ih * 60 + im);
  if (minutos < 0) minutos += 24 * 60;
  return Math.round((minutos / 60) * 100) / 100;
}

function numericHours(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function horasPorTecnico() {
  const map = new Map();
  state.actividades.forEach(act => {
    const tecnico = displayExtraUser(act) || "Sin técnico";
    const current = map.get(tecnico) || {
      tecnico,
      extras: 0,
      horasExtra: 0,
      aprobadas: 0,
      pendientes: 0,
      rechazadas: 0
    };
    const status = String(act.status || act.revision_status || "").toLowerCase();
    current.extras += 1;
    current.horasExtra += numericHours(act.horas_hombre);
    if (status.includes("aprob")) current.aprobadas += 1;
    else if (status.includes("rechaz")) current.rechazadas += 1;
    else current.pendientes += 1;
    map.set(tecnico, current);
  });
  return [...map.values()]
    .map(row => ({ ...row, horasExtra: Math.round(row.horasExtra * 100) / 100 }))
    .sort((a, b) => b.horasExtra - a.horasExtra || a.tecnico.localeCompare(b.tecnico));
}

function horasResumen() {
  const rows = horasPorTecnico();
  const tareasCerradas = state.tareas.filter(tarea => {
    const status = String(tarea.status || tarea.revision_status || "").toLowerCase();
    return status.includes("cerrada") || status.includes("aprob");
  }).length;
  return {
    rows,
    totalHorasExtra: Math.round(rows.reduce((sum, row) => sum + row.horasExtra, 0) * 100) / 100,
    extras: state.actividades.length,
    extrasAprobadas: state.actividades.filter(act => String(act.status || act.revision_status || "").toLowerCase().includes("aprob")).length,
    extrasPendientes: state.actividades.filter(act => {
      const status = String(act.status || act.revision_status || "").toLowerCase();
      return !status.includes("aprob") && !status.includes("rechaz");
    }).length,
    tareasCerradas
  };
}

function seleccionarHorasTecnico(tecnico) {
  state.selectedHorasTecnico = tecnico;
  renderModules();
}

function seleccionarHorasExtra(id) {
  const extra = state.actividades.find(act => act.id === id);
  state.selectedHorasTecnico = displayExtraUser(extra) || "Sin técnico";
  state.selectedExtraId = id;
  renderModules();
}

function horasDetalleTecnico(tecnico) {
  return state.actividades.filter(act => (displayExtraUser(act) || "Sin técnico") === tecnico);
}
