// ============================================================
// ACTIVIDADES EXTRA — trabajo no programado que reporta un técnico
// (descripción, evidencia, horas) y que un supervisor autoriza o
// rechaza.
// ============================================================
// Quinto módulo separado de app.js (los primeros fueron raci.js,
// lubricantes.js, cartas.js y equipos.js), mismo patrón: movimiento
// de código, no reescritura. Depende de utilidades compartidas que
// siguen en app.js ($, escapeHtml, mostrarAvisoFlotante,
// isSupervisorMode, activeUser, fileToDataUrl, horasEntre,
// campoDetalle, equipoDeTexto, pillEstado, displayExtraUser,
// displayExtraPhotoData, displayExtraPhotoName, selectedExtra,
// abrirModal, cerrarModal, loadActividades, sb, cfg, state,
// renderModules) — por eso este archivo se carga ANTES que app.js
// en index.html.

function toggleExtraFormSupervisor() {
  state.extraFormSupervisorAbierto = !state.extraFormSupervisorAbierto;
  renderModules();
}

async function guardarActividadExtra() {
  const esSupervisor = isSupervisorMode();
  // Un supervisor que reporta su propia actividad usa su perfil real
  // de la sesion (state.authPerfil), no el selector de "usuario de
  // prueba" que normalmente queda vacio para supervisores.
  const user = esSupervisor ? (state.authPerfil || activeUser()) : activeUser();
  const descripcion = $("extra-descripcion")?.value.trim();
  const equipoTexto = $("extra-equipo")?.value.trim();
  const horaInicio = $("extra-hora-inicio")?.value;
  const horaFin = $("extra-hora-fin")?.value;
  const comentario = $("extra-comentario")?.value.trim();
  const evidenciaTexto = $("extra-evidencia")?.value.trim();
  const foto = $("extra-foto")?.files?.[0];

  if (!user) {
    const mensaje = esSupervisor
      ? "No se encontró tu perfil de sesión. Vuelve a iniciar sesión e intenta de nuevo."
      : "Selecciona un usuario de prueba antes de guardar la actividad extra.";
    setStatus(mensaje, "warn");
    mostrarAvisoFlotante(mensaje, "error");
    return;
  }

  if (!descripcion || !equipoTexto) {
    setStatus("Escribe actividad y equipo/área antes de guardar.", "warn");
    mostrarAvisoFlotante("Escribe la actividad y el equipo/área antes de enviar.", "error");
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

  setStatus("Guardando actividad extra...");
  let fotoDataUrl = null;
  let fotoNombre = null;
  let fotoTipo = null;
  if (foto) {
    fotoDataUrl = await fileToDataUrl(foto);
    fotoNombre = foto.name;
    fotoTipo = foto.type;
  }

  const equipoRelacionado = state.equipos.find(e => {
    const tag = String(e.id_tag || "").toUpperCase();
    const nombre = String(e.nombre_equipo || "").toUpperCase();
    const texto = equipoTexto.toUpperCase();
    return tag === texto || nombre === texto || texto.includes(tag);
  });

  // Cuando un supervisor reporta su PROPIA actividad, no tiene
  // sentido que quede pendiente de que el mismo supervisor la
  // apruebe - queda aprobada directo, con los mismos campos que deja
  // revisarActividadExtra() al aprobar algo.
  const ahora = new Date().toISOString();
  const payload = {
    empresa_id: state.empresaId,
    equipo_id: equipoRelacionado?.id || null,
    equipo_texto: equipoTexto,
    tipo: "extra",
    descripcion,
    hora_inicio: horaInicio || null,
    hora_fin: horaFin || null,
    horas_hombre: horasEntre(horaInicio, horaFin),
    comentario,
    status: esSupervisor ? "extra_aprobada" : "pendiente_revision",
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    usuario_id: user?.id || null,
    usuario_nombre: user?.nombre || null,
    usuario: user?.nombre || null,
    usuario_rol: user?.rol || state.sessionRole,
    evidencia_texto: evidenciaTexto || null,
    evidencia_foto_nombre: fotoNombre,
    evidencia_foto_tipo: fotoTipo,
    evidencia_foto_data_url: fotoDataUrl
  };
  if (esSupervisor) {
    payload.revision_status = "aprobado";
    payload.revision_comentario = "Registrada directo por el supervisor.";
    payload.revisado_por_nombre = user?.nombre || "Supervisor";
    payload.revisado_at = ahora;
  }

  const { error } = await sb
    .from(cfg.tables.actividades)
    .insert(payload);

  if (error) {
    setStatus(`Supabase no dejó guardar actividad extra: ${error.message}. Corre el Paso 11 si aún no lo has corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo enviar la actividad: ${error.message}`, "error");
    return;
  }

  await loadActividades();
  state.extraFormSupervisorAbierto = false;
  renderModules();
  mostrarAvisoFlotante(esSupervisor ? "Actividad registrada y aprobada." : "Actividad enviada a revisión.", "ok");
  const form = $("extra-descripcion");
  if (form) {
    ["extra-descripcion", "extra-equipo", "extra-hora-inicio", "extra-hora-fin", "extra-comentario", "extra-evidencia"].forEach(campo => {
      if ($(campo)) $(campo).value = "";
    });
    if ($("extra-foto")) $("extra-foto").value = "";
    if ($("extra-foto-preview")) $("extra-foto-preview").innerHTML = "";
  }
}

function seleccionarExtra(id) {
  state.selectedExtraId = id;
  abrirModal(renderPanelExtra());
}

async function corregirActividadExtra() {
  const extra = selectedExtra();
  if (!extra) return;

  const comentario = $("extra-fix-comentario")?.value.trim();
  const evidenciaTexto = $("extra-fix-evidencia")?.value.trim();
  const fotoInput = $("extra-fix-foto");
  const foto = fotoInput?.files?.[0];

  if (foto && !foto.type.startsWith("image/")) {
    mostrarAvisoFlotante("Selecciona una imagen válida para la evidencia.", "error");
    return;
  }

  if (foto && foto.size > 2500000) {
    mostrarAvisoFlotante("La foto debe pesar menos de 2.5 MB.", "error");
    return;
  }

  if (!comentario && !evidenciaTexto && !foto && !extra.evidencia_foto_data_url) {
    mostrarAvisoFlotante("Escribe qué corregiste o adjunta una foto antes de reenviar.", "error");
    return;
  }

  let fotoDataUrl = extra.evidencia_foto_data_url || null;
  let fotoNombre = extra.evidencia_foto_nombre || null;
  let fotoTipo = extra.evidencia_foto_tipo || null;
  if (foto) {
    fotoDataUrl = await fileToDataUrl(foto);
    fotoNombre = foto.name;
    fotoTipo = foto.type;
  }

  const { error } = await sb
    .from(cfg.tables.actividades)
    .update({
      comentario: comentario || extra.comentario || null,
      evidencia_texto: evidenciaTexto || extra.evidencia_texto || null,
      evidencia_foto_nombre: fotoNombre,
      evidencia_foto_tipo: fotoTipo,
      evidencia_foto_data_url: fotoDataUrl,
      status: "pendiente_revision",
      revision_status: null,
      revision_comentario: null,
      revisado_por_nombre: null,
      revisado_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", extra.id)
    .eq("empresa_id", state.empresaId);

  if (error) {
    mostrarAvisoFlotante(`No se pudo reenviar la actividad: ${error.message}`, "error");
    return;
  }

  await loadActividades();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante("Actividad corregida y reenviada a revisión.", "ok");
}

async function revisarActividadExtra(decision) {
  const extra = selectedExtra();
  const comentario = $("extra-revision-comentario")?.value.trim();
  const aprobada = decision === "aprobado";

  if (!extra) {
    setStatus("Selecciona una actividad extra para revisar.", "warn");
    return;
  }

  if (!isSupervisorMode()) {
    setStatus("Solo supervisor/admin puede revisar actividades extra.", "warn");
    return;
  }

  if (!aprobada && !comentario) {
    setStatus("Escribe el motivo antes de rechazar la actividad extra.", "warn");
    mostrarAvisoFlotante("Escribe el motivo antes de rechazar.", "error");
    return;
  }

  setStatus(aprobada ? "Aprobando actividad extra..." : "Rechazando actividad extra...");
  const { error } = await sb
    .from(cfg.tables.actividades)
    .update({
      revision_status: aprobada ? "aprobado" : "rechazado",
      revision_comentario: comentario || null,
      revisado_por_nombre: "Supervisor/Admin",
      revisado_at: new Date().toISOString(),
      status: aprobada ? "extra_aprobada" : "extra_rechazada",
      updated_at: new Date().toISOString()
    })
    .eq("id", extra.id)
    .eq("empresa_id", state.empresaId);

  if (error) {
    setStatus(`Supabase no dejó guardar la revisión extra: ${error.message}. Corre el Paso 11B si aún no lo has corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo guardar la revisión: ${error.message}`, "error");
    return;
  }

  await loadActividades();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante(aprobada ? "Actividad aprobada." : "Actividad rechazada.", aprobada ? "ok" : "error");
}

async function eliminarActividadExtra(id) {
  if (!isSupervisorMode()) return;
  if (!window.confirm("¿Eliminar esta actividad extra? No se puede deshacer.")) return;

  const { data, error } = await sb.from(cfg.tables.actividades).delete().eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 30).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar: ${error.message}`, "error");
    return;
  }

  await loadActividades();
  renderModules();
  cerrarModal();
  mostrarAvisoFlotante("Actividad extra eliminada.", "ok");
}

function renderPanelExtra() {
  const e = selectedExtra();
  if (!e) {
    return `<div class="empty-state">Selecciona una actividad extra para ver el detalle.</div>`;
  }
  const equipo = equipoDeTexto(e.equipo_texto);
  const usuario = displayExtraUser(e) || "Sin técnico";
  const fotoData = displayExtraPhotoData(e);
  const fotoHtml = fotoData ? `
    <div class="detail-photos">
      <img src="${escapeHtml(fotoData)}" alt="${escapeHtml(displayExtraPhotoName(e))}" onclick="window.open(this.src, '_blank')">
    </div>
  ` : "";
  const estadoActual = String(e.revision_status || e.status || "").toLowerCase();
  const rechazada = estadoActual.includes("rechaz");
  const aprobada = estadoActual.includes("aprobad");
  const camposComunes = `
    <div class="detail-grid">
      ${campoDetalle("Equipo", e.equipo_texto || "Sin equipo")}
      ${campoDetalle("Área", equipo?.area || "-")}
      ${campoDetalle("Técnico", usuario)}
      ${campoDetalle("Fecha", [e.fecha, e.hora].filter(Boolean).join(" ") || "Sin fecha")}
      ${campoDetalle("Horas", e.horas_hombre ? `${e.horas_hombre} h` : "-")}
      ${campoDetalle("Revisado por", e.revisado_por_nombre || "Pendiente")}
    </div>`;
  if (!isSupervisorMode()) {
    return `
      <div class="panel-head compact-head">
        <h3>${escapeHtml(e.descripcion || "Actividad extra")}</h3>
        ${pillEstado(e.revision_status || e.status)}
      </div>
      ${camposComunes}
      <div class="detail-section-title">✅ Qué se hizo</div>
      <div class="detail-text">${escapeHtml(e.comentario || "Sin comentario.")}</div>
      ${e.evidencia_texto ? `<div class="detail-section-title">🗂 Evidencia</div><div class="detail-text">${escapeHtml(e.evidencia_texto)}</div>` : ""}
      ${fotoHtml || `<div class="empty-state small">Sin foto adjunta.</div>`}
      ${rechazada ? `
        <div class="detail-section-title">⚠️ Corrección solicitada</div>
        <div class="detail-text">${escapeHtml(e.revision_comentario || "Supervisor rechazó esta actividad. Corrige y reenvía.")}</div>
        <div class="form-preview">
          <label>Corrige qué hiciste<textarea id="extra-fix-comentario" placeholder="Corrige o completa el comentario..."></textarea></label>
          <label>Corrige la evidencia<textarea id="extra-fix-evidencia" placeholder="Corrige o completa la evidencia..."></textarea></label>
          <label>Reemplazar foto<input id="extra-fix-foto" type="file" accept="image/*" onchange="previewExtraFixFoto(this)"></label>
          <div id="extra-fix-foto-preview"></div>
        </div>
        <div class="modal-actions">
          <button class="ghost-action" onclick="cerrarModal()">Cerrar</button>
          <button class="approve-action" onclick="corregirActividadExtra()">Reenviar</button>
        </div>
      ` : `
        ${aprobada ? `<div class="detail-section-title">✅ Autorizada</div><div class="detail-text">${escapeHtml(e.revision_comentario || "Supervisor autorizó esta actividad.")}</div>` : ""}
        <div class="modal-actions"><button class="ghost-action" onclick="cerrarModal()">Cerrar</button></div>
      `}`;
  }
  return `
    <div class="panel-head compact-head">
      <h3>${escapeHtml(e.descripcion || "Actividad extra")}</h3>
      ${pillEstado(e.revision_status || e.status)}
    </div>
    ${camposComunes}
    <div class="detail-section-title">✅ Qué reportó el técnico</div>
    <div class="detail-text">${escapeHtml(e.comentario || "Sin comentario.")}</div>
    ${e.evidencia_texto ? `<div class="detail-section-title">🗂 Evidencia enviada</div><div class="detail-text">${escapeHtml(e.evidencia_texto)}</div>` : ""}
    ${fotoHtml || `<div class="empty-state small">Aún no hay foto adjunta en esta actividad extra.</div>`}
    ${e.revisado_at ? `<div class="detail-section-title">🕓 Última revisión</div><div class="detail-text">${escapeHtml(e.revision_status || "revisado")}${e.revision_comentario ? ` — ${escapeHtml(e.revision_comentario)}` : ""}</div>` : ""}
    <div class="detail-section-title">Comentario de revisión</div>
    <div class="form-preview"><textarea id="extra-revision-comentario" placeholder="Opcional al autorizar. Obligatorio si rechazas.">${escapeHtml(e.revision_comentario || "")}</textarea></div>
    <div class="modal-actions">
      <button class="ghost-action" onclick="cerrarModal()">Cerrar</button>
      <button class="reject-action" onclick="eliminarActividadExtra('${escapeHtml(e.id)}')" title="Eliminar por completo">🗑 Eliminar</button>
      <button class="reject-action" onclick="revisarActividadExtra('rechazado')">✕ Rechazar</button>
      <button class="approve-action" onclick="revisarActividadExtra('aprobado')">✓ Autorizar</button>
    </div>`;
}
