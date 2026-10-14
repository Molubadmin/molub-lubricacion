// ============================================================
// EQUIPOS — catálogo de equipos, sus fotos, el levantamiento
// (Ingresar a planta) y las utilidades de fotos que comparten
// Equipos y Cartas (fotosPuntosDeEquipo, fotoPuntoCartaRow,
// autoCartaFromEquipo, etc.)
// ============================================================
// Cuarto módulo separado de app.js (los primeros fueron raci.js,
// lubricantes.js y cartas.js), mismo patrón: movimiento de código,
// no reescritura. Nota: renderDashboard() se queda en app.js a
// propósito — es un módulo aparte (Dashboard), no de Equipos, solo
// estaba físicamente entre estos dos bloques.
// Depende de utilidades compartidas que siguen en app.js ($,
// escapeHtml, firstValue, mostrarAvisoFlotante, isSupervisorMode,
// activeUser, fileToDataUrl, withSignedFotoUrl, abrirModal,
// cerrarModal, groupByArea, moduleEnabled, sb, cfg, state,
// render, renderModules, setView) y de funciones de cartas.js
// (cartaForEquipo, cartaFoto, cartaPuntoFoto, cartaTag,
// elementosForCarta, seleccionarCarta, cargarFotosDeElementosCarta)
// — por eso este archivo se carga ANTES que app.js, y DESPUÉS de
// cartas.js, en index.html.

async function loadFotoCounts() {
  state.fotoCounts = {};
  state.fotosEmpresa = [];
  if (!cfg.tables.fotos || !state.empresaId) return;

  // Nota: esto se ejecuta en cada recarga de equipos (loadEquipos la
  // llama seguido). Aqui solo hace falta contar fotos por equipo y
  // saber su tipo/categoria para las listas; el contenido real de la
  // foto (columna "url", que guarda la imagen en base64) pesa mucho
  // y solo se necesita al abrir un equipo o una carta en detalle. Por
  // eso NO se pide con select("*") - esto era la causa principal del
  // consumo alto de egress en Supabase.
  const { data, error } = await sb
    .from(cfg.tables.fotos)
    .select("id,empresa_id,equipo_id,tipo,categoria,created_at")
    .eq("empresa_id", state.empresaId)
    .limit(2000);

  if (error) {
    console.warn("No se pudo contar fotos:", error.message);
    return;
  }

  const conteo = {};
  (data || []).forEach(row => {
    if (!row.equipo_id) return;
    conteo[row.equipo_id] = (conteo[row.equipo_id] || 0) + 1;
  });
  state.fotosEmpresa = data || [];
  state.fotoCounts = conteo;
}

async function cargarFotosDeEquipoConUrl(equipoId) {
  if (!equipoId || !cfg.tables.fotos) return;
  const yaCompletas = (state.fotosEmpresa || []).some(f => String(f.equipo_id) === String(equipoId) && f.__urlCargada);
  if (yaCompletas) return;
  const { data, error } = await sb
    .from(cfg.tables.fotos)
    .select("id,empresa_id,equipo_id,usuario_id,tipo,categoria,url,storage_path,file_name,mime_type,created_at")
    .eq("empresa_id", state.empresaId)
    .eq("equipo_id", equipoId);
  if (error) {
    console.warn("No se pudieron cargar las fotos de este equipo:", error.message);
    return;
  }
  const completas = await Promise.all((data || []).map(async row => ({ ...(await withSignedFotoUrl(row)), __urlCargada: true })));
  state.fotosEmpresa = [
    ...(state.fotosEmpresa || []).filter(f => String(f.equipo_id) !== String(equipoId)),
    ...completas
  ];
}

function selectedEquipo() {
  return state.equipos.find(e => e.id === state.selectedEquipoId) || state.equipos[0];
}

function fotoSrc(foto) {
  return firstValue(foto, ["signed_url", "signedUrl", "url", "urlFoto", "foto_url", "publicUrl", "downloadUrl"]);
}

function fotoTipo(foto) {
  return String(firstValue(foto, ["tipo", "categoria", "subtipo"], "")).toLowerCase();
}

function fotosEmpresaDeEquipo(equipoId) {
  if (!equipoId) return [];
  return (state.fotosEmpresa || [])
    .filter(foto => String(foto.equipo_id || "") === String(equipoId))
    .sort((a, b) => String(firstValue(a, ["created_at", "fecha"], "")).localeCompare(String(firstValue(b, ["created_at", "fecha"], ""))));
}

