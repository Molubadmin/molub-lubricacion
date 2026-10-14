// ============================================================
// LUBRICANTES — catálogo, equipos asociados, presentaciones,
// inventario, documentación (ficha técnica / MSDS) e historial de
// entradas por OC.
// ============================================================
// Segundo módulo separado de app.js (el primero fue raci.js),
// mismo patrón: es un movimiento de código, no una reescritura.
// Depende de utilidades compartidas que siguen en app.js ($,
// escapeHtml, mostrarAvisoFlotante, isSupervisorMode, activeUser,
// fileToDataUrl, firstValue, sb, cfg, state, renderModules) — por
// eso este archivo se carga ANTES que app.js en index.html.
//
// `opcionesDistintas()` vive aquí porque nació para los filtros de
// este catálogo, aunque también la usa app.js en otro lugar (el
// selector de técnicos) — eso sigue funcionando igual porque todos
// los archivos comparten el mismo espacio global.

const LUBRICANTE_SELECT_LISTA = "id,empresa_id,nombre,tipo,marca,especificacion,descripcion,codigo,nota,alias_cartas,color_nombre,color_foto_nombre,color_foto_data_url,foto_producto_nombre,foto_producto_data_url,ficha_tecnica_nombre,msds_nombre,activo,created_at";

const LUBRICANTE_SELECT_DOCUMENTACION = "id,ficha_tecnica_nombre,ficha_tecnica_tipo,ficha_tecnica_data_url,msds_nombre,msds_tipo,msds_data_url";

async function loadLubricantes() {
  state.lubricantes = [];
  if (!cfg.tables.lubricantes || !state.empresaId) return;

  // Nota: NO usar select("*") aqui. Esta consulta se repite en cada
  // recarga (loadEquipos la llama seguido), y "*" trae tambien la
  // ficha tecnica y el MSDS de CADA lubricante (archivos pesados en
  // base64) aunque nadie los este viendo. Eso disparo el consumo de
  // egress de Supabase. La ficha/MSDS se cargan aparte, solo cuando
  // se abre ese lubricante (ver cargarDocumentacionLubricante).
  const { data, error } = await sb
    .from(cfg.tables.lubricantes)
    .select(LUBRICANTE_SELECT_LISTA)
    .eq("empresa_id", state.empresaId)
    .order("nombre");

  if (error) {
    console.warn("No se pudieron cargar lubricantes:", error.message);
    return;
  }
  state.lubricantes = data || [];
}

async function cargarDocumentacionLubricante(id) {
  if (!id) return;
  const idx = state.lubricantes.findIndex(l => String(l.id) === String(id));
  if (idx === -1 || state.lubricantes[idx].__docCargada) return;
  const { data, error } = await sb
    .from(cfg.tables.lubricantes)
    .select(LUBRICANTE_SELECT_DOCUMENTACION)
    .eq("id", id)
    .single();
  if (error || !data) return;
  const idxActual = state.lubricantes.findIndex(l => String(l.id) === String(id));
  if (idxActual !== -1) {
    state.lubricantes[idxActual] = { ...state.lubricantes[idxActual], ...data, __docCargada: true };
  }
}

async function loadLubricanteEquipos() {
  state.lubricanteEquipos = [];
  if (!cfg.tables.lubricanteEquipos || !state.empresaId) return;
  const { data, error } = await sb
    .from(cfg.tables.lubricanteEquipos)
    .select("*")
    .eq("empresa_id", state.empresaId);
  if (error) {
    console.warn("No se pudieron cargar equipos asociados a lubricantes:", error.message);
    return;
  }
  state.lubricanteEquipos = data || [];
}

async function loadLubricantePresentaciones() {
  state.lubricantePresentaciones = [];
  if (!cfg.tables.lubricantePresentaciones || !state.empresaId) return;
  const { data, error } = await sb
    .from(cfg.tables.lubricantePresentaciones)
    .select("*")
    .eq("empresa_id", state.empresaId);
  if (error) {
    console.warn("No se pudieron cargar presentaciones de lubricantes:", error.message);
    return;
  }
  state.lubricantePresentaciones = data || [];
}

async function loadLubricanteMovimientos() {
  state.lubricanteMovimientos = [];
  if (!cfg.tables.lubricanteMovimientos || !state.empresaId) return;
  const { data, error } = await sb
    .from(cfg.tables.lubricanteMovimientos)
    .select("id,lubricante_id,presentacion_id,tipo,oc,cantidad,fecha_suministro,nota,usuario,created_at")
    .eq("empresa_id", state.empresaId)
    .order("fecha_suministro", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    // La tabla es nueva (Paso 44); si aun no se corre el SQL, no
    // truena el resto de la app - el historial solo sale vacio.
    console.warn("No se pudieron cargar movimientos de lubricantes:", error.message);
    return;
  }
  state.lubricanteMovimientos = data || [];
}

function movimientosDe(lubricanteId) {
  return state.lubricanteMovimientos.filter(m => String(m.lubricante_id) === String(lubricanteId));
}

function equiposAsociadosDe(lubricanteId) {
  return state.lubricanteEquipos.filter(le => String(le.lubricante_id) === String(lubricanteId));
}

function presentacionesDe(lubricanteId) {
  return state.lubricantePresentaciones.filter(p => String(p.lubricante_id) === String(lubricanteId));
}

function presentacionPrincipal(lubricanteId) {
  const pres = presentacionesDe(lubricanteId);
  return pres.find(p => p.es_principal) || pres[0] || null;
}

function presentacionTexto(p) {
  if (!p) return "";
  return `${p.nombre || "Presentación"}${p.cantidad ? ` de ${p.cantidad} ${p.unidad || "kg"}` : ""}`;
}

function lubricantesQueUsanEquipo(equipoId) {
  return state.lubricanteEquipos.filter(le => String(le.equipo_id) === String(equipoId));
}

function renderLubricantesDeEquipo(equipoId) {
  const usos = lubricantesQueUsanEquipo(equipoId);
  if (!usos.length) return "";
  const filas = usos.map(le => {
    const lub = state.lubricantes.find(l => String(l.id) === String(le.lubricante_id));
    if (!lub) return "";
    const punto = le.punto_lubricacion && le.punto_lubricacion !== le.componente ? le.punto_lubricacion : "";
    const detalle = [le.componente, punto].filter(Boolean).join(" · ") || le.frecuencia || "";
    return `<button type="button" class="lube-equipo-chip" onclick="irALubricante('${escapeHtml(lub.id)}')">
      <strong>${escapeHtml(lub.nombre)}</strong>
      ${detalle ? `<span>${escapeHtml(detalle)}</span>` : ""}
    </button>`;
  }).join("");
  return `<div class="detail-section-title">🧴 Lubricantes utilizados</div><div class="lube-equipo-chips">${filas}</div>`;
}

