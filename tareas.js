// ============================================================
// TAREAS ASIGNADAS (Asignaciones) — tarea que un supervisor le
// asigna a un técnico, su cierre (qué hizo, evidencia, foto) y la
// revisión/autorización de ese cierre.
// ============================================================
// Sexto módulo separado de app.js (los primeros fueron raci.js,
// lubricantes.js, cartas.js, equipos.js y actividades-extra.js),
// mismo patrón: movimiento de código, no reescritura. Este archivo
// junta piezas que en app.js estaban repartidas entre utilidades
// genéricas compartidas (filtrarPorTextoYEstado, ordenarPorFecha,
// campoDetalle, equipoDeTexto, pillEstado, fileToDataUrl, loadTareas)
// — esas utilidades se quedan en app.js porque también las usan
// otros módulos. Se carga ANTES que app.js en index.html.

function visibleTareas() {
  if (isSupervisorMode()) return state.tareas;
  const user = activeUser();
  if (!user) return [];
  return state.tareas.filter(tarea => tarea.usuario_id === user.id);
}

function selectedTarea() {
  const tareas = visibleTareas();
  if (!tareas.length) {
    state.selectedTareaId = "";
    return null;
  }
  if (!tareas.some(tarea => tarea.id === state.selectedTareaId)) {
    state.selectedTareaId = tareas[0].id;
  }
  return tareas.find(tarea => tarea.id === state.selectedTareaId) || tareas[0];
}

function tareasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.tareasFiltro, ["actividad", "descripcion", "equipo_texto", "asignado_nombre"], "asignado_nombre");
  return ordenarPorFecha(filtradas, state.tareasFiltro.orden, ["fecha_envio", "created_at"]);
}

function actualizarFiltroTareas(campo, valor) {
  state.tareasFiltro[campo] = valor;
  renderModules();
}

function seleccionarTarea(id) {
  state.selectedTareaId = id;
  abrirModal(renderPanelCierre());
}