function esFotoEquipo(foto) {
  const tipo = fotoTipo(foto);
  return tipo.includes("foto_equipo") || tipo.includes("equipo") || tipo.includes("completa") || tipo.includes("general");
}

function esFotoPuntoLubricacion(foto) {
  const tipo = fotoTipo(foto);
  return tipo.includes("punto") || tipo.includes("lubricacion");
}

function fotosPuntosDeEquipo(equipoId) {
  return fotosEmpresaDeEquipo(equipoId).filter(foto => !esFotoEquipo(foto) && esFotoPuntoLubricacion(foto));
}

function etiquetaFotoPunto(foto, index) {
  const tipo = fotoTipo(foto);
  if (tipo.includes("placa")) return "Placa";
  if (tipo.includes("referencia")) return "Referencia";
  if (tipo.includes("punto") || tipo.includes("lubricacion")) return `Punto ${index + 1}`;
  return `Punto ${index + 1}`;
}

function fotoPuntoCartaRow(foto, index, equipoId) {
  const src = fotoSrc(foto);
  return {
    id: `foto-${foto?.id || index}`,
    equipo_id: equipoId,
    orden: index + 1,
    npunto: index + 1,
    elemento: etiquetaFotoPunto(foto, index),
    descripcion: firstValue(foto, ["descripcion", "comentario"], ""),
    lubricante: "",
    signed_url: src,
    foto_url: src,
    file_name: firstValue(foto, ["file_name", "storage_path"], ""),
    __fotoLevantamiento: true
  };
}

function autoCartaFromEquipo(equipo) {
  const fotos = fotosEmpresaDeEquipo(equipo?.id);
  const primera = fotos[0];
  return {
    id: `auto-${equipo.id}`,
    empresa_id: equipo.empresa_id || state.empresaId,
    equipo_id: equipo.id,
    id_tag: equipo.id_tag,
    nombre_equipo: equipo.nombre_equipo,
    area: equipo.area,
    proceso: equipo.proceso,
    criticidad: equipo.criticidad,
    sistema: equipo.sistema,
    status: "pendiente",
    created_at: firstValue(primera, ["created_at", "fecha"], ""),
    __autoCarta: true
  };
}

function fotosLevantamientoParaEquipo(equipo) {
  const fotosDirectas = state.fotos || [];
  if (fotosDirectas.length || !equipo) return fotosDirectas;
  const carta = cartaForEquipo(equipo.id) || state.cartas.find(row => cartaTag(row).toLowerCase() === String(equipo.id_tag || "").toLowerCase());
  if (!carta) return [];
  const fallback = [];
  const fotoEquipo = cartaFoto(carta, equipo);
  if (fotoEquipo) {
    fallback.push({
      id: `carta-${carta.id}-equipo`,
      categoria: "Foto equipo",
      file_name: "Foto de la carta de lubricación",
      url: fotoEquipo
    });
  }
  elementosForCarta(carta, equipo).forEach((elemento, index) => {
    const src = cartaPuntoFoto(elemento);
    if (!src) return;
    fallback.push({
      id: `carta-${carta.id}-punto-${index}`,
      categoria: `Punto ${firstValue(elemento, ["npunto", "orden"], index + 1)}`,
      file_name: firstValue(elemento, ["nombre", "elemento", "descripcion"], "Foto de punto"),
      url: src
    });
  });
  return fallback;
}

async function loadLevantamientoForSelectedEquipo() {
  const equipo = selectedEquipo();
  state.levantamiento = null;
  state.fotos = [];
  if (!equipo || !cfg.tables.levantamientos || !cfg.tables.fotos) return;

  state.levantamientoLoading = true;
  renderModules();
  try {
    const levantamientoQuery = sb
      .from(cfg.tables.levantamientos)
      .select("*")
      .eq("empresa_id", state.empresaId)
      .eq("equipo_id", equipo.id)
      .limit(1);

    const fotosQuery = sb
      .from(cfg.tables.fotos)
      .select("id,empresa_id,equipo_id,usuario_id,tipo,categoria,url,storage_path,file_name,mime_type,created_at")
      .eq("empresa_id", state.empresaId)
      .eq("equipo_id", equipo.id)
      .order("created_at", { ascending: false });

    const [levantamientoResult, fotosResult] = await Promise.all([levantamientoQuery, fotosQuery]);
    if (levantamientoResult.error) throw levantamientoResult.error;
    if (fotosResult.error) throw fotosResult.error;

    state.levantamiento = levantamientoResult.data?.[0] || null;
    state.fotos = await Promise.all((fotosResult.data || []).map(withSignedFotoUrl));
    if (!state.fotos.length) {
      // Este equipo no tiene fotos propias todavia; la galeria cae
      // en mostrar las fotos de su carta guardada (si tiene). Nos
      // aseguramos de tener esas fotos completas para que no salgan
      // rotas.
      const carta = cartaForEquipo(equipo.id);
      await Promise.all([
        cargarFotosDeEquipoConUrl(equipo.id),
        cargarFotosDeElementosCarta(carta?.id, equipo.id)
      ]);
    }
  } catch (err) {
    console.warn("No se pudo cargar levantamiento/fotos:", err.message);
    setStatus(`No se pudo leer levantamiento/fotos: ${err.message}`, "warn");
  } finally {
    state.levantamientoLoading = false;
    renderModules();
  }
}