function irALubricante(id) {
  setView("lubricantes");
  seleccionarLubricante(id);
}

function opcionesDistintas(rows, campoOFn, actual, etiquetaTodos) {
  const valores = new Set();
  rows.forEach(row => {
    const v = typeof campoOFn === "function" ? campoOFn(row) : row[campoOFn];
    if (v) valores.add(String(v));
  });
  const ordenados = [...valores].sort((a, b) => a.localeCompare(b));
  return `<option value="" ${!actual ? "selected" : ""}>${escapeHtml(etiquetaTodos)}</option>` +
    ordenados.map(v => `<option value="${escapeHtml(v)}" ${actual === v ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
}

function lubricantesFiltrados() {
  const q = String(state.lubricanteSearch || "").trim().toLowerCase();
  const { tipo, marca, area, estado } = state.lubricantesFiltro;
  return state.lubricantes.filter(l => {
    const matchQ = !q || [l.nombre, l.marca, l.codigo].join(" ").toLowerCase().includes(q);
    const matchTipo = !tipo || (l.tipo || "Grasa") === tipo;
    const matchMarca = !marca || (l.marca || "") === marca;
    const matchEstado = !estado || (estado === "activo" ? l.activo !== false : l.activo === false);
    const matchArea = !area || equiposAsociadosDe(l.id).some(le => {
      const eq = state.equipos.find(e => e.id === le.equipo_id);
      return eq && eq.area === area;
    });
    return matchQ && matchTipo && matchMarca && matchEstado && matchArea;
  });
}

function buscarLubricantes(value) {
  state.lubricanteSearch = value || "";
  renderModules();
}

function actualizarFiltroLubricantes(campo, valor) {
  state.lubricantesFiltro[campo] = valor;
  renderModules();
}

async function guardarLubricante() {
  if (!isSupervisorMode()) {
    mostrarAvisoFlotante("Solo supervisor/admin puede dar de alta lubricantes.", "error");
    return;
  }
  const nombre = $("lub-nombre")?.value.trim();
  const marca = $("lub-marca")?.value.trim();
  const tipo = $("lub-tipo")?.value || "Grasa";
  const codigo = $("lub-codigo")?.value.trim();
  const especificacion = $("lub-especificacion")?.value.trim();
  const descripcion = $("lub-descripcion")?.value.trim();
  const nota = $("lub-nota")?.value.trim();
  const colorNombre = $("lub-color-nombre")?.value.trim();
  const foto = $("lub-foto")?.files?.[0];
  const colorFoto = $("lub-color-foto")?.files?.[0];
  const ficha = $("lub-ficha")?.files?.[0];
  const msds = $("lub-msds")?.files?.[0];

  if (!nombre) {
    mostrarAvisoFlotante("Escribe el nombre del lubricante antes de guardar.", "error");
    return;
  }

  const soloImagenArchivos = [foto, colorFoto];
  for (const [file, label] of [[foto, "La foto del producto"], [colorFoto, "La foto del color"], [ficha, "La ficha técnica"], [msds, "El MSDS"]]) {
    if (!file) continue;
    const soloImagen = soloImagenArchivos.includes(file);
    const esImagenOPdf = file.type === "application/pdf" || file.type.startsWith("image/");
    if (soloImagen ? !file.type.startsWith("image/") : !esImagenOPdf) {
      mostrarAvisoFlotante(`${label} debe ser ${soloImagen ? "una imagen" : "un PDF o una imagen"}.`, "error");
      return;
    }
    if (file.size > 4500000) {
      mostrarAvisoFlotante(`${label} pesa demasiado, usa un archivo menor a 4.5 MB.`, "error");
      return;
    }
  }

  const editandoId = state.editandoLubricanteId;
  let editando = editandoId ? state.lubricantes.find(item => String(item.id) === String(editandoId)) : null;

  if (editando && !editando.__docCargada) {
    // Aseguramos tener la ficha tecnica y el MSDS actuales antes de
    // guardar: si no se cargan, el update de abajo los borraria por
    // accidente cada vez que se edita el lubricante sin volver a
    // subir esos archivos.
    await cargarDocumentacionLubricante(editando.id);
    editando = state.lubricantes.find(item => String(item.id) === String(editandoId));
    if (!editando?.__docCargada) {
      mostrarAvisoFlotante("No se pudo confirmar la ficha técnica/MSDS actuales (sin conexión). Intenta guardar de nuevo para no perderlas.", "error");
      return;
    }
  }

  let fotoDataUrl = editando?.foto_producto_data_url || null;
  let fotoNombre = editando?.foto_producto_nombre || null;
  if (foto) {
    fotoDataUrl = await fileToDataUrl(foto);
    fotoNombre = foto.name;
  }

  let colorFotoDataUrl = editando?.color_foto_data_url || null;
  let colorFotoNombre = editando?.color_foto_nombre || null;
  if (colorFoto) {
    colorFotoDataUrl = await fileToDataUrl(colorFoto);
    colorFotoNombre = colorFoto.name;
  }

  let fichaDataUrl = editando?.ficha_tecnica_data_url || null;
  let fichaNombre = editando?.ficha_tecnica_nombre || null;
  let fichaTipo = editando?.ficha_tecnica_tipo || null;
  if (ficha) {
    fichaDataUrl = await fileToDataUrl(ficha);
    fichaNombre = ficha.name;
    fichaTipo = ficha.type;
  }

  let msdsDataUrl = editando?.msds_data_url || null;
  let msdsNombre = editando?.msds_nombre || null;
  let msdsTipo = editando?.msds_tipo || null;
  if (msds) {
    msdsDataUrl = await fileToDataUrl(msds);
    msdsNombre = msds.name;
    msdsTipo = msds.type;
  }

  const payload = {
    nombre,
    tipo,
    marca: marca || null,
    codigo: codigo || null,
    especificacion: especificacion || null,
    descripcion: descripcion || null,
    nota: nota || null,
    color_nombre: colorNombre || null,
    color_foto_nombre: colorFotoNombre,
    color_foto_data_url: colorFotoDataUrl,
    foto_producto_nombre: fotoNombre,
    foto_producto_data_url: fotoDataUrl,
    ficha_tecnica_nombre: fichaNombre,
    ficha_tecnica_tipo: fichaTipo,
    ficha_tecnica_data_url: fichaDataUrl,
    msds_nombre: msdsNombre,
    msds_tipo: msdsTipo,
    msds_data_url: msdsDataUrl
  };

  const { data: guardado, error } = editando
    ? await sb.from(cfg.tables.lubricantes).update(payload).eq("id", editando.id).select("id").single()
    : await sb.from(cfg.tables.lubricantes).insert({ ...payload, empresa_id: state.empresaId }).select("id").single();

  if (error) {
    mostrarAvisoFlotante(`No se pudo guardar el lubricante: ${error.message}. Corre el Paso 22/23/25/26 si aún no los has corrido.`, "error");
    return;
  }

  ["lub-nombre", "lub-marca", "lub-codigo", "lub-especificacion", "lub-descripcion", "lub-nota", "lub-color-nombre"].forEach(id => { if ($(id)) $(id).value = ""; });
  ["lub-foto", "lub-color-foto", "lub-ficha", "lub-msds"].forEach(id => { if ($(id)) $(id).value = ""; });
  ["lub-foto-preview", "lub-color-foto-preview", "lub-ficha-preview", "lub-msds-preview"].forEach(id => { if ($(id)) $(id).innerHTML = ""; });
  state.editandoLubricanteId = "";
  await loadLubricantes();
  const idGuardado = editando?.id || guardado?.id;
  const idxGuardado = idGuardado ? state.lubricantes.findIndex(l => String(l.id) === String(idGuardado)) : -1;
  if (idxGuardado !== -1) {
    // Ya tenemos estos datos en memoria (recien subidos): los
    // completamos aqui para no tener que volver a pedirlos a
    // Supabase (evita otro round-trip pesado justo despues de guardar).
    state.lubricantes[idxGuardado] = {
      ...state.lubricantes[idxGuardado],
      ficha_tecnica_nombre: fichaNombre,
      ficha_tecnica_tipo: fichaTipo,
      ficha_tecnica_data_url: fichaDataUrl,
      msds_nombre: msdsNombre,
      msds_tipo: msdsTipo,
      msds_data_url: msdsDataUrl,
      __docCargada: true
    };
  }
  renderModules();
  mostrarAvisoFlotante(editando ? "Cambios guardados." : "Lubricante dado de alta.", "ok");

  if (!editando && guardado?.id) {
    await autoAsociarEquiposLubricante(guardado.id, { silencioso: true });
  }
}

function terminosBusquedaLubricante(l) {
  const alias = String(l.alias_cartas || "").split(",").map(s => s.trim()).filter(Boolean);
  return [l.nombre, ...alias].map(t => String(t || "").trim().toLowerCase()).filter(Boolean);
}

function textosLubricanteEnCartas() {
  const conteo = new Map();
  state.elementosCartas.forEach(el => {
    if (!el.equipo_id) return;
    const v = String(el.lubricante || "").trim();
    if (!v) return;
    conteo.set(v, (conteo.get(v) || 0) + 1);
  });
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
}

async function agregarAliasLubricante(lubricanteId, texto) {
  if (!isSupervisorMode() || !texto) return;
  const l = state.lubricantes.find(item => String(item.id) === String(lubricanteId));
  if (!l) return;
  const actuales = String(l.alias_cartas || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!actuales.some(a => a.toLowerCase() === texto.toLowerCase())) {
    actuales.push(texto);
    const { error } = await sb.from(cfg.tables.lubricantes).update({ alias_cartas: actuales.join(", ") }).eq("id", lubricanteId);
    if (error) {
      mostrarAvisoFlotante(`No se pudo guardar el alias: ${error.message}. Corre el Paso 27 si aún no lo has corrido.`, "error");
      return;
    }
    await loadLubricantes();
  }
  await autoAsociarEquiposLubricante(lubricanteId);
}

function toggleAliasPicker() {
  state.lubricanteAliasPickerAbierto = !state.lubricanteAliasPickerAbierto;
  renderModules();
}

async function autoAsociarEquiposLubricante(lubricanteId, opciones = {}) {
  const l = state.lubricantes.find(item => String(item.id) === String(lubricanteId));
  if (!l) return;
  const terminos = terminosBusquedaLubricante(l);
  if (!terminos.length) return;

  const coincidencias = state.elementosCartas.filter(el => {
    const valor = String(el.lubricante || "").trim().toLowerCase();
    if (!valor || !el.equipo_id) return false;
    return terminos.some(t => valor === t || valor.includes(t) || t.includes(valor));
  });

  const existentes = new Set(equiposAsociadosDe(lubricanteId).map(le => `${le.equipo_id}|${le.punto_lubricacion || ""}`));
  const vistas = new Set();
  const nuevas = [];
  coincidencias.forEach(el => {
    const punto = el.nombre || el.descripcion || "";
    const clave = `${el.equipo_id}|${punto}`;
    if (existentes.has(clave) || vistas.has(clave)) return;
    vistas.add(clave);
    nuevas.push({
      empresa_id: state.empresaId,
      lubricante_id: lubricanteId,
      equipo_id: el.equipo_id,
      componente: el.elemento || null,
      punto_lubricacion: punto || null,
      cantidad_aplicada: el.gramos ? `${el.gramos} g` : el.litros ? `${el.litros} L` : el.bombazos ? `${el.bombazos} bombazos` : null,
      frecuencia: el.frecuencia || null
    });
  });

  if (!nuevas.length) {
    if (!opciones.silencioso) {
      if (coincidencias.length) {
        mostrarAvisoFlotante("Ya están asociados todos los equipos que encontramos con ese nombre.", "ok");
      } else {
        state.lubricanteAliasPickerAbierto = true;
        renderModules();
        mostrarAvisoFlotante("No hay coincidencias con ese nombre. Elige abajo cómo está escrito en tus cartas.", "error");
      }
    }
    return;
  }

  const { error } = await sb.from(cfg.tables.lubricanteEquipos).insert(nuevas);
  if (error) {
    if (!opciones.silencioso) mostrarAvisoFlotante(`No se pudo asociar automáticamente: ${error.message}. Corre el Paso 26 si aún no lo has corrido.`, "error");
    return;
  }
  await loadLubricanteEquipos();
  renderModules();
  mostrarAvisoFlotante(`Se asociaron ${nuevas.length} punto${nuevas.length === 1 ? "" : "s"} de lubricación automáticamente.`, "ok");
}

async function editarLubricante(id) {
  if (!isSupervisorMode()) return;
  state.editandoLubricanteId = id;
  state.lubricanteFormAbierto = true;
  state.lubricanteDetailMode = false;
  renderModules();
  document.getElementById("lub-nombre")?.scrollIntoView({ behavior: "smooth", block: "center" });
  await cargarDocumentacionLubricante(id);
  if (String(state.editandoLubricanteId) === String(id)) renderModules();
}

function cancelarEdicionLubricante() {
  state.editandoLubricanteId = "";
  state.lubricanteFormAbierto = false;
  renderModules();
}

function toggleLubricanteForm() {
  state.lubricanteFormAbierto = !state.lubricanteFormAbierto;
  if (!state.lubricanteFormAbierto) state.editandoLubricanteId = "";
  renderModules();
}

function previewArchivoLubricante(input, previewId, soloImagen) {
  const preview = $(previewId);
  const file = input?.files?.[0];
  if (!preview || !file) return;
  const valido = soloImagen ? file.type.startsWith("image/") : (file.type === "application/pdf" || file.type.startsWith("image/"));
  if (!valido) {
    preview.innerHTML = `<div class="empty-state small">${soloImagen ? "Selecciona una imagen." : "Selecciona un PDF o una imagen."}</div>`;
    return;
  }
  if (file.size > 4500000) {
    preview.innerHTML = `<div class="empty-state small">Ese archivo pesa demasiado, usa uno menor a 4.5 MB.</div>`;
    return;
  }
  if (file.type.startsWith("image/")) {
    preview.innerHTML = `<div class="closure-photo"><img src="${URL.createObjectURL(file)}" alt="Vista previa"></div>`;
  } else {
    preview.innerHTML = `<div class="closure-photo"><small>📎 ${escapeHtml(file.name)}</small></div>`;
  }
}

function previewFotoProductoLubricante(input) { previewArchivoLubricante(input, "lub-foto-preview", true); }
function previewColorFotoLubricante(input) { previewArchivoLubricante(input, "lub-color-foto-preview", true); }
function previewFichaLubricante(input) { previewArchivoLubricante(input, "lub-ficha-preview", false); }
function previewMsdsLubricante(input) { previewArchivoLubricante(input, "lub-msds-preview", false); }

async function seleccionarLubricante(id) {
  state.selectedLubricanteId = id;
  state.lubricanteDetailMode = true;
  state.lubricanteTab = "equipos";
  state.lubricanteAsociarFormAbierto = false;
  state.lubricantePresentacionFormAbierto = false;
  state.lubricanteMovimientoFormAbierto = false;
  state.lubricanteAliasPickerAbierto = false;
  renderModules();
  await cargarDocumentacionLubricante(id);
  if (String(state.selectedLubricanteId) === String(id)) renderModules();
}

function volverListaLubricantes() {
  state.lubricanteDetailMode = false;
  state.selectedLubricanteId = "";
  renderModules();
}

function cambiarTabLubricante(tab) {
  state.lubricanteTab = tab;
  state.lubricanteAsociarFormAbierto = false;
  state.lubricantePresentacionFormAbierto = false;
  state.lubricanteMovimientoFormAbierto = false;
  state.lubricanteAliasPickerAbierto = false;
  renderModules();
}

function lubricanteVisual(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t.startsWith("grasa")) return { icon: "🧴", clase: "lube-grasa" };
  if (t.startsWith("aceite")) return { icon: "🛢️", clase: "lube-aceite" };
  return { icon: "⚙️", clase: "lube-otro" };
}

function lubricanteColorSwatchHtml(l, grande) {
  if (!l.color_foto_data_url) return "";
  return `<span class="lube-color-dot${grande ? " lube-color-dot-lg" : ""}" style="background-image:url('${escapeHtml(l.color_foto_data_url)}')" title="${escapeHtml(l.color_nombre || "Color del producto")}"></span>`;
}

function lubricanteColorChipHtml(l) {
  if (!l.color_nombre && !l.color_foto_data_url) return "";
  return `<span class="lube-color-chip">${lubricanteColorSwatchHtml(l, true)}${l.color_nombre ? escapeHtml(l.color_nombre) : "Color"}</span>`;
}

function lubricanteIconHtml(l, visual) {
  if (l.foto_producto_data_url) {
    return `<img src="${escapeHtml(l.foto_producto_data_url)}" alt="${escapeHtml(l.nombre)}">`;
  }
  return visual.icon;
}

function tabLabelLubricante(t) {
  return {
    equipos: "Equipos",
    presentaciones: "Presentaciones",
    inventario: "Inventario",
    documentacion: "Documentación",
    consumos: "Historial de consumos"
  }[t] || t;
}

function inventarioTexto(presentaciones) {
  const conEnvases = presentaciones.filter(p => Number(p.num_envases) > 0);
  if (!conEnvases.length) return "Sin registrar";
  return conEnvases.map(p => `${p.num_envases} ${p.nombre}`).join(", ");
}

function renderTabEquipos(l, rows) {
  const filas = rows.map(le => {
    const eq = state.equipos.find(e => e.id === le.equipo_id);
    return `<tr>
      <td>${escapeHtml(eq?.nombre_equipo || eq?.id_tag || "Equipo eliminado")}</td>
      <td>${escapeHtml(le.componente || "-")}</td>
      <td>${escapeHtml(le.punto_lubricacion || "-")}</td>
      <td>${escapeHtml(eq?.area || "-")}</td>
      <td>${escapeHtml(le.cantidad_aplicada || "-")}</td>
      <td>${escapeHtml(le.frecuencia || "-")}</td>
      <td class="lube-uso-table-actions">${isSupervisorMode() ? `<button class="icon-danger-button" onclick="eliminarAsociacionEquipo('${le.id}')" title="Quitar">×</button>` : ""}</td>
    </tr>`;
  }).join("");

  const equiposOrdenados = [...state.equipos].sort((a, b) =>
    String(a.area || "").localeCompare(String(b.area || "")) || String(a.nombre_equipo || "").localeCompare(String(b.nombre_equipo || "")));

  return `
    ${isSupervisorMode() ? `
      <div class="lube-equipos-actions">
        <button onclick="toggleAsociarEquipoForm()">${state.lubricanteAsociarFormAbierto ? "✕ Cerrar" : "+ Asociar equipo"}</button>
        <button class="ghost-action" onclick="autoAsociarEquiposLubricante('${l.id}')" title="Busca en las cartas guardadas equipos con este mismo nombre de lubricante">🔄 Buscar equipos automáticamente</button>
        <button class="ghost-action" onclick="toggleAliasPicker()">${state.lubricanteAliasPickerAbierto ? "✕ Cerrar" : "🔤 Elegir nombre como aparece en las cartas"}</button>
      </div>
      ${renderSelectorAlias(l)}
      ${state.lubricanteAsociarFormAbierto ? `
        <div class="lube-form-panel">
          <div class="two-cols">
            <label>Equipo<select id="assoc-equipo">
              ${equiposOrdenados.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.area || "Sin área")} · ${escapeHtml(e.nombre_equipo || e.id_tag || "Equipo")}</option>`).join("")}
            </select></label>
            <label>Componente<input id="assoc-componente" placeholder="Ej: Chumacera, motor, reductor..."></label>
          </div>
          <div class="two-cols">
            <label>Punto de lubricación<input id="assoc-punto" placeholder="Ej: Lado motor, entrada, salida..."></label>
            <label>Cantidad aplicada<input id="assoc-cantidad" placeholder="Ej: 40 g, 0.5 L..."></label>
          </div>
          <label>Frecuencia<select id="assoc-frecuencia">
            <option>Diario</option><option>Semanal</option><option>Quincenal</option><option selected>Mensual</option><option>Trimestral</option><option>Semestral</option><option>Anual</option>
          </select></label>
          <div class="form-action"><button onclick="guardarAsociacionEquipo('${l.id}')">Asociar equipo</button></div>
        </div>
      ` : ""}
    ` : ""}
    ${rows.length ? `
      <div class="lube-uso-table-wrap">
        <table class="lube-uso-table">
          <thead><tr><th>Equipo</th><th>Componente</th><th>Punto</th><th>Área</th><th>Cantidad</th><th>Frecuencia</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    ` : `<div class="empty-state small">Este lubricante todavía no está asociado a ningún equipo.</div>`}
  `;
}

