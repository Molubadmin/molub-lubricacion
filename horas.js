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
// siguen en app.js (state, displayExtraUser, renderModules).

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