async function guardarFotoLevantamiento() {
  const equipo = selectedEquipo();
  const fotoCamara = $("levantamiento-foto-camara")?.files?.[0];
  const fotoArchivo = $("levantamiento-foto-archivo")?.files?.[0];
  const file = fotoCamara || fotoArchivo || $("levantamiento-foto")?.files?.[0];
  const categoria = $("levantamiento-categoria")?.value || "foto_equipo";
  if (!equipo) return setStatus("Selecciona un equipo antes de guardar fotos.", "warn");
  if (!file) return setStatus("Primero elige o toma una foto.", "warn");
  if (!cfg.tables.fotos) return setStatus("No esta configurada la tabla de fotos.", "error");

  try {
    setStatus("Guardando foto de levantamiento...", "warn");
    const dataUrl = await fileToDataUrl(file);
    const user = activeUser();
    const { error: fotoError } = await sb.from(cfg.tables.fotos).insert({
      empresa_id: state.empresaId,
      equipo_id: equipo.id,
      usuario_id: user?.id || null,
      tipo: categoria,
      categoria,
      url: dataUrl,
      file_name: file.name,
      mime_type: file.type || "image/jpeg"
    });
    if (fotoError) throw fotoError;

    if (cfg.tables.levantamientos) {
      const base = {
        empresa_id: state.empresaId,
        equipo_id: equipo.id,
        usuario_id: user?.id || null,
        descripcion: state.levantamiento?.descripcion || "",
        completo: false,
        updated_at: new Date().toISOString()
      };
      const existente = state.levantamiento?.id;
      const query = existente
        ? sb.from(cfg.tables.levantamientos).update(base).eq("id", existente)
        : sb.from(cfg.tables.levantamientos).insert(base);
      const { error: levError } = await query;
      if (levError) console.warn("No se pudo actualizar levantamiento:", levError.message);
    }

    ["levantamiento-foto", "levantamiento-foto-camara", "levantamiento-foto-archivo"].forEach((id) => {
      const input = $(id);
      if (input) input.value = "";
    });
    await loadFotoCounts();
    await loadLevantamientoForSelectedEquipo();
    renderEquipos();
    setStatus("Foto de levantamiento guardada.", "");
    const etiquetaEquipo = equipo.id_tag || equipo.nombre_equipo;
    mostrarAvisoFlotante(
      cartaForEquipo(equipo.id)
        ? `Foto de levantamiento guardada correctamente (${escapeHtml(etiquetaEquipo)}).`
        : `Foto de levantamiento guardada. La carta de ${escapeHtml(etiquetaEquipo)} sigue Pendiente hasta que la llenes y le des "Guardar carta".`,
      "ok"
    );
  } catch (err) {
    console.warn("No se pudo guardar foto:", err.message);
    setStatus(`No se pudo guardar foto: ${err.message}`, "error");
  }
}

async function eliminarFotoLevantamiento(fotoId) {
  const equipo = selectedEquipo();
  if (!fotoId || !equipo) {
    setStatus("Selecciona una foto de levantamiento válida.", "warn");
    return;
  }
  if (!cfg.tables.fotos) {
    setStatus("No está configurada la tabla de fotos.", "error");
    return;
  }
  if (!window.confirm("¿Deseas eliminar la foto?")) return;

  try {
    setStatus("Eliminando foto de levantamiento...", "warn");
    const foto = (state.fotos || []).find(item => String(item.id) === String(fotoId));
    const { error } = await sb
      .from(cfg.tables.fotos)
      .delete()
      .eq("id", fotoId)
      .eq("empresa_id", state.empresaId)
      .eq("equipo_id", equipo.id);
    if (error) throw error;

    if (state.photoUrlCache && foto?.storage_path) delete state.photoUrlCache[foto.storage_path];
    if (state.photoUrlCache && foto?.url) delete state.photoUrlCache[foto.url];

    await loadFotoCounts();
    await loadLevantamientoForSelectedEquipo();
    renderEquipos();
    setStatus("Foto de levantamiento eliminada.", "");
  } catch (err) {
    console.warn("No se pudo eliminar foto:", err.message);
    setStatus(`No se pudo eliminar foto: ${err.message}`, "error");
  }
}