function renderSelectorAlias(l) {
  if (!isSupervisorMode() || !state.lubricanteAliasPickerAbierto) return "";
  const actuales = String(l.alias_cartas || "").split(",").map(s => s.trim()).filter(Boolean);
  const opciones = textosLubricanteEnCartas().filter(([texto]) => !actuales.some(a => a.toLowerCase() === texto.toLowerCase()));
  state.lubricanteAliasOpciones = opciones.map(([texto]) => texto);

  return `
    <div class="lube-form-panel">
      <p class="muted lube-alias-hint">Elige el texto que usaron en tus cartas de lubricación para este mismo producto (puede ser distinto al nombre del catálogo). Se guarda como alias y se buscan sus equipos.</p>
      ${actuales.length ? `<div class="lube-alias-chips">${actuales.map(a => `<span class="pill">✓ ${escapeHtml(a)}</span>`).join("")}</div>` : ""}
      <div class="lube-alias-list">
        ${opciones.length ? opciones.map(([texto, count], idx) => `
          <button type="button" class="lube-alias-option" onclick="agregarAliasLubricante('${l.id}', state.lubricanteAliasOpciones[${idx}])">
            <span>${escapeHtml(texto)}</span>
            <small>${count} punto${count === 1 ? "" : "s"}</small>
          </button>`).join("")
          : `<div class="empty-state small">No hay más nombres distintos de lubricante en las cartas guardadas.</div>`}
      </div>
    </div>`;
}

