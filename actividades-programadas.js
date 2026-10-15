// ============================================================
// ACTIVIDADES PROGRAMADAS — agendar trabajo futuro para uno o
// varios técnicos (o un contratista). Al guardarse se crea como una
// fila más en "tareas_asignadas" (tipo: "programada"), así que ver,
// cerrar y revisar una actividad programada usa las mismas pantallas
// de Asignaciones (tareas.js) — aquí solo vive lo propio de
// programarla: el filtro de la lista y el formulario para crearla.
// ============================================================
// Octavo módulo separado de app.js (los primeros fueron raci.js,
// lubricantes.js, cartas.js, equipos.js, actividades-extra.js,
// tareas.js y horas.js), mismo patrón: movimiento de código, no
// reescritura. Depende de utilidades compartidas que siguen en
// app.js (state, $, setStatus, mostrarAvisoFlotante,
// filtrarPorTextoYEstado, ordenarPorFecha, loadTareas, sb, cfg,
// renderModules) — por eso se carga ANTES que app.js en index.html.

function actividadesProgramadasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.actividadesFiltro, ["actividad", "descripcion", "equipo_texto", "asignado_nombre"], "asignado_nombre");
  return ordenarPorFecha(filtradas, state.actividadesFiltro.orden, ["fecha_envio", "created_at"]);
}

function actualizarFiltroActividades(campo, valor) {
  state.actividadesFiltro[campo] = valor;
  renderModules();
}

async function guardarActividadProgramada() {
  const descripcion = $("actividad-descripcion")?.value.trim();
  const equipoTexto = $("actividad-equipo")?.value.trim();
  const fecha = $("actividad-fecha")?.value;
  const hora = $("actividad-hora")?.value;
  const fechaLimite = $("actividad-fecha-limite")?.value;
  const prioridad = $("actividad-prioridad")?.value || "Normal";
  const comentario = $("actividad-comentario")?.value.trim();
  const contratistas = $("actividad-contratistas")?.value.trim();
  const trabajadores = Array.from(document.querySelectorAll("[data-worker-id]:checked"))
    .map(input => state.perfiles.find(p => p.id === input.value))
    .filter(Boolean);

  if (!descripcion || !equipoTexto || !fecha) {
    setStatus("Completa actividad, equipo o área y fecha antes de guardar.", "warn");
    mostrarAvisoFlotante("Completa actividad, equipo/área y fecha antes de enviar.", "error");
    return;
  }

  if (!trabajadores.length && !contratistas) {
    setStatus("Selecciona al menos un trabajador o escribe el contratista.", "warn");
    mostrarAvisoFlotante("Selecciona al menos un trabajador o escribe el contratista.", "error");
    return;
  }

  setStatus("Guardando actividad programada...");
  const trabajadoresTexto = trabajadores.map(t => t.nombre).join(", ");
  const asignadosTexto = [trabajadoresTexto, contratistas].filter(Boolean).join(", ");
  const programadaId = crypto.randomUUID();
  const equipoRelacionado = state.equipos.find(e => {
    const tag = String(e.id_tag || "").toUpperCase();
    const nombre = String(e.nombre_equipo || "").toUpperCase();
    const texto = equipoTexto.toUpperCase();
    return tag === texto || nombre === texto || texto.includes(tag);
  });
  const basePayload = {
    empresa_id: state.empresaId,
    equipo_id: equipoRelacionado?.id || null,
    equipo_texto: equipoTexto,
    actividad: descripcion,
    descripcion,
    prioridad,
    fecha_envio: fecha,
    hora_envio: hora || null,
    fecha_limite: fechaLimite || null,
    comentario,
    status: "pendiente",
    tipo: "programada",
    tipo_programacion: "programada",
    programada_id: programadaId
  };
  const payloads = trabajadores.map(worker => ({
    ...basePayload,
    usuario_id: worker.id,
    asignado_nombre: worker.nombre,
    asignado_rol: worker.rol || "TECNICO"
  }));
  if (contratistas) {
    payloads.push({
      ...basePayload,
      usuario_id: null,
      asignado_nombre: contratistas,
      asignado_rol: "TECNICO_CONTR",
      contratista_nombre: contratistas
    });
  }

  const { error } = await sb
    .from(cfg.tables.tareas)
    .insert(payloads);

  if (error) {
    setStatus(`Supabase no dejó guardar en tareas_asignadas todavía: ${error.message}. Corre el Paso 08 si no lo has corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo enviar la actividad: ${error.message}`, "error");
    return;
  }

  $("actividad-descripcion").value = "";
  $("actividad-equipo").value = "";
  $("actividad-fecha").value = "";
  $("actividad-hora").value = "";
  $("actividad-fecha-limite").value = "";
  $("actividad-comentario").value = "";
  $("actividad-contratistas").value = "";
  document.querySelectorAll("[data-worker-id]").forEach(input => { input.checked = false; });
  await loadTareas();
  renderModules();
  mostrarAvisoFlotante(`Actividad enviada a ${asignadosTexto}.`, "ok");
}