async function guardarEquipo() {
  if (!isSupervisorMode()) {
    mostrarAvisoFlotante("Solo supervisor/admin puede dar de alta equipos.", "error");
    return;
  }
  const idTag = $("equipo-id-tag")?.value.trim();
  const nombreEquipo = $("equipo-nombre")?.value.trim();
  const area = $("equipo-area")?.value.trim();
  const proceso = $("equipo-proceso")?.value.trim();
  const sistema = $("equipo-sistema")?.value.trim();
  const criticidad = $("equipo-criticidad")?.value || "C";

  if (!idTag || !nombreEquipo) {
    mostrarAvisoFlotante("Escribe al menos el ID TAG y el nombre del equipo antes de guardar.", "error");
    return;
  }

  const editandoId = state.editandoEquipoId;
  const editando = editandoId ? state.equipos.find(item => String(item.id) === String(editandoId)) : null;

  const payload = {
    id_tag: idTag,
    nombre_equipo: nombreEquipo,
    area: area || null,
    proceso: proceso || null,
    sistema: sistema || null,
    criticidad,
    activo: true
  };

  const { error } = editando
    ? await sb.from(cfg.tables.equipos).update(payload).eq("id", editando.id).select("id").single()
    : await sb.from(cfg.tables.equipos).insert({ ...payload, empresa_id: state.empresaId }).select("id").single();

  if (error) {
    mostrarAvisoFlotante(`No se pudo guardar el equipo: ${error.message}. Corre el Paso 32 en Supabase si aún no lo has corrido.`, "error");
    return;
  }

  state.editandoEquipoId = "";
  cerrarModal();
  await loadEquipos();
  mostrarAvisoFlotante(editando ? "Cambios guardados." : "Equipo dado de alta.", "ok");
}