function toggleAsociarEquipoForm() {
  state.lubricanteAsociarFormAbierto = !state.lubricanteAsociarFormAbierto;
  renderModules();
}

async function guardarAsociacionEquipo(lubricanteId) {
  if (!isSupervisorMode()) return;
  const equipoId = $("assoc-equipo")?.value;
  if (!equipoId) {
    mostrarAvisoFlotante("Selecciona un equipo.", "error");
    return;
  }
  const { error } = await sb.from(cfg.tables.lubricanteEquipos).insert({
    empresa_id: state.empresaId,
    lubricante_id: lubricanteId,
    equipo_id: equipoId,
    componente: $("assoc-componente")?.value.trim() || null,
    punto_lubricacion: $("assoc-punto")?.value.trim() || null,
    cantidad_aplicada: $("assoc-cantidad")?.value.trim() || null,
    frecuencia: $("assoc-frecuencia")?.value || null
  });
  if (error) {
    mostrarAvisoFlotante(`No se pudo asociar el equipo: ${error.message}. Corre el Paso 26 si aún no lo has corrido.`, "error");
    return;
  }
  state.lubricanteAsociarFormAbierto = false;
  await loadLubricanteEquipos();
  renderModules();
  mostrarAvisoFlotante("Equipo asociado.", "ok");
}