async function eliminarTarea(id) {
  if (!isSupervisorMode()) return;
  if (!window.confirm("¿Eliminar esta asignación? No se puede deshacer.")) return;

  const { data, error } = await sb.from(cfg.tables.tareas).delete().eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 30).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar: ${error.message}`, "error");
    return;
  }

  await loadTareas();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante("Asignación eliminada.", "ok");
}

function renderPanelCierre() {
  const t = selectedTarea();
  if (!t) {
    return `<div class="empty-state">Selecciona una tarea para preparar o revisar su cierre.</div>`;
  }
  const fotoCierreHtml = t.cierre_foto_data_url ? `
    <div class="detail-photos">
      <img src="${escapeHtml(t.cierre_foto_data_url)}" alt="${escapeHtml(t.cierre_foto_nombre || "Foto de cierre")}" onclick="window.open(this.src, '_blank')">
    </div>
  ` : "";
  const equipo = equipoDeTexto(t.equipo_texto);
  const revisionStatus = String(t.revision_status || t.status || "").toLowerCase();
  const tareaAprobada = revisionStatus.includes("aprobado") || String(t.status || "").includes("cerrada_aprobada");
  const tareaRechazada = revisionStatus.includes("rechazado") || String(t.status || "").includes("rechazada");
  return `
    <div class="panel-head compact-head">
      <h3>${escapeHtml(t.actividad || t.descripcion || "Actividad")}</h3>
      ${pillEstado(t.revision_status || t.status)}
    </div>
    <div class="detail-grid">
      ${campoDetalle("Equipo", t.equipo_texto || "Sin equipo")}
      ${campoDetalle("Área", equipo?.area || "-")}
      ${campoDetalle("Prioridad", t.prioridad || "Normal")}
      ${campoDetalle("Técnico asignado", t.asignado_nombre || "Sin asignar")}
      ${campoDetalle("Fecha de envío", [t.fecha_envio, t.hora_envio].filter(Boolean).join(" "))}
      ${campoDetalle("Fecha límite", t.fecha_limite || "Sin límite")}
      ${campoDetalle("Revisado por", t.revisado_por_nombre || "Pendiente")}
      ${campoDetalle("Cerrado por", t.cerrado_por_nombre || "-")}
    </div>
    ${t.comentario ? `
      <div class="detail-section-title">📋 Instrucciones al técnico</div>
      <div class="detail-text">${escapeHtml(t.comentario)}</div>
    ` : ""}
    ${isSupervisorMode() ? `
      <div class="detail-section-title">✅ Qué reportó el técnico</div>
      <div class="detail-text">${escapeHtml(t.cierre_comentario || "Aún no hay comentario de cierre.")}</div>
      ${t.cierre_evidencia ? `<div class="detail-section-title">🗂 Evidencia enviada</div><div class="detail-text">${escapeHtml(t.cierre_evidencia)}</div>` : ""}
      ${fotoCierreHtml}
      ${!t.cierre_comentario && !t.cierre_evidencia && !fotoCierreHtml ? `<div class="empty-state small">Aún no hay foto adjunta en este cierre.</div>` : ""}
      ${t.revisado_at ? `<div class="detail-section-title">🕓 Última revisión</div><div class="detail-text">${escapeHtml(t.revision_status || "revisado")}${t.revision_comentario ? ` — ${escapeHtml(t.revision_comentario)}` : ""}</div>` : ""}
      <div class="detail-section-title">Comentario de revisión</div>
      <div class="form-preview"><textarea id="revision-comentario" placeholder="Opcional al autorizar. Obligatorio si rechazas.">${escapeHtml(t.revision_comentario || "")}</textarea></div>
      <div class="modal-actions">
        <button class="ghost-action" onclick="cerrarModal()">Cerrar</button>
        <button class="reject-action" onclick="eliminarTarea('${escapeHtml(t.id)}')" title="Eliminar por completo">🗑 Eliminar</button>
        <button class="reject-action" onclick="revisarCierreTarea('rechazado')">✕ Rechazar</button>
        <button class="approve-action" onclick="revisarCierreTarea('aprobado')">✓ Autorizar</button>
      </div>
    ` : `
      ${tareaRechazada ? `
        <div class="detail-section-title">⚠️ Corrección solicitada</div>
        <div class="detail-text">${escapeHtml(t.revision_comentario || "Supervisor rechazó el cierre. Corrige la evidencia y reenvía.")}</div>
      ` : ""}
      ${tareaAprobada ? `
        <div class="detail-section-title">✅ Cierre autorizado</div>
        <div class="detail-text">${escapeHtml(t.revision_comentario || "Supervisor autorizó este cierre.")}</div>
        ${t.cierre_comentario ? `<div class="detail-section-title">Qué hiciste</div><div class="detail-text">${escapeHtml(t.cierre_comentario)}</div>` : ""}
        ${t.cierre_evidencia ? `<div class="detail-section-title">Evidencia</div><div class="detail-text">${escapeHtml(t.cierre_evidencia)}</div>` : ""}
        ${fotoCierreHtml}
        <div class="modal-actions"><button class="ghost-action" onclick="cerrarModal()">Cerrar</button></div>
      ` : `
        <div class="form-preview">
          <label>Qué hiciste<textarea id="cierre-comentario" placeholder="Ej: Se lubricó equipo, se revisó nivel, se corrigió condición encontrada...">${escapeHtml(t.cierre_comentario || "")}</textarea></label>
          <label>Evidencia o referencia<textarea id="cierre-evidencia" placeholder="Pega liga de foto, folio, observación de evidencia o referencia temporal...">${escapeHtml(t.cierre_evidencia || "")}</textarea></label>
          <label>Adjuntar foto<input id="cierre-foto" type="file" accept="image/*" onchange="previewCierreFoto(this)"></label>
          <div id="cierre-foto-preview">${fotoCierreHtml}</div>
        </div>
        <div class="modal-actions">
          <button class="ghost-action" onclick="cerrarModal()">Cerrar</button>
          <button class="approve-action" onclick="guardarCierreTarea()">${tareaRechazada ? "Reenviar" : "Enviar"}</button>
        </div>
      `}
    `}`;
}

async function previewCierreFoto(input) {
  const preview = $("cierre-foto-preview");
  const file = input?.files?.[0];
  if (!preview || !file) return;

  if (!file.type.startsWith("image/")) {
    preview.innerHTML = `<div class="empty-state small">Selecciona una imagen válida.</div>`;
    return;
  }

  if (file.size > 2500000) {
    preview.innerHTML = `<div class="empty-state small">Para esta prueba usa una foto menor a 2.5 MB.</div>`;
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  preview.innerHTML = `
    <div class="closure-photo">
      <img src="${escapeHtml(dataUrl)}" alt="Vista previa de cierre">
      <small>${escapeHtml(file.name)}</small>
    </div>
  `;
}

async function guardarCierreTarea() {
  const tarea = selectedTarea();
  const user = activeUser();
  const cierreComentario = $("cierre-comentario")?.value.trim();
  const cierreEvidencia = $("cierre-evidencia")?.value.trim();
  const fotoInput = $("cierre-foto");
  const foto = fotoInput?.files?.[0];

  if (!tarea) {
    setStatus("Selecciona una tarea antes de preparar cierre.", "warn");
    return;
  }

  if (isSupervisorMode()) {
    setStatus("Cambia a rol técnico/eléctrico/contratista para enviar cierre.", "warn");
    return;
  }

  if (foto && !foto.type.startsWith("image/")) {
    setStatus("Selecciona una imagen válida para la evidencia.", "warn");
    mostrarAvisoFlotante("Selecciona una imagen válida para la evidencia.", "error");
    return;
  }

  if (foto && foto.size > 2500000) {
    setStatus("Para esta prueba usa una foto menor a 2.5 MB.", "warn");
    mostrarAvisoFlotante("La foto debe pesar menos de 2.5 MB.", "error");
    return;
  }

  if (!cierreComentario && !cierreEvidencia && !foto && !tarea.cierre_foto_data_url) {
    setStatus("Escribe comentario o adjunta foto antes de enviar el cierre.", "warn");
    mostrarAvisoFlotante("Escribe qué hiciste o adjunta una foto antes de enviar.", "error");
    return;
  }

  setStatus("Enviando cierre de tarea...");
  let fotoDataUrl = tarea.cierre_foto_data_url || null;
  let fotoNombre = tarea.cierre_foto_nombre || null;
  let fotoTipo = tarea.cierre_foto_tipo || null;

  if (foto) {
    fotoDataUrl = await fileToDataUrl(foto);
    fotoNombre = foto.name;
    fotoTipo = foto.type;
  }

  const { error } = await sb
    .from(cfg.tables.tareas)
    .update({
      cierre_comentario: cierreComentario || null,
      cierre_evidencia: cierreEvidencia || null,
      cierre_foto_nombre: fotoNombre,
      cierre_foto_tipo: fotoTipo,
      cierre_foto_data_url: fotoDataUrl,
      cerrado_por_id: user?.id || tarea.usuario_id || null,
      cerrado_por_nombre: user?.nombre || tarea.asignado_nombre || null,
      fecha_cierre: new Date().toISOString(),
      revision_status: "pendiente_revision",
      revision_comentario: null,
      revisado_por_id: null,
      revisado_por_nombre: null,
      revisado_at: null,
      status: "pendiente_revision",
      updated_at: new Date().toISOString()
    })
    .eq("id", tarea.id)
    .eq("empresa_id", state.empresaId);

  if (error) {
    setStatus(`Supabase no dejó guardar el cierre: ${error.message}. Corre el Paso 10B si aún no lo has corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo enviar la actividad: ${error.message}`, "error");
    return;
  }

  await loadTareas();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante("Actividad enviada. Supervisor ya puede revisarla en Asignaciones.", "ok");
}

async function revisarCierreTarea(decision) {
  const tarea = selectedTarea();
  const comentario = $("revision-comentario")?.value.trim();
  const aprobada = decision === "aprobado";

  if (!tarea) {
    setStatus("Selecciona una tarea antes de revisar el cierre.", "warn");
    return;
  }

  if (!isSupervisorMode()) {
    setStatus("Solo supervisor/admin puede aprobar o rechazar cierres.", "warn");
    return;
  }

  if (!tarea.cierre_comentario && !tarea.cierre_evidencia && !tarea.cierre_foto_data_url) {
    setStatus("Esta tarea aún no tiene cierre enviado por el técnico.", "warn");
    mostrarAvisoFlotante("Esta tarea aún no tiene cierre enviado por el técnico.", "error");
    return;
  }

  if (!aprobada && !comentario) {
    setStatus("Escribe el motivo antes de rechazar el cierre.", "warn");
    mostrarAvisoFlotante("Escribe el motivo antes de rechazar.", "error");
    return;
  }

  setStatus(aprobada ? "Aprobando cierre..." : "Rechazando cierre...");
  const { error } = await sb
    .from(cfg.tables.tareas)
    .update({
      revision_status: aprobada ? "aprobado" : "rechazado",
      revision_comentario: comentario || null,
      revisado_por_nombre: "Supervisor/Admin",
      revisado_at: new Date().toISOString(),
      status: aprobada ? "cerrada_aprobada" : "rechazada",
      updated_at: new Date().toISOString()
    })
    .eq("id", tarea.id)
    .eq("empresa_id", state.empresaId);

  if (error) {
    setStatus(`Supabase no dejó guardar la revisión: ${error.message}. Revisa que el Paso 10 esté corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo guardar la revisión: ${error.message}`, "error");
    return;
  }

  await loadTareas();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante(aprobada ? "Actividad aprobada." : "Actividad rechazada.", aprobada ? "ok" : "error");
}