async function eliminarEquipo(id) {
  if (!isSupervisorMode()) return;
  const equipo = state.equipos.find(item => String(item.id) === String(id));
  if (!window.confirm(`¿Eliminar el equipo ${equipo?.id_tag || ""}? Sus fotos y cartas ya guardadas NO se borran, pero el equipo dejará de aparecer en las listas. Se puede reactivar después desde Supabase si hace falta.`)) return;

  const { data, error } = await sb.from(cfg.tables.equipos).update({ activo: false }).eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso para editar equipos en Supabase (Paso 32).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar el equipo: ${error.message}`, "error");
    return;
  }

  state.editandoEquipoId = "";
  cerrarModal();
  await loadEquipos();
  mostrarAvisoFlotante("Equipo eliminado.", "ok");
}

function formularioEquipoHtml(editando) {
  const crit = String(editando?.criticidad || "C").toUpperCase();
  return `
    <section class="equipo-form-panel">
      <h3>${editando ? `Editar: ${escapeHtml(editando.nombre_equipo || editando.id_tag || "")}` : "Dar de alta equipo"}</h3>
      <div class="form-preview">
        <div class="two-cols">
          <label>ID TAG<input id="equipo-id-tag" placeholder="Ej: THE-6210" value="${escapeHtml(editando?.id_tag || "")}"></label>
          <label>Nombre del equipo<input id="equipo-nombre" placeholder="Ej: Transportador helicoidal #3" value="${escapeHtml(editando?.nombre_equipo || "")}"></label>
        </div>
        <div class="two-cols">
          <label>Área<input id="equipo-area" placeholder="Ej: Ensacado sílice" value="${escapeHtml(editando?.area || "")}"></label>
          <label>Proceso<input id="equipo-proceso" placeholder="Ej: Ensacadora 1" value="${escapeHtml(editando?.proceso || "")}"></label>
        </div>
        <div class="two-cols">
          <label>Sistema<input id="equipo-sistema" placeholder="Ej: Sistema de transmisión" value="${escapeHtml(editando?.sistema || "")}"></label>
          <label>Criticidad<select id="equipo-criticidad">
            <option value="A" ${crit === "A" ? "selected" : ""}>A</option>
            <option value="B" ${(!editando || crit === "B") ? "selected" : ""}>B</option>
            <option value="C" ${crit === "C" ? "selected" : ""}>C</option>
          </select></label>
        </div>
        <div class="form-action">
          ${editando ? `<button class="ghost-action danger-action" onclick="eliminarEquipo('${escapeHtml(editando.id)}')">🗑 Eliminar</button>` : ""}
          <button class="ghost-action" onclick="cerrarModal()">Cancelar</button>
          <button class="primary-action" onclick="guardarEquipo()">${editando ? "Guardar cambios" : "Dar de alta"}</button>
        </div>
      </div>
    </section>`;
}

function abrirFormularioEquipo(id) {
  if (!isSupervisorMode()) return;
  state.editandoEquipoId = id || "";
  const editando = id ? state.equipos.find(item => String(item.id) === String(id)) : null;
  abrirModal(formularioEquipoHtml(editando));
}

function editarEquipo(id) {
  abrirFormularioEquipo(id);
}

function toggleEquipoForm() {
  abrirFormularioEquipo("");
}

function renderEquipos() {
  const q = $("search").value.trim().toLowerCase();
  const areaFiltro = state.equiposAreaFiltro;
  const equiposActivos = state.equipos.filter(e => e.activo !== false);
  const areaSelect = $("equipos-area-filter");
  if (areaSelect) {
    const areas = groupByArea(equiposActivos).map(([area]) => area);
    areaSelect.innerHTML = `<option value="">Todas las áreas</option>` +
      areas.map(area => `<option value="${escapeHtml(area)}" ${area === areaFiltro ? "selected" : ""}>${escapeHtml(area)}</option>`).join("");
  }
  const boton = $("equipos-add-btn");
  if (boton) boton.classList.toggle("hidden", !isSupervisorMode());
  const equipos = equiposActivos.filter(e => {
    const haystack = [e.id_tag, e.nombre_equipo, e.area, e.proceso, e.sistema].join(" ").toLowerCase();
    const matchQ = !q || haystack.includes(q);
    const matchArea = !areaFiltro || (e.area || "SIN ÁREA") === areaFiltro;
    return matchQ && matchArea;
  });
  $("equipos-list").innerHTML = equipos.map(e => {
    const crit = String(e.criticidad || "C").toUpperCase();
    const fotoCount = state.fotoCounts[e.id] || 0;
    return `<div class="equipo-row equipo-button ${e.id === state.selectedEquipoId ? "selected" : ""}" onclick="selectEquipo('${escapeHtml(e.id)}')" role="button" tabindex="0">
      <div class="equipo-top">
        <div>
          <div class="tag">${escapeHtml(e.id_tag || "SIN TAG")}</div>
          <strong>${escapeHtml(e.nombre_equipo || "Sin nombre")}</strong>
          <div class="muted">${escapeHtml(e.area || "Sin área")} - ${escapeHtml(e.proceso || "Sin proceso")}</div>
        </div>
        <div class="row-badges">
          ${fotoCount ? `<span class="pill photo-pill">${fotoCount} fotos</span>` : ""}
          <span class="pill crit-${escapeHtml(crit)}">Crit ${escapeHtml(crit)}</span>
          ${isSupervisorMode() ? `<button class="icon-edit-button" title="Editar equipo" onclick="event.stopPropagation();editarEquipo('${escapeHtml(e.id)}')">✎</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="equipo-row muted">Sin resultados.</div>`;
}

function filtrarEquiposPorArea(value) {
  state.equiposAreaFiltro = value || "";
  renderEquipos();
}

async function selectEquipo(id) {
  state.selectedEquipoId = id;
  setView("levantamiento");
  render();
  await loadLevantamientoForSelectedEquipo();
}

function volverAEquipos() {
  setView("equipos");
  render();
}

function irACartaDeEquipo(equipoId) {
  if (!moduleEnabled("cartas")) {
    mostrarAvisoFlotante("El módulo de Cartas realizadas está apagado para esta empresa.", "error");
    return;
  }
  // Limpiamos busqueda/filtro de cartas para que la carta de este
  // equipo no quede escondida por un filtro que se haya quedado de
  // antes, y para que siempre abra la de ESTE equipo.
  state.cartaSearch = "";
  state.cartaAreaFiltro = "";
  const cartaReal = cartaForEquipo(equipoId);
  const cartaId = cartaReal ? cartaReal.id : `auto-${equipoId}`;
  setView("cartas");
  seleccionarCarta(cartaId);
}