async function eliminarAsociacionEquipo(id) {
  if (!isSupervisorMode()) return;
  if (!window.confirm("¿Quitar esta asociación?")) return;
  const { data, error } = await sb.from(cfg.tables.lubricanteEquipos).delete().eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 26).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo quitar: ${error.message}`, "error");
    return;
  }
  await loadLubricanteEquipos();
  renderModules();
  mostrarAvisoFlotante("Asociación eliminada.", "ok");
}

function renderTabPresentaciones(l, presentaciones) {
  const filas = presentaciones.map(p => `
    <tr>
      <td>${escapeHtml(p.nombre)}${p.es_principal ? ` <span class="pill">Principal</span>` : ""}</td>
      <td>${p.cantidad ? escapeHtml(p.cantidad) : "-"} ${escapeHtml(p.unidad || "")}</td>
      <td class="lube-uso-table-actions">${isSupervisorMode() ? `<button class="icon-danger-button" onclick="eliminarPresentacion('${p.id}')" title="Eliminar">×</button>` : ""}</td>
    </tr>`).join("");

  return `
    ${isSupervisorMode() ? `
      <button onclick="toggleAgregarPresentacionForm()">${state.lubricantePresentacionFormAbierto ? "✕ Cerrar" : "+ Agregar presentación"}</button>
      ${state.lubricantePresentacionFormAbierto ? `
        <div class="lube-form-panel">
          <div class="two-cols">
            <label>Nombre<input id="pres-nombre" placeholder="Ej: Cubeta, Tambor, Cartucho..."></label>
            <label>Cantidad<input id="pres-cantidad" type="number" step="any" placeholder="Ej: 16"></label>
          </div>
          <div class="two-cols">
            <label>Unidad<select id="pres-unidad"><option>kg</option><option>L</option><option>g</option><option>mL</option><option>cartucho</option><option>pieza</option></select></label>
            <label class="lube-checkbox-field"><input id="pres-principal" type="checkbox"> Es la que compra la planta</label>
          </div>
          <div class="form-action"><button onclick="guardarPresentacionLubricante('${l.id}')">Guardar presentación</button></div>
        </div>
      ` : ""}
    ` : ""}
    ${presentaciones.length ? `
      <div class="lube-uso-table-wrap"><table class="lube-uso-table"><thead><tr><th>Presentación</th><th>Cantidad</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    ` : `<div class="empty-state small">Todavía no hay presentaciones registradas para este producto.</div>`}
  `;
}

function toggleAgregarPresentacionForm() {
  state.lubricantePresentacionFormAbierto = !state.lubricantePresentacionFormAbierto;
  renderModules();
}

async function guardarPresentacionLubricante(lubricanteId) {
  if (!isSupervisorMode()) return;
  const nombre = $("pres-nombre")?.value.trim();
  const cantidad = $("pres-cantidad")?.value;
  const unidad = $("pres-unidad")?.value || "kg";
  const principal = $("pres-principal")?.checked || false;
  if (!nombre) {
    mostrarAvisoFlotante("Escribe el nombre de la presentación.", "error");
    return;
  }
  const { data, error } = await sb.from(cfg.tables.lubricantePresentaciones).insert({
    empresa_id: state.empresaId,
    lubricante_id: lubricanteId,
    nombre,
    cantidad: cantidad ? Number(cantidad) : null,
    unidad,
    es_principal: principal,
    num_envases: 0,
    inventario_minimo: 0
  }).select("id").single();

  if (error) {
    mostrarAvisoFlotante(`No se pudo guardar: ${error.message}. Corre el Paso 26 si aún no lo has corrido.`, "error");
    return;
  }
  if (principal && data?.id) {
    await sb.from(cfg.tables.lubricantePresentaciones).update({ es_principal: false }).eq("lubricante_id", lubricanteId).neq("id", data.id);
  }
  state.lubricantePresentacionFormAbierto = false;
  await loadLubricantePresentaciones();
  renderModules();
  mostrarAvisoFlotante("Presentación guardada.", "ok");
}

async function eliminarPresentacion(id) {
  if (!isSupervisorMode()) return;
  if (!window.confirm("¿Eliminar esta presentación?")) return;
  const { data, error } = await sb.from(cfg.tables.lubricantePresentaciones).delete().eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 26).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar: ${error.message}`, "error");
    return;
  }
  await loadLubricantePresentaciones();
  renderModules();
  mostrarAvisoFlotante("Presentación eliminada.", "ok");
}

function renderTabInventario(presentaciones) {
  if (!presentaciones.length) {
    return `<div class="empty-state small">Registra al menos una presentación en la pestaña "Presentaciones" para llevar su inventario.</div>`;
  }
  const filas = presentaciones.map(p => {
    const total = (Number(p.num_envases) || 0) * (Number(p.cantidad) || 0);
    const bajo = Number(p.inventario_minimo || 0) > 0 && Number(p.num_envases || 0) <= Number(p.inventario_minimo || 0);
    return `<tr class="${bajo ? "lube-inv-bajo" : ""}">
      <td>${escapeHtml(p.nombre)}</td>
      <td>${isSupervisorMode()
        ? `<input class="lube-inv-input" type="number" step="any" value="${escapeHtml(p.num_envases || 0)}" onchange="actualizarInventario('${p.id}','num_envases',this.value)">`
        : escapeHtml(p.num_envases || 0)}</td>
      <td>${escapeHtml(total)} ${escapeHtml(p.unidad || "")}</td>
      <td>${isSupervisorMode()
        ? `<input class="lube-inv-input" type="number" step="any" value="${escapeHtml(p.inventario_minimo || 0)}" onchange="actualizarInventario('${p.id}','inventario_minimo',this.value)">`
        : escapeHtml(p.inventario_minimo || 0)}</td>
      <td>${bajo ? `<span class="status-pill error">⚠ Bajo mínimo</span>` : `<span class="status-pill ok">OK</span>`}</td>
    </tr>`;
  }).join("");
  return `<div class="lube-uso-table-wrap"><table class="lube-uso-table"><thead><tr><th>Presentación</th><th>Envases</th><th>Total</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

async function actualizarInventario(presentacionId, campo, valor) {
  if (!isSupervisorMode()) return;
  const { error } = await sb.from(cfg.tables.lubricantePresentaciones).update({ [campo]: Number(valor) || 0 }).eq("id", presentacionId);
  if (error) {
    mostrarAvisoFlotante(`No se pudo actualizar: ${error.message}`, "error");
    return;
  }
  await loadLubricantePresentaciones();
  renderModules();
}

function renderDocSlot(l, prefix, titulo) {
  const nombre = l[`${prefix}_nombre`];
  const tipo = l[`${prefix}_tipo`];
  const url = l[`${prefix}_data_url`];
  const esImagen = String(tipo || "").startsWith("image/");
  return `
    <div class="lube-doc-card">
      <strong>${titulo}</strong>
      ${url ? (esImagen
        ? `<div class="detail-photos"><img src="${escapeHtml(url)}" alt="${escapeHtml(nombre || titulo)}" onclick="window.open(this.src,'_blank')"></div>`
        : `<a class="lube-file-chip" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span>📄</span>${escapeHtml(nombre || "Ver documento")}</a>`)
        : `<span class="muted">Sin documento cargado.</span>`}
      ${isSupervisorMode() ? `<label class="lube-doc-upload">Reemplazar<input type="file" accept="application/pdf,image/*" onchange="subirDocumentoLubricante('${l.id}','${prefix}',this)"></label>` : ""}
    </div>`;
}

function renderTabDocumentacion(l) {
  return `<div class="lube-doc-grid">${renderDocSlot(l, "ficha_tecnica", "📄 Ficha técnica")}${renderDocSlot(l, "msds", "☣️ MSDS / Hoja de seguridad")}</div>`;
}

async function subirDocumentoLubricante(lubricanteId, prefix, input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
    mostrarAvisoFlotante("Debe ser un PDF o una imagen.", "error");
    return;
  }
  if (file.size > 4500000) {
    mostrarAvisoFlotante("Ese archivo pesa demasiado, usa uno menor a 4.5 MB.", "error");
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  const payload = { [`${prefix}_nombre`]: file.name, [`${prefix}_tipo`]: file.type, [`${prefix}_data_url`]: dataUrl };
  const { error } = await sb.from(cfg.tables.lubricantes).update(payload).eq("id", lubricanteId);
  if (error) {
    mostrarAvisoFlotante(`No se pudo subir: ${error.message}. Corre el Paso 26 si aún no lo has corrido.`, "error");
    return;
  }
  await loadLubricantes();
  // loadLubricantes trae la lista liviana (sin ficha/MSDS); hay que
  // volver a traer la documentacion completa de este lubricante para
  // no perder de vista el otro documento (ficha o MSDS) en pantalla.
  await cargarDocumentacionLubricante(lubricanteId);
  renderModules();
  mostrarAvisoFlotante("Documento actualizado.", "ok");
}

function nombrePresentacionPorId(presentacionId) {
  const p = state.lubricantePresentaciones.find(item => String(item.id) === String(presentacionId));
  return p ? presentacionTexto(p) : "Presentación eliminada";
}

function renderTabConsumos(l, presentaciones) {
  const movimientos = movimientosDe(l.id);
  const supervisor = isSupervisorMode();
  const filas = movimientos.length ? movimientos.map(m => `
    <tr>
      <td>${escapeHtml(m.fecha_suministro || "Sin fecha")}</td>
      <td>${escapeHtml(m.oc || "Sin OC")}</td>
      <td>${escapeHtml(nombrePresentacionPorId(m.presentacion_id))}</td>
      <td>${escapeHtml(m.cantidad)}</td>
      <td>${escapeHtml(m.usuario || "")}</td>
      ${supervisor ? `<td><button class="icon-danger-button" type="button" title="Eliminar" onclick="eliminarMovimientoLubricante('${escapeHtml(m.id)}')">&times;</button></td>` : ""}
    </tr>
  `).join("") : `
    <tr><td colspan="${supervisor ? 6 : 5}" class="empty-table">Todavía no hay entradas registradas para este lubricante.</td></tr>
  `;

  const formAbierto = state.lubricanteMovimientoFormAbierto;
  const opcionesPresentacion = presentaciones.map(p =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(presentacionTexto(p))}</option>`
  ).join("");

  return `
    <div class="lube-uso-table-wrap">
      <table class="lube-uso-table">
        <thead><tr><th>Fecha de suministro</th><th>OC</th><th>Presentación</th><th>Cantidad</th><th>Registró</th>${supervisor ? "<th></th>" : ""}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    ${supervisor ? `
      ${!presentaciones.length ? `<div class="empty-state small">Registra primero una presentación (pestaña "Presentaciones") para poder capturar entradas.</div>` : `
        ${formAbierto ? `
          <section class="lube-form-panel">
            <h3>Registrar entrada de OC</h3>
            <div class="form-preview">
              <div class="two-cols">
                <label>Número de OC<input id="mov-oc" placeholder="Ej: OC-2026-118"></label>
                <label>Fecha de suministro<input id="mov-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
              </div>
              <div class="two-cols">
                <label>Presentación<select id="mov-presentacion">${opcionesPresentacion}</select></label>
                <label>Número de envases<input id="mov-cantidad" type="number" min="0" step="any" placeholder="Ej: 4"></label>
              </div>
              <label>Nota (opcional)<input id="mov-nota" placeholder="Ej: entregó el proveedor tal..."></label>
              <div class="form-action">
                <button class="ghost-action" onclick="toggleMovimientoForm()">Cancelar</button>
                <button onclick="guardarMovimientoLubricante('${escapeHtml(l.id)}')">Guardar entrada</button>
              </div>
            </div>
          </section>
        ` : `<button onclick="toggleMovimientoForm()">+ Registrar entrada (OC)</button>`}
      `}
    ` : ""}
  `;
}

function toggleMovimientoForm() {
  if (!isSupervisorMode()) return;
  state.lubricanteMovimientoFormAbierto = !state.lubricanteMovimientoFormAbierto;
  renderModules();
}

async function guardarMovimientoLubricante(lubricanteId) {
  if (!isSupervisorMode()) return;
  const oc = $("mov-oc")?.value.trim();
  const fecha = $("mov-fecha")?.value || null;
  const presentacionId = $("mov-presentacion")?.value;
  const cantidad = Number($("mov-cantidad")?.value);
  const nota = $("mov-nota")?.value.trim() || null;

  if (!presentacionId) {
    mostrarAvisoFlotante("Selecciona a qué presentación corresponde esta entrada.", "error");
    return;
  }
  if (!cantidad || cantidad <= 0) {
    mostrarAvisoFlotante("Escribe cuántos envases entraron (mayor a 0).", "error");
    return;
  }

  const presentacion = state.lubricantePresentaciones.find(p => String(p.id) === String(presentacionId));
  if (!presentacion) {
    mostrarAvisoFlotante("Esa presentación ya no existe, recarga la página.", "error");
    return;
  }

  const { error: movError } = await sb.from(cfg.tables.lubricanteMovimientos).insert({
    empresa_id: state.empresaId,
    lubricante_id: lubricanteId,
    presentacion_id: presentacionId,
    tipo: "entrada",
    oc: oc || null,
    cantidad,
    fecha_suministro: fecha,
    nota,
    usuario: firstValue(activeUser(), ["nombre", "usuario"], "")
  });
  if (movError) {
    mostrarAvisoFlotante(`No se pudo guardar la entrada: ${movError.message}. Corre el Paso 44 si aún no lo has corrido.`, "error");
    return;
  }

  // La entrada de OC suma directo al inventario de esa presentacion,
  // para no tener dos numeros (historial vs inventario) que se
  // puedan desincronizar - el inventario siempre refleja lo recibido.
  const nuevoTotal = (Number(presentacion.num_envases) || 0) + cantidad;
  const { error: invError } = await sb
    .from(cfg.tables.lubricantePresentaciones)
    .update({ num_envases: nuevoTotal })
    .eq("id", presentacionId);
  if (invError) {
    mostrarAvisoFlotante(`La entrada se guardó, pero no se pudo actualizar el inventario: ${invError.message}`, "error");
  }

  state.lubricanteMovimientoFormAbierto = false;
  await Promise.all([loadLubricanteMovimientos(), loadLubricantePresentaciones()]);
  renderModules();
  mostrarAvisoFlotante("Entrada registrada e inventario actualizado.", "ok");
}

async function eliminarMovimientoLubricante(id) {
  if (!isSupervisorMode()) return;
  const mov = state.lubricanteMovimientos.find(m => String(m.id) === String(id));
  if (!mov) return;
  if (!window.confirm("¿Eliminar esta entrada? También se restará del inventario de la presentación.")) return;

  const { error } = await sb.from(cfg.tables.lubricanteMovimientos).delete().eq("id", id);
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar: ${error.message}`, "error");
    return;
  }

  const presentacion = state.lubricantePresentaciones.find(p => String(p.id) === String(mov.presentacion_id));
  if (presentacion) {
    const nuevoTotal = Math.max(0, (Number(presentacion.num_envases) || 0) - Number(mov.cantidad || 0));
    await sb.from(cfg.tables.lubricantePresentaciones).update({ num_envases: nuevoTotal }).eq("id", presentacion.id);
  }

  await Promise.all([loadLubricanteMovimientos(), loadLubricantePresentaciones()]);
  renderModules();
  mostrarAvisoFlotante("Entrada eliminada.", "ok");
}

function renderDetalleLubricante() {
  const l = state.lubricantes.find(item => String(item.id) === String(state.selectedLubricanteId));
  if (!l) return `<div class="empty-state">Selecciona un lubricante.</div>`;
  const visual = lubricanteVisual(l.tipo);
  const equiposRows = equiposAsociadosDe(l.id);
  const equiposUnicos = new Set(equiposRows.map(e => e.equipo_id));
  const presentaciones = presentacionesDe(l.id);
  const presPrincipal = presentacionPrincipal(l.id);
  const tab = state.lubricanteTab || "equipos";

  return `
    <div class="lube-page-head">
      <button class="ghost-action" onclick="volverListaLubricantes()">← Volver al catálogo</button>
      ${isSupervisorMode() ? `
        <div class="lube-page-actions">
          <button class="ghost-action" onclick="editarLubricante('${l.id}')">✎ Editar</button>
          <button class="reject-action" onclick="eliminarLubricante('${l.id}')">Eliminar</button>
        </div>` : ""}
    </div>
    <div class="lube-detail-layout">
      <div class="lube-detail-icon lube-detail-icon-lg ${visual.clase} ${l.foto_producto_data_url ? "has-photo" : ""}">${lubricanteIconHtml(l, visual)}</div>
      <div class="lube-detail-heading">
        <span class="lube-detail-brand">${escapeHtml(l.marca || "MOLUB")}</span>
        <h2>${escapeHtml(l.nombre)}</h2>
        ${l.descripcion ? `<p class="lube-detail-desc">${escapeHtml(l.descripcion)}</p>` : ""}
        <div class="lube-detail-badges">
          <span class="status-pill">${escapeHtml(l.tipo || "Grasa")}</span>
          ${l.especificacion ? `<span class="pill">${escapeHtml(l.especificacion)}</span>` : ""}
          ${l.codigo ? `<span class="pill">SKU ${escapeHtml(l.codigo)}</span>` : ""}
          ${lubricanteColorChipHtml(l)}
        </div>
      </div>
      <div class="lube-stats lube-stats-col">
        <div class="lube-stat"><span>📦 Presentación en planta</span><strong>${presPrincipal ? escapeHtml(presentacionTexto(presPrincipal)) : "Sin definir"}</strong></div>
        <div class="lube-stat"><span>⚙️ Equipos asociados</span><strong>${equiposUnicos.size}</strong></div>
        <div class="lube-stat"><span>📍 Puntos de lubricación</span><strong>${equiposRows.length}</strong></div>
        <div class="lube-stat"><span>📦 Inventario actual</span><strong>${inventarioTexto(presentaciones)}</strong></div>
      </div>
    </div>
    ${l.nota ? `<div class="detail-section-title">🗒 Nota</div><div class="detail-text">${escapeHtml(l.nota)}</div>` : ""}
    <div class="lube-tabs">
      ${["equipos", "presentaciones", "inventario", "documentacion", "consumos"].map(t =>
        `<button class="lube-tab ${tab === t ? "active" : ""}" onclick="cambiarTabLubricante('${t}')">${tabLabelLubricante(t)}</button>`
      ).join("")}
    </div>
    <div class="lube-tab-content">
      ${tab === "equipos" ? renderTabEquipos(l, equiposRows) : ""}
      ${tab === "presentaciones" ? renderTabPresentaciones(l, presentaciones) : ""}
      ${tab === "inventario" ? renderTabInventario(presentaciones) : ""}
      ${tab === "documentacion" ? renderTabDocumentacion(l) : ""}
      ${tab === "consumos" ? renderTabConsumos(l, presentaciones) : ""}
    </div>`;
}

async function eliminarLubricante(id) {
  if (!isSupervisorMode()) return;
  if (!window.confirm("¿Eliminar este lubricante del catálogo? También se quitarán sus presentaciones y asociaciones con equipos.")) return;

  const { data, error } = await sb.from(cfg.tables.lubricantes).delete().eq("id", id).select("id");
  if (!error && (!data || data.length === 0)) {
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 22).", "error");
    return;
  }
  if (error) {
    mostrarAvisoFlotante(`No se pudo eliminar: ${error.message}`, "error");
    return;
  }

  await loadLubricantes();
  await loadLubricanteEquipos();
  await loadLubricantePresentaciones();
  volverListaLubricantes();
  mostrarAvisoFlotante("Lubricante eliminado.", "ok");
}
