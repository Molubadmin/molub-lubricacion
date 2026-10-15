const cfg = window.MOLUB_CONFIG;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
let bootstrapping = true;

const state = {
  empresas: [],
  empresaId: "",
  equipos: [],
  actividades: [],
  tareas: [],
  cartas: [],
  elementosCartas: [],
  lubricantes: [],
  lubricanteEquipos: [],
  lubricantePresentaciones: [],
  lubricanteMovimientos: [],
  lubricanteMovimientoFormAbierto: false,
  selectedLubricanteId: "",
  lubricanteDetailMode: false,
  lubricanteTab: "equipos",
  lubricanteAsociarFormAbierto: false,
  lubricantePresentacionFormAbierto: false,
  lubricanteAliasPickerAbierto: false,
  lubricanteAliasOpciones: [],
  editandoLubricanteId: "",
  lubricanteFormAbierto: false,
  lubricanteSearch: "",
  lubricantesFiltro: { tipo: "", marca: "", area: "", estado: "" },
  perfiles: [],
  sessionRole: "SUPERVISOR",
  selectedUserId: "",
  actividadesLoading: false,
  levantamiento: null,
  fotos: [],
  fotosEmpresa: [],
  photoUrlCache: {},
  fotoCounts: {},
  levantamientoLoading: false,
  selectedEquipoId: "",
  equipoFormAbierto: false,
  editandoEquipoId: "",
  selectedTareaId: "",
  selectedExtraId: "",
  selectedHorasTecnico: "",
  selectedCartaEquipoId: "",
  selectedCartaId: "",
  cartaDetailMode: false,
  imprimiendoTodas: false,
  cartaSearch: "",
  cartaAreaFiltro: "",
  equiposAreaFiltro: "",
  vistaQr: false,
  puntosOcultosCarta: new Set(),
  actividadesFiltro: { q: "", estado: "", trabajador: "", orden: "recientes" },
  tareasFiltro: { q: "", estado: "", trabajador: "", orden: "recientes" },
  extrasFiltro: { q: "", estado: "", trabajador: "", orden: "recientes" },
  view: "dashboard",
  modulesByCompany: {},
  moduleSource: "local",
  authSession: null,
  authUser: null,
  authPerfil: null,
  authPerfiles: [],
  raciMatriz: null,
  raciDraft: null,
  raciDraftEmpresaId: ""
};

const $ = (id) => document.getElementById(id);
const MODULES = [
  { id: "levantamiento", label: "Ingresar a planta", desc: "Equipos, fotos, referencias, descripciones y avance" },
  { id: "actividades", label: "Actividades programadas", desc: "Programar trabajos por técnico, fecha, hora y prioridad" },
  { id: "tareas", label: "Asignaciones", desc: "Trabajos liberados, evidencia, revisión y cierre" },
  { id: "extras", label: "Actividades extra", desc: "Reporte de trabajos adicionales subidos por técnicos" },
  { id: "horas", label: "Horas hombre", desc: "Resumen operativo por técnico" }
  ,{ id: "cartas", label: "Cartas realizadas", desc: "Cartas de lubricación guardadas, pendientes e impresión" }
  ,{ id: "lubricantes", label: "Lubricantes", desc: "Catálogo de lubricantes dados de alta para esta empresa" }
  ,{ id: "raci", label: "Matriz RACI", desc: "Gobernanza: responsable, aprobador, consultado e informado por actividad" }
];
const MODULE_STORE = "molub_v2_modules_by_company";
const TAREA_SELECT_BASE = "id,empresa_id,usuario_id,equipo_id,actividad,descripcion,equipo_texto,prioridad,fecha_envio,hora_envio,fecha_limite,comentario,status,tipo,tipo_programacion,programada_id,asignado_nombre,asignado_rol,contratista_nombre,created_at,updated_at";
const TAREA_SELECT_CIERRE = `${TAREA_SELECT_BASE},cierre_comentario,cierre_evidencia,cierre_foto_nombre,cierre_foto_tipo,cierre_foto_data_url,cerrado_por_id,cerrado_por_nombre,fecha_cierre,revision_status,revision_comentario,revisado_por_id,revisado_por_nombre,revisado_at`;
const ACTIVIDAD_EXTRA_SELECT_BASE = "id,empresa_id,equipo_id,equipo_texto,tipo,descripcion,hora_inicio,hora_fin,horas_hombre,comentario,status,fecha,hora,created_at";
const ACTIVIDAD_EXTRA_SELECT_LAB = `${ACTIVIDAD_EXTRA_SELECT_BASE},usuario_id,usuario,usuario_nombre,usuario_rol,evidencia_texto,evidencia_foto_nombre,evidencia_foto_tipo,evidencia_foto_data_url,revision_status,revision_comentario,revisado_por_nombre,revisado_at`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, type = "") {
  const el = $("status");
  el.textContent = message;
  el.className = "status show" + (type ? " " + type : "");
}

function setStatusVisible(message, type = "") {
  setStatus(message, type);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarAvisoFlotante(message, type = "ok") {
  let toast = document.getElementById("aviso-flotante");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "aviso-flotante";
    document.body.appendChild(toast);
  }
  const icono = type === "error" ? "⚠" : type === "info" ? "⏳" : "✔";
  toast.textContent = `${icono} ${message}`;
  toast.className = `aviso-flotante show ${type}`;
  clearTimeout(toast.__timer);
  if (type !== "info") {
    toast.__timer = setTimeout(() => toast.classList.remove("show"), 3200);
  }
}

function abrirModal(html) {
  $("modal-box").innerHTML = `<button type="button" class="modal-close" title="Cerrar" onclick="cerrarModal()"></button>${html}`;
  $("modal-overlay").classList.remove("hidden");
}

function cerrarModal() {
  $("modal-overlay").classList.add("hidden");
  $("modal-box").innerHTML = "";
}

async function signedFotoUrl(path) {
  if (!path) return "";
  if (state.photoUrlCache[path]) return state.photoUrlCache[path];
  const { data, error } = await sb.storage.from("fotos").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) {
    console.warn("No se pudo firmar foto:", error.message);
    return "";
  }
  state.photoUrlCache[path] = data?.signedUrl || "";
  return state.photoUrlCache[path];
}

async function withSignedFotoUrl(row) {
  if (!row) return row;
  const path = firstValue(row, ["storage_path", "foto_storage_path", "storagePath", "fotoStoragePath"]);
  if (!path) return row;
  return { ...row, signed_url: await signedFotoUrl(path) };
}

function clearStatus() {
  $("status").className = "status";
}

function activeEmpresa() {
  return state.empresas.find(e => e.id === state.empresaId);
}

function initials(name) {
  return String(name || "MO")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "MO";
}

function applyCompanyTheme(empresa) {
  const name = String(empresa?.nombre || "").toUpperCase();
  const primary = empresa?.color_principal || (name.includes("DEACERO") ? "#111111" : "#0a1d4d");
  const accent = empresa?.color_acento || (name.includes("DEACERO") ? "#ff7a00" : "#1228ff");
  document.documentElement.style.setProperty("--blue", primary);
  document.documentElement.style.setProperty("--accent", accent);
}

function companyLogoUrl(empresa) {
  const fromDatabase = empresa?.logo_url;
  if (fromDatabase) return fromDatabase;

  const name = String(empresa?.nombre || "").toUpperCase();
  if (name.includes("COVIA")) return "./assets/logo-covia.png";
  if (name.includes("DEACERO")) return "./assets/logo-deacero.png";
  return "";
}

function renderCompanyLogo(empresa) {
  const card = $("empresa-logo-card");
  const logoUrl = companyLogoUrl(empresa);
  if (logoUrl) {
    card.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="">`;
  } else {
    card.textContent = initials(empresa?.nombre);
  }
}

function groupByArea(equipos) {
  const map = new Map();
  equipos.forEach(e => {
    const area = e.area || "SIN ÁREA";
    if (!map.has(area)) map.set(area, []);
    map.get(area).push(e);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function loadLocalModulePrefs() {
  try {
    state.modulesByCompany = JSON.parse(localStorage.getItem(MODULE_STORE) || "{}") || {};
  } catch (err) {
    state.modulesByCompany = {};
  }
}

function saveLocalModulePrefs() {
  localStorage.setItem(MODULE_STORE, JSON.stringify(state.modulesByCompany));
}

function defaultModulePrefs() {
  return Object.fromEntries(MODULES.map(m => [m.id, true]));
}

function modulesForCompany() {
  if (!state.empresaId) return {};
  if (!state.modulesByCompany[state.empresaId]) {
    state.modulesByCompany[state.empresaId] = defaultModulePrefs();
    saveLocalModulePrefs();
  }
  return state.modulesByCompany[state.empresaId];
}

function moduleEnabled(id) {
  return modulesForCompany()[id] !== false;
}

function isSupervisorMode() {
  const role = String(state.sessionRole || "").toUpperCase();
  return role.includes("SUPERVISOR") || role.includes("ADMIN") || role.includes("MASTER");
}

function activeUser() {
  return state.perfiles.find(perfil => perfil.id === state.selectedUserId)
    || (state.authPerfil?.id === state.selectedUserId ? state.authPerfil : null);
}

function displayExtraUser(act) {
  return act?.usuario_nombre || act?.usuario || act?.tecnico_nombre || act?.asignado_nombre || act?.cerrado_por_nombre || "";
}

function displayExtraPhotoData(act) {
  return act?.evidencia_foto_data_url || act?.foto_data_url || act?.cierre_foto_data_url || "";
}

function displayExtraPhotoName(act) {
  return act?.evidencia_foto_nombre || act?.foto_nombre || act?.cierre_foto_nombre || "Foto adjunta";
}

function esRevisorMolub() {
  return (state.authPerfiles || []).some(p => String(p.rol || "").toUpperCase().includes("REVISOR"));
}

function roleAllowsView(view) {
  if (esRevisorMolub()) {
    // Cuenta de revision interna de MOLUB: edita como supervisor,
    // pero solo ve estas 5 secciones - nada de actividades,
    // asignaciones ni horas hombre.
    return ["dashboard", "equipos", "levantamiento", "cartas", "lubricantes", "raci"].includes(view);
  }
  if (isSupervisorMode()) return true;
  return ["equipos", "levantamiento", "tareas", "extras", "cartas", "lubricantes", "raci"].includes(view);
}

function roleMatchesSession(rol) {
  const value = String(rol || "").toUpperCase();
  const session = String(state.sessionRole || "").toUpperCase();
  if (session.includes("MEC")) return value.includes("MEC");
  if (session.includes("ELC")) return value.includes("ELC");
  if (session.includes("CONTR")) return value.includes("CONTR");
  return true;
}

function isAuthMode() {
  return Boolean(state.authUser && state.authPerfil);
}

function roleOptionFromProfile(rol) {
  const value = String(rol || "").toUpperCase();
  if (value.includes("SUPERVISOR") || value.includes("ADMIN") || value.includes("MASTER")) return "SUPERVISOR";
  if (value.includes("ELC") || value.includes("ELECT")) return "TECNICO_ELC";
  if (value.includes("CONTR")) return "TECNICO_CONTR";
  return "TECNICO_MEC";
}

function authDisplayName() {
  return state.authPerfil?.nombre || state.authUser?.email || "Sesión real";
}

function syncAuthLockedControls() {
  const locked = Boolean(state.authUser);
  const lockCompany = locked && !puedeElegirEmpresa();
  if ($("role-select")) $("role-select").disabled = locked;
  if ($("empresa-select")) $("empresa-select").disabled = lockCompany;
  document.querySelector(".role-picker")?.classList.toggle("hidden", locked);
  document.querySelector(".company-picker")?.classList.toggle("hidden", lockCompany);
}

function renderAuthPanel() {
  const logged = Boolean(state.authUser);
  const locked = isAuthMode();
  $("auth-login-form")?.classList.toggle("hidden", logged);
  $("auth-session")?.classList.toggle("hidden", !logged);
  if ($("auth-user-label")) $("auth-user-label").textContent = logged ? authDisplayName() : "Sin sesión";
  $("sidebar-auth-session")?.classList.toggle("hidden", !logged);
  if ($("sidebar-auth-user-label")) $("sidebar-auth-user-label").textContent = logged ? authDisplayName() : "Sin sesión";

  const rolMostrado = esAdminMolub() ? "Admin MOLUB" : esComisionista() ? "Comisionista" : esRevisorMolub() ? "Revisor MOLUB" : roleLabel(state.sessionRole);
  const msg = $("auth-message");
  if (msg) {
    msg.textContent = locked
      ? `${authDisplayName()} · ${rolMostrado} · ${activeEmpresa()?.nombre || "sin empresa"}`
      : logged
        ? "Sesión activa sin perfil vinculado. Revisa el Paso 19."
        : "Acceso por rol activo.";
    msg.style.color = locked ? "var(--green)" : "var(--muted)";
  }

  const sessionBox = document.querySelector(".session span");
  if (sessionBox) sessionBox.textContent = locked ? rolMostrado : "Acceso por rol";
  syncAuthLockedControls();
}

async function fetchAuthPerfiles(user) {
  if (!cfg.tables.perfiles || !user) return [];

  // Una persona puede tener mas de una fila aqui: un comisionista, por
  // ejemplo, tiene una fila por cada cliente que cerro (mismo login,
  // una empresa_id distinta en cada una). Por eso esto ya no usa
  // maybeSingle() - se traen todas las filas activas de este usuario.
  const { data, error } = await sb
    .from(cfg.tables.perfiles)
    .select("id,empresa_id,nombre,rol,activo,email,auth_user_id")
    .eq("activo", true)
    .eq("auth_user_id", user.id);

  if (error) console.warn("No se pudo buscar perfil por auth_user_id:", error.message);
  if (data && data.length) return data;

  const email = String(user.email || "").trim();
  if (!email) return [];

  const fallback = await sb
    .from(cfg.tables.perfiles)
    .select("id,empresa_id,nombre,rol,activo,email,auth_user_id")
    .eq("activo", true)
    .ilike("email", email);

  if (fallback.error) {
    console.warn("No se pudo buscar perfil por email:", fallback.error.message);
    return [];
  }
  return fallback.data || [];
}

function elegirAuthPerfilParaEmpresa(empresaId) {
  const perfiles = state.authPerfiles || [];
  return perfiles.find(p => String(p.empresa_id) === String(empresaId)) || perfiles[0] || null;
}

function esAdminMolub() {
  return (state.authPerfiles || []).some(p => String(p.rol || "").toUpperCase().includes("MOLUB"));
}

function esComisionista() {
  return (state.authPerfiles || []).some(p => String(p.rol || "").toUpperCase().includes("COMISION"));
}

function empresasPermitidasAuth() {
  // null = puede ver todas (admin MOLUB). Si no, regresa la lista de
  // empresa_id que le corresponden a este login (una sola para un
  // tecnico/supervisor normal, varias para un comisionista).
  if (esAdminMolub()) return null;
  return [...new Set((state.authPerfiles || []).map(p => p.empresa_id).filter(Boolean))];
}

function puedeElegirEmpresa() {
  if (!state.authUser) return false;
  const permitidas = empresasPermitidasAuth();
  return permitidas === null || permitidas.length > 1;
}

async function applyAuthSession(session, reload = false) {
  state.authSession = session || null;
  state.authUser = session?.user || null;
  state.authPerfiles = state.authUser ? await fetchAuthPerfiles(state.authUser) : [];
  state.authPerfil = state.authPerfiles[0] || null;

  if (state.authPerfil) {
    // Un admin MOLUB o un comisionista pueden ver mas de una empresa:
    // solo se le pone una por default la primera vez (si no hay
    // ninguna elegida todavia), sin regresarlo a su empresa de origen
    // cada vez que se refresca la sesion si ya cambio a ver otra.
    if (!puedeElegirEmpresa() || !state.empresaId) {
      state.empresaId = state.authPerfil.empresa_id || state.empresaId;
    }
    state.authPerfil = elegirAuthPerfilParaEmpresa(state.empresaId);
    state.sessionRole = roleOptionFromProfile(state.authPerfil.rol);
    state.selectedUserId = isSupervisorMode() ? "" : state.authPerfil.id;
    if ($("role-select")) $("role-select").value = state.sessionRole;
    if ($("empresa-select") && state.empresaId) $("empresa-select").value = state.empresaId;
  } else if (state.authUser) {
    // Cuenta real sin perfil vinculado en Supabase: nunca debe caer en
    // Supervisor por default, aunque esa fuera la ultima seleccion.
    state.sessionRole = "TECNICO_MEC";
    state.selectedUserId = "";
    if ($("role-select")) $("role-select").value = state.sessionRole;
  }

  renderAuthPanel();
  if (reload && state.empresas.length) {
    state.selectedEquipoId = "";
    await loadEquipos();
  }
}

async function initAuthSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.warn("No se pudo leer la sesion:", error.message);
    renderAuthPanel();
    return;
  }
  await applyAuthSession(data?.session || null, false);
}

async function loginAuth() {
  const email = ($("auth-email")?.value || "").trim().toLowerCase();
  const password = $("auth-password")?.value || "";
  if (!email || !password) {
    setStatus("Escribe correo y contraseña para entrar.", "warn");
    return;
  }

  setStatus("Validando acceso real...");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(error.message || "No se pudo iniciar sesion.", "error");
    renderAuthPanel();
    return;
  }

  await applyAuthSession(data?.session || null, true);
  setStatus(`Sesión iniciada: ${authDisplayName()}.`, "ok");
}

async function logoutAuth() {
  await sb.auth.signOut();
  state.authSession = null;
  state.authUser = null;
  state.authPerfil = null;
  state.authPerfiles = [];
  state.selectedUserId = "";
  renderAuthPanel();
  mostrarGateAcceso();
  setStatus("Sesión cerrada.", "ok");
}

function mostrarGateAcceso() {
  if ($("gate-year")) $("gate-year").textContent = new Date().getFullYear();
  document.body.classList.add("gate-activo");
  $("acceso-gate")?.classList.remove("hidden");
}

function ocultarGateAcceso() {
  document.body.classList.remove("gate-activo");
  $("acceso-gate")?.classList.add("hidden");
}

function toggleGatePassword() {
  const input = $("gate-password");
  const btn = $("gate-password-toggle");
  if (!input || !btn) return;
  const oculto = input.type === "password";
  input.type = oculto ? "text" : "password";
  btn.textContent = oculto ? "🙈" : "👁";
}

function roleLabel(value) {
  const map = {
    SUPERVISOR: "Supervisor",
    TECNICO_MEC: "Técnico mecánico",
    TECNICO_ELC: "Técnico eléctrico",
    TECNICO_CONTR: "Contratista"
  };
  return map[String(value || "").toUpperCase()] || "Usuario";
}

function mostrarErrorGate(mensaje) {
  const el = $("gate-error");
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove("hidden");
}

function ocultarErrorGate() {
  $("gate-error")?.classList.add("hidden");
}

function syncUserPicker() {
  const select = $("user-select");
  if (!select) return;
  const picker = select.closest(".user-picker");
  const topbar = document.querySelector(".topbar");
  const supervisor = isSupervisorMode();
  const locked = isAuthMode();
  picker?.classList.toggle("hidden", supervisor);
  topbar?.classList.toggle("no-user", supervisor);

  if (supervisor) {
    select.innerHTML = `<option value="">Supervisor/Admin</option>`;
    state.selectedUserId = "";
    select.disabled = true;
    syncAuthLockedControls();
    return;
  }

  let users = state.perfiles.filter(perfil => roleMatchesSession(perfil.rol));
  if (locked && state.authPerfil && !users.some(perfil => perfil.id === state.authPerfil.id)) {
    users = [state.authPerfil, ...users];
  }

  select.innerHTML = users.length
    ? users.map(perfil => `<option value="${escapeHtml(perfil.id)}">${escapeHtml(perfil.nombre)}</option>`).join("")
    : `<option value="">Sin usuarios de este rol</option>`;

  if (locked && state.authPerfil) {
    state.selectedUserId = state.authPerfil.id;
  } else if (!users.some(perfil => perfil.id === state.selectedUserId)) {
    state.selectedUserId = users[0]?.id || "";
  }
  select.value = state.selectedUserId;
  select.disabled = locked;
  syncAuthLockedControls();
}

// visibleTareas, selectedTarea viven ahora en tareas.js.
function visibleActividadesExtra() {
  if (isSupervisorMode()) return state.actividades;
  const user = activeUser();
  if (!user) return [];
  return state.actividades.filter(act => act.usuario_id === user.id || String(act.usuario || "").toUpperCase() === String(user.nombre || "").toUpperCase());
}

function ordenarPorFecha(rows, orden, camposFecha) {
  const valorFecha = row => {
    for (const campo of camposFecha) {
      if (row[campo]) return new Date(row[campo]).getTime() || 0;
    }
    return 0;
  };
  return rows.slice().sort((a, b) => {
    const diferencia = valorFecha(b) - valorFecha(a);
    return orden === "antiguos" ? -diferencia : diferencia;
  });
}

function filtrarPorTextoYEstado(rows, filtro, camposTexto, campoTrabajador) {
  const texto = String(filtro.q || "").trim().toLowerCase();
  const estado = filtro.estado || "";
  const trabajador = filtro.trabajador || "";
  return rows.filter(row => {
    const matchTexto = !texto || camposTexto.map(campo => row[campo] || "").join(" ").toLowerCase().includes(texto);
    const matchEstado = !estado || String(row.status || "").toLowerCase() === estado;
    const valorTrabajador = campoTrabajador ? (typeof campoTrabajador === "function" ? campoTrabajador(row) : row[campoTrabajador]) : "";
    const matchTrabajador = !trabajador || String(valorTrabajador || "") === trabajador;
    return matchTexto && matchEstado && matchTrabajador;
  });
}

function opcionesTrabajador(rows, campoOFn, actual) {
  return opcionesDistintas(rows, campoOFn, actual, "Todos los trabajadores");
}

// tareasFiltradas vive ahora en tareas.js.

function actividadesProgramadasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.actividadesFiltro, ["actividad", "descripcion", "equipo_texto", "asignado_nombre"], "asignado_nombre");
  return ordenarPorFecha(filtradas, state.actividadesFiltro.orden, ["fecha_envio", "created_at"]);
}

function extrasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.extrasFiltro, ["descripcion", "equipo_texto", "comentario"], displayExtraUser);
  return ordenarPorFecha(filtradas, state.extrasFiltro.orden, ["fecha", "created_at"]);
}

// actualizarFiltroTareas vive ahora en tareas.js.

function actualizarFiltroActividades(campo, valor) {
  state.actividadesFiltro[campo] = valor;
  renderModules();
}

function actualizarFiltroExtras(campo, valor) {
  state.extrasFiltro[campo] = valor;
  renderModules();
}

function opcionesOrden(actual) {
  return `
    <option value="recientes" ${actual !== "antiguos" ? "selected" : ""}>Más recientes primero</option>
    <option value="antiguos" ${actual === "antiguos" ? "selected" : ""}>Más antiguos primero</option>`;
}

function selectedExtra() {
  const extras = visibleActividadesExtra();
  if (!extras.length) {
    state.selectedExtraId = "";
    return null;
  }
  if (!extras.some(act => act.id === state.selectedExtraId)) {
    state.selectedExtraId = extras[0].id;
  }
  return extras.find(act => act.id === state.selectedExtraId) || extras[0];
}

function syncNavigationForRole() {
  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle("hidden", !roleAllowsView(button.dataset.view));
  });
  syncUserPicker();
  if (!roleAllowsView(state.view)) {
    setView(esRevisorMolub() ? "dashboard" : "tareas");
  }
}

async function loadEmpresas() {
  setStatus("Cargando empresas...");
  const { data, error } = await sb
    .from(cfg.tables.empresas)
    .select("*")
    .order("nombre");
  if (error) throw error;
  state.empresas = data || [];
  const select = $("empresa-select");
  // Un comisionista solo debe ver en el selector las empresas de SUS
  // clientes, no las de todos. Un admin MOLUB (empresasPermitidasAuth
  // regresa null) si ve todas.
  const permitidas = state.authUser ? empresasPermitidasAuth() : null;
  const empresasVisibles = permitidas === null
    ? state.empresas
    : state.empresas.filter(e => permitidas.includes(e.id));
  select.innerHTML = empresasVisibles
    .map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nombre)}</option>`)
    .join("");
  state.empresaId = state.authPerfil?.empresa_id || state.empresaId || empresasVisibles[0]?.id || "";
  select.value = state.empresaId;
}

async function loadEmpresaModulos() {
  state.moduleSource = "local";
  const table = cfg.tables.empresaModulos;
  if (!table || !state.empresaId) return;

  const { data, error } = await sb
    .from(table)
    .select("empresa_id,modulo,activo")
    .eq("empresa_id", state.empresaId);

  if (error) {
    console.warn("empresa_modulos no disponible, usando laboratorio local:", error.message);
    return;
  }

  const prefs = defaultModulePrefs();
  (data || []).forEach(row => {
    prefs[row.modulo] = row.activo !== false;
  });
  state.modulesByCompany[state.empresaId] = prefs;
  state.moduleSource = "supabase";
}

async function saveEmpresaModulo(id, activo) {
  const table = cfg.tables.empresaModulos;
  if (!table || !state.empresaId) return false;
  const { error } = await sb
    .from(table)
    .upsert({
      empresa_id: state.empresaId,
      modulo: id,
      activo
    }, { onConflict: "empresa_id,modulo" });

  if (error) {
    console.warn("No se pudo guardar modulo en Supabase:", error.message);
    return false;
  }
  state.moduleSource = "supabase";
  return true;
}

async function toggleModule(id) {
  const prefs = modulesForCompany();
  prefs[id] = !moduleEnabled(id);
  saveLocalModulePrefs();
  const saved = await saveEmpresaModulo(id, prefs[id]);
  if (!saved) {
    setStatus("Módulo guardado solo en este navegador. Falta crear o autorizar empresa_modulos en Supabase.", "warn");
  } else {
    setStatus("Módulo guardado en Supabase.");
    setTimeout(clearStatus, 1600);
  }
  if (state.view === id && !prefs[id]) setView("dashboard");
  render();
}

let loadEquiposEnCurso = null;

function loadEquipos() {
  // Supabase a veces dispara mas de un evento de sesion seguido
  // (por ejemplo al refrescar el token), y cada uno intentaba
  // recargar todo por su cuenta. Si dos cargas corrian encimadas,
  // el conteo de fotos por equipo se sumaba dos veces (6 fotos
  // aparecian como 12) porque ambas escribian sobre el mismo
  // objeto en memoria. Ahora, si ya hay una carga en curso, todos
  // se unen a esa misma en vez de disparar otra por separado.
  if (loadEquiposEnCurso) return loadEquiposEnCurso;
  loadEquiposEnCurso = loadEquiposInterno().finally(() => {
    loadEquiposEnCurso = null;
  });
  return loadEquiposEnCurso;
}

async function loadEquiposInterno() {
  if (!state.empresaId) return;
  setStatus("Cargando equipos de la empresa seleccionada...");
  // Antes esto hacia 10 viajes de red uno detras de otro (cada uno
  // esperando a que terminara el anterior), lo cual hacia lenta la
  // entrada a la app. Ninguno de estos depende del resultado de otro
  // al momento de pedirlo, asi que se piden todos al mismo tiempo.
  const equiposQuery = sb
    .from(cfg.tables.equipos)
    .select("id,empresa_id,area,proceso,id_tag,nombre_equipo,criticidad,sistema,activo")
    .eq("empresa_id", state.empresaId)
    .order("area")
    .order("id_tag");

  const [equiposResult] = await Promise.all([
    equiposQuery,
    loadEmpresaModulos(),
    loadFotoCounts(),
    loadActividades(),
    loadTareas(),
    loadCartas(),
    loadElementosCartas(),
    loadLubricantes(),
    loadLubricanteEquipos(),
    loadLubricantePresentaciones(),
    loadLubricanteMovimientos(),
    loadPerfiles(),
    loadRaciMatriz()
  ]);
  if (equiposResult.error) throw equiposResult.error;
  state.equipos = equiposResult.data || [];
  if (!state.equipos.some(e => e.id === state.selectedEquipoId)) {
    state.selectedEquipoId = state.equipos[0]?.id || "";
  }
  // Los renglones de arriba acaban de reemplazar fotosEmpresa y
  // elementosCartas por su version liviana (sin foto). Si en este
  // momento hay una carta abierta en pantalla, sus fotos completas
  // se acaban de perder aunque nadie haya tocado nada - por ejemplo,
  // si esta recarga la disparo otra pestaña, un guardado en otra
  // parte de la app, o el refresco automatico de la sesion. Se
  // vuelven a pedir aqui para que la pantalla no se quede rota.
  if (state.cartaDetailMode && state.selectedCartaId) {
    const cartaAbierta = selectedCarta();
    const equipoAbierto = cartaEquipo(cartaAbierta);
    if (cartaAbierta && equipoAbierto) {
      await Promise.all([
        cargarFotosDeEquipoConUrl(equipoAbierto.id),
        cargarFotosDeElementosCarta(cartaAbierta.id, equipoAbierto.id)
      ]);
    }
  }
  clearStatus();
  render();
}

async function loadCartas() {
  state.cartas = [];
  if (!cfg.tables.cartas || !state.empresaId) return;

  const { data, error } = await sb
    .from(cfg.tables.cartas)
    .select("*")
    .eq("empresa_id", state.empresaId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.warn("No se pudieron cargar cartas:", error.message);
    setStatus("Cartas aún no está preparada en Supabase. Corre el Paso 13 cuando vayamos a probar.", "warn");
    return;
  }
  state.cartas = data || [];
}

// El catalogo de Lubricantes (carga, catalogo/filtros, ficha con sus
// 5 pestanas, inventario, documentacion, historial de entradas OC)
// vive ahora en su propio archivo, lubricantes.js, cargado antes
// que este.
const ELEMENTOS_CARTA_SELECT_LISTA = "id,empresa_id,carta_id,equipo_id,npunto,orden,elemento,nombre,descripcion,lubricante,lub_inicial,relub,tipo,gramos,bombazos,litros,frecuencia,tarea,intervalo_muestreo,temp_real,created_at,updated_at";

async function loadElementosCartas() {
  state.elementosCartas = [];
  if (!cfg.tables.elementosCartas || !state.empresaId) return;

  // Nota: igual que con lubricantes y fotos, aqui NO se pide la foto
  // de cada punto (foto_url puede traer la imagen completa en
  // base64). Con cartas ya guardadas puede haber cientos de estas
  // filas, y se recargaban completas en cada loadEquipos(). La foto
  // se trae aparte, solo para la carta que se este viendo (ver
  // cargarFotosDeElementosCarta).
  const { data, error } = await sb
    .from(cfg.tables.elementosCartas)
    .select(ELEMENTOS_CARTA_SELECT_LISTA)
    .eq("empresa_id", state.empresaId)
    .limit(1500);

  if (error) {
    console.warn("No se pudieron cargar elementos de cartas:", error.message);
    return;
  }
  state.elementosCartas = data || [];
}

async function cargarFotosDeElementosCarta(cartaId, equipoId) {
  if (!cfg.tables.elementosCartas) return;
  const filtros = [];
  if (cartaId && !String(cartaId).startsWith("auto-") && !String(cartaId).startsWith("pendiente-")) filtros.push(`carta_id.eq.${cartaId}`);
  if (equipoId) filtros.push(`equipo_id.eq.${equipoId}`);
  if (!filtros.length) return;
  const yaCompletos = (state.elementosCartas || []).some(el =>
    (String(el.carta_id) === String(cartaId) || String(el.equipo_id) === String(equipoId)) && el.__fotoCargada);
  if (yaCompletos) return;
  const { data, error } = await sb
    .from(cfg.tables.elementosCartas)
    .select("id,foto_url,foto_storage_path")
    .eq("empresa_id", state.empresaId)
    .or(filtros.join(","));
  if (error) {
    console.warn("No se pudieron cargar las fotos de los puntos de esta carta:", error.message);
    return;
  }
  // Las fotos viejas (migradas) viven en Storage con una liga firmada
  // que vence cada semana; withSignedFotoUrl la vuelve a generar
  // fresca cada vez que se pide. Sin esto, esas fotos se ven rotas
  // aunque el dato exista en la base.
  const filasFirmadas = await Promise.all((data || []).map(withSignedFotoUrl));
  const porId = new Map(filasFirmadas.map(row => [String(row.id), row]));
  state.elementosCartas = (state.elementosCartas || []).map(el =>
    porId.has(String(el.id)) ? { ...el, ...porId.get(String(el.id)), __fotoCargada: true } : el
  );
}

async function loadActividades() {
  state.actividades = [];
  if (!cfg.tables.actividades || !state.empresaId) return;

  let { data, error } = await sb
    .from(cfg.tables.actividades)
    .select(ACTIVIDAD_EXTRA_SELECT_LAB)
    .eq("empresa_id", state.empresaId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("No se pudieron cargar campos extra de laboratorio, intentando carga basica:", error.message);
    const fallback = await sb
      .from(cfg.tables.actividades)
      .select(ACTIVIDAD_EXTRA_SELECT_BASE)
      .eq("empresa_id", state.empresaId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (fallback.error) {
      console.warn("No se pudieron cargar actividades:", fallback.error.message);
      return;
    }
    data = fallback.data || [];
    setStatus("Actividades extra cargaron, pero falta correr el Paso 11 para evidencia y usuario.", "warn");
  }
  state.actividades = data || [];
}

async function loadTareas() {
  state.tareas = [];
  if (!cfg.tables.tareas || !state.empresaId) return;

  let { data, error } = await sb
    .from(cfg.tables.tareas)
    .select(TAREA_SELECT_CIERRE)
    .eq("empresa_id", state.empresaId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("No se pudieron cargar campos de cierre, intentando tareas basicas:", error.message);
    const fallback = await sb
      .from(cfg.tables.tareas)
      .select(TAREA_SELECT_BASE)
      .eq("empresa_id", state.empresaId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (fallback.error) {
      console.warn("No se pudieron cargar tareas asignadas:", fallback.error.message);
      return;
    }
    data = fallback.data || [];
    setStatus("Las tareas cargaron, pero falta correr el Paso 10 para guardar cierres.", "warn");
  }
  state.tareas = data || [];
}

// seleccionarTarea, eliminarTarea, renderPanelCierre viven ahora en
// tareas.js.

// Las fotos se guardan como texto (base64) dentro de la base de datos,
// asi que cada vez que alguien las abre viajan completas por internet
// (egress). Una foto de celular pesa 3-6 MB; para una carta con 1600 px
// de ancho se ve igual y pesa ~10 veces menos. Solo se reduce si de
// verdad ayuda: PDFs, otros formatos o fotos ya chicas pasan tal cual, y
// si algo falla al comprimir se usa el archivo original.
const FOTO_MAX_LADO = 1600;
const FOTO_CALIDAD_JPEG = 0.8;
const FOTO_UMBRAL_BYTES = 250 * 1024;

async function comprimirImagenSiConviene(file) {
  try {
    if (!file || !/^image\/(jpeg|png)$/.test(file.type) || file.size < FOTO_UMBRAL_BYTES) return file;
    let bitmap;
    if (window.createImageBitmap) {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } else {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }
    const ancho = bitmap.width;
    const alto = bitmap.height;
    const escala = Math.min(1, FOTO_MAX_LADO / Math.max(ancho, alto));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(ancho * escala));
    canvas.height = Math.max(1, Math.round(alto * escala));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type, FOTO_CALIDAD_JPEG));
    if (!blob || blob.type !== file.type || blob.size >= file.size * 0.9) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch (err) {
    console.warn("No se pudo comprimir la imagen, se usa la original:", err);
    return file;
  }
}

async function fileToDataUrl(original) {
  const file = await comprimirImagenSiConviene(original);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// previewCierreFoto, guardarCierreTarea, revisarCierreTarea viven
// ahora en tareas.js.
async function previewFotoInput(input, previewId) {
  const preview = $(previewId);
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
      <img src="${escapeHtml(dataUrl)}" alt="Vista previa">
      <small>${escapeHtml(file.name)}</small>
    </div>
  `;
}

function previewExtraFoto(input) {
  return previewFotoInput(input, "extra-foto-preview");
}

function previewExtraFixFoto(input) {
  return previewFotoInput(input, "extra-fix-foto-preview");
}

// Horas hombre (horasEntre, numericHours, horasPorTecnico,
// horasResumen, seleccionarHorasTecnico, seleccionarHorasExtra,
// horasDetalleTecnico) vive ahora en su propio archivo, horas.js,
// cargado antes que este.
function firstValue(obj, keys, fallback = "") {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function campoDetalle(label, valor) {
  return `<div class="detail-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valor || "-")}</strong></div>`;
}

function equipoDeTexto(texto) {
  const buscado = String(texto || "").trim().toUpperCase();
  if (!buscado) return null;
  return state.equipos.find(e => String(e.id_tag || "").toUpperCase() === buscado || String(e.nombre_equipo || "").toUpperCase() === buscado)
    || state.equipos.find(e => buscado.includes(String(e.id_tag || "").toUpperCase()) && e.id_tag);
}

function pillEstado(status) {
  const valor = String(status || "pendiente").toLowerCase();
  let clase = "";
  let texto = status || "Pendiente";
  if (valor.includes("aprobad")) { clase = "ok"; texto = "Aprobada"; }
  else if (valor.includes("rechazad")) { clase = "error"; texto = "Rechazada"; }
  else if (valor.includes("revision")) { clase = "warn"; texto = "En revisión"; }
  else { texto = "Pendiente"; }
  return `<span class="status-pill ${clase}">${escapeHtml(texto)}</span>`;
}

// Las Cartas de lubricacion (cartaForEquipo, cartaEquipo, cartaTag,
// cartaStatus, elementosForCarta, cartasFiltradas, seleccionarCarta,
// legacyCardBodyHtml, construirPanelCarta, imprimirCarta,
// descargarTodasLasCartas, mostrarQrCarta, verFotoAmpliada,
// renderCartaEditorSection, guardarCartaCompleta, etc.) viven ahora
// en su propio archivo, cartas.js, cargado antes que este.

// Las Actividades extra (guardarActividadExtra, seleccionarExtra,
// corregirActividadExtra, revisarActividadExtra, eliminarActividadExtra,
// renderPanelExtra) viven ahora en su propio archivo,
// actividades-extra.js, cargado antes que este.

async function loadPerfiles() {
  state.perfiles = [];
  if (!cfg.tables.perfiles || !state.empresaId) return;

  const { data, error } = await sb
    .from(cfg.tables.perfiles)
    .select("id,empresa_id,nombre,rol,activo,email,auth_user_id")
    .eq("empresa_id", state.empresaId)
    .eq("activo", true)
    .order("nombre");

  if (error) {
    console.warn("No se pudieron cargar trabajadores:", error.message);
    return;
  }
  state.perfiles = (data || []).filter(perfil => {
    const rol = String(perfil.rol || "").toUpperCase();
    return !rol.includes("SUPERVISOR");
  });
  syncUserPicker();
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

function filtrarTrabajadores(tipo) {
  const filtro = String(tipo || "todos").toUpperCase();
  document.querySelectorAll(".worker-row").forEach(row => {
    const rol = row.dataset.workerRole || "";
    row.style.display = filtro !== "TODOS" && !rol.includes(filtro) ? "none" : "";
  });
  document.querySelectorAll("[data-worker-filter]").forEach(button => {
    button.classList.toggle("active", String(button.dataset.workerFilter || "").toUpperCase() === filtro);
  });
}

function limpiarTrabajadores() {
  document.querySelectorAll("[data-worker-id]").forEach(input => { input.checked = false; });
  const contratistas = $("actividad-contratistas");
  if (contratistas) contratistas.value = "";
  filtrarTrabajadores("todos");
}

function bindWorkerTools() {
  document.querySelectorAll("[data-worker-filter]").forEach(button => {
    button.addEventListener("click", () => filtrarTrabajadores(button.dataset.workerFilter));
  });
  document.querySelectorAll("[data-worker-clear]").forEach(button => {
    button.addEventListener("click", limpiarTrabajadores);
  });
  filtrarTrabajadores("todos");
}

// Las fotos/levantamiento de equipos (loadFotoCounts,
// cargarFotosDeEquipoConUrl, fotosPuntosDeEquipo, autoCartaFromEquipo,
// loadLevantamientoForSelectedEquipo, guardarFotoLevantamiento, etc.)
// y el CRUD/render de Equipos (mas abajo, despues de renderDashboard)
// viven ahora en equipos.js, cargado antes que este.

function renderDashboard() {
  const empresa = activeEmpresa();
  const equipos = state.equipos;
  const areas = groupByArea(equipos);
  const activeModules = MODULES.filter(m => moduleEnabled(m.id));
  applyCompanyTheme(empresa);
  renderCompanyLogo(empresa);
  $("session-company").textContent = empresa?.nombre || "Sin empresa";
  $("empresa-nombre").textContent = empresa?.nombre || "Selecciona una empresa";
  $("empresa-sub").textContent = empresa?.direccion || "Panel general de la empresa activa.";
  $("metric-total").textContent = equipos.length;
  $("card-total").textContent = equipos.length;
  $("card-areas").textContent = areas.length;
  $("card-crit-a").textContent = equipos.filter(e => String(e.criticidad || "").toUpperCase() === "A").length;
  $("card-modulos").textContent = activeModules.length;
  $("modules-count").textContent = `${activeModules.length} activos`;
  $("module-source-label").textContent = state.moduleSource === "supabase" ? "Guardando en Supabase" : "Laboratorio local";
  $("modules-strip").innerHTML = MODULES.map(m => `
    <div class="module-chip ${moduleEnabled(m.id) ? "" : "off"}">
      <div>
        <strong>${escapeHtml(m.label)}</strong>
        <span>${escapeHtml(m.desc)}</span>
      </div>
      <span class="pill">${moduleEnabled(m.id) ? "Activo" : "Inactivo"}</span>
    </div>
  `).join("");
  $("area-count").textContent = `${areas.length} áreas`;
  $("areas-list").innerHTML = areas.map(([area, items]) => {
    const conCarta = items.filter(equipo => Boolean(cartaForEquipo(equipo.id))).length;
    const porcentaje = items.length ? Math.round((conCarta / items.length) * 100) : 0;
    return `
    <div class="area-row">
      <div class="area-top">
        <strong>${escapeHtml(area)}</strong>
        <span class="muted">${conCarta}/${items.length} cartas guardadas</span>
      </div>
      <div class="bar"><div class="fill" style="width:${porcentaje}%"></div></div>
    </div>
  `;
  }).join("") || `<div class="area-row muted">Esta empresa no tiene equipos cargados todavía.</div>`;
}

// guardarEquipo, eliminarEquipo, formularioEquipoHtml,
// abrirFormularioEquipo, editarEquipo, toggleEquipoForm,
// renderEquipos, filtrarEquiposPorArea, selectEquipo, volverAEquipos
// e irACartaDeEquipo viven ahora en equipos.js (ver nota arriba de
// renderDashboard).

function renderModules() {
  $("module-settings").innerHTML = MODULES.map(m => `
    <div class="module-toggle ${moduleEnabled(m.id) ? "enabled" : ""}" onclick="toggleModule('${m.id}')">
      <div>
        <strong>${escapeHtml(m.label)}</strong>
        <span>${escapeHtml(m.desc)}</span>
      </div>
      <div class="switch" aria-hidden="true"></div>
    </div>
  `).join("");

  document.querySelectorAll(".module-view").forEach(view => {
    const id = view.dataset.module;
    const module = MODULES.find(m => m.id === id);
    const details = {
      levantamiento: "Flujo para evidencia de equipo completo, placa, equipos relacionados, descripción y estado del levantamiento.",
      cartas: "Consulta de cartas guardadas, cartas sin guardar, impresión/PDF y detalle por equipo.",
      actividades: "Formulario para programar trabajos por adelantado, seleccionar trabajadores, fecha, hora, prioridad y comentario al técnico.",
      tareas: "Asignación de trabajo, evidencia del técnico, aprobación o rechazo, cierre y seguimiento por rol.",
      extras: "Reporte de trabajos no programados que el técnico, eléctrico o contratista sube desde campo.",
      horas: "Resumen por técnico, período, actividad y empresa para supervisión operativa."
    };
    if (!moduleEnabled(id)) {
      view.querySelector(".module-panel").innerHTML = `
        <div>
          <p class="eyebrow">Módulo inactivo</p>
          <h2>${escapeHtml(module?.label || id)}</h2>
          <p>Este apartado esta apagado para la empresa seleccionada. Activalo en Modulos por empresa.</p>
        </div>
        <button onclick="setView('modulos')">Activar modulo</button>`;
    } else {
      if (id === "levantamiento") {
        const equipo = selectedEquipo();
        const status = state.levantamiento?.completo === true
          ? "Completo"
          : state.levantamiento
            ? "Pendiente"
            : "Sin levantamiento";
      const fotos = fotosLevantamientoParaEquipo(equipo);
      const fotosReales = new Set((state.fotos || []).map(item => String(item.id)));
      const fotosHtml = fotos.length ? fotos.map(foto => {
        const src = fotoSrc(foto);
        const tituloCrudo = String(foto.categoria || foto.tipo || foto.file_name || "Foto");
        const title = esFotoEquipo(foto) || /^foto[\s_]?equipo$/i.test(tituloCrudo)
          ? "Foto completa del equipo"
          : tituloCrudo;
        const puedeEliminar = fotosReales.has(String(foto.id));
        const botonEliminar = puedeEliminar
          ? `<button class="photo-delete-button" type="button" title="Eliminar foto" aria-label="Eliminar foto" onclick="event.stopPropagation(); eliminarFotoLevantamiento('${escapeHtml(String(foto.id))}')">&times;</button>`
          : "";
        return `<article class="photo-card"${src ? ` onclick="verFotoDesdeCard(this)"` : ""}>
          ${botonEliminar}
          ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer">` : `<div class="photo-empty">Archivo en Storage</div>`}
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(foto.file_name || foto.storage_path || "Sin nombre de archivo")}</span>
        </article>`;
        }).join("") : `
          <div class="photo-empty wide">Aún no hay fotos guardadas para este equipo. Toma o adjunta la primera foto.</div>
        `;
        view.querySelector(".module-panel").innerHTML = equipo ? `
          <div>
            <div class="lift-toolbar">
              <button type="button" class="back-action" title="Regresar a Ingresar a planta" onclick="volverAEquipos()">&#8592;</button>
              ${fotos.length ? `<button type="button" class="ver-carta-action" onclick="irACartaDeEquipo('${escapeHtml(equipo.id)}')">Ver carta de lubricación →</button>` : ""}
            </div>
            <p class="eyebrow">Levantamiento del equipo</p>
            <h2>${escapeHtml(equipo.id_tag || "SIN TAG")}</h2>
            <p><strong>${escapeHtml(equipo.nombre_equipo || "Sin nombre")}</strong></p>
            <p>${escapeHtml(equipo.area || "Sin área")} - ${escapeHtml(equipo.proceso || "Sin proceso")}</p>
            <div class="lift-meta">
              <span class="pill">${escapeHtml(status)}</span>
              <span class="muted">${state.levantamientoLoading ? "Cargando fotos..." : `${fotos.length} fotos`}</span>
            </div>
            ${state.levantamiento?.descripcion && !/migrad/i.test(state.levantamiento.descripcion) ? `<p>${escapeHtml(state.levantamiento.descripcion)}</p>` : ""}
            ${renderLubricantesDeEquipo(equipo.id)}
            <div class="photo-grid" aria-label="Fotos de levantamiento">${state.levantamientoLoading ? `<div class="photo-empty wide">Cargando evidencia...</div>` : fotosHtml}</div>
          </div>
          <div class="photo-uploader">
            <strong>Agregar foto de levantamiento</strong>
            <label>Tipo de foto
              <select id="levantamiento-categoria">
                <option value="foto_equipo">Foto completa del equipo</option>
                <option value="placa">Placa</option>
                <option value="punto_lubricacion">Punto de lubricación</option>
                <option value="referencia">Referencia</option>
                <option value="otra">Otra</option>
              </select>
            </label>
            <div class="photo-input-row">
              <label>Tomar foto
                <input id="levantamiento-foto-camara" type="file" accept="image/*" capture="environment">
              </label>
              <label>Adjuntar archivo
                <input id="levantamiento-foto-archivo" type="file" accept="image/*">
              </label>
            </div>
            <button onclick="guardarFotoLevantamiento()">Guardar foto</button>
          </div>` : `
          <div>
            <p class="eyebrow">Levantamiento</p>
            <h2>Selecciona un equipo</h2>
            <p>Primero elige un equipo en el modulo Equipos para ver su levantamiento.</p>
          </div>
          <button onclick="setView('equipos')">Ir a equipos</button>`;
        return;
      }
      if (id === "actividades") {
        if (!isSupervisorMode()) {
          view.querySelector(".module-panel").innerHTML = `
            <div>
              <p class="eyebrow">Módulo de supervisor</p>
              <h2>Actividades programadas</h2>
              <p>Este apartado es para que supervisor/admin programe trabajos y los libere al técnico.</p>
            </div>
            <button onclick="setView('tareas')">Ver mis asignaciones</button>`;
          return;
        }
        const trabajadoresHtml = state.perfiles.length ? state.perfiles.map(p => {
          const rol = p.rol || "TECNICO";
          const rolLabel = rol.replaceAll("_", " ");
          return `<label class="worker-row" data-worker-role="${escapeHtml(rol.toUpperCase())}">
            <input type="checkbox" data-worker-id value="${escapeHtml(p.id)}">
            <span class="avatar">${escapeHtml(initials(p.nombre))}</span>
            <span>
              <strong>${escapeHtml(p.nombre)}</strong>
              <small>${escapeHtml(rolLabel)}</small>
            </span>
          </label>`;
        }).join("") : `<div class="empty-state small">No hay trabajadores activos para esta empresa.</div>`;
        const programadasFiltradas = actividadesProgramadasFiltradas(state.tareas);
        const recientes = programadasFiltradas.length ? programadasFiltradas.map(act => `
          <article class="activity-row clickable" onclick="seleccionarTarea('${escapeHtml(act.id)}')">
            <div>
              <strong>${escapeHtml(act.actividad || act.descripcion || "Sin descripción")}</strong>
              <span>${escapeHtml(act.equipo_texto || "Sin equipo")} - ${escapeHtml(act.fecha_envio || "Sin fecha")} ${escapeHtml(act.hora_envio || "")}</span>
              <small>Asignado a: ${escapeHtml(act.asignado_nombre || "Sin asignar")}</small>
              ${act.comentario ? `<small>${escapeHtml(act.comentario)}</small>` : ""}
            </div>
            <span class="pill">${escapeHtml(act.status || "pendiente")}</span>
          </article>
        `).join("") : `<div class="empty-state">${state.tareas.length ? "Sin resultados con estos filtros." : "Todavía no hay actividades programadas para esta empresa."}</div>`;
        view.querySelector(".module-panel").innerHTML = `
          <div class="module-wide split-workspace">
            <section>
              <p class="eyebrow">Actividades programadas</p>
              <h2>Nueva actividad programada</h2>
              <div class="form-preview">
                <label>Qué actividad se programará<textarea id="actividad-descripcion" placeholder="Ej: Lubricar chumaceras del secador, revisar tablero, inspección de vibración..."></textarea></label>
                <label>Equipo o área<input id="actividad-equipo" placeholder="Ej: BTR-5133, Secador enfriador, Planta general"></label>
                <div class="two-cols">
                  <label>Fecha de envío al técnico<input id="actividad-fecha" type="date"></label>
                  <label>Hora de envío al técnico<input id="actividad-hora" type="time"></label>
                </div>
                <div class="two-cols">
                  <label>Prioridad<select id="actividad-prioridad"><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
                  <label>Fecha límite<input id="actividad-fecha-limite" type="date"></label>
                </div>
                <label>Comentario al técnico<textarea id="actividad-comentario" placeholder="Instrucciones, herramienta necesaria, precauciones..."></textarea></label>
                <div class="workers-box">
                  <div class="worker-title">Trabajadores seleccionados</div>
                  <div class="worker-tools">
                    <button type="button" data-worker-filter="todos">Todos</button>
                    <button type="button" data-worker-filter="MEC">Mecánicos</button>
                    <button type="button" data-worker-filter="ELC">Eléctricos</button>
                    <button type="button" data-worker-filter="CONTR">Contratistas</button>
                    <button type="button" data-worker-clear>Limpiar</button>
                  </div>
                  <div class="workers-list">${trabajadoresHtml}</div>
                  <label>Nombre(s) del contratista si aplica<input id="actividad-contratistas" placeholder="Ej: Juan Pérez, Carlos López, Equipo contratista turno A..."></label>
                </div>
                <div class="form-action">
                  <button onclick="guardarActividadProgramada()">Enviar</button>
                </div>
              </div>
            </section>
            <section>
              <div class="panel-head compact-head">
                <h3>Programadas recientes</h3>
                <span class="muted">${programadasFiltradas.length} de ${state.tareas.length} registros</span>
              </div>
              <div class="list-toolbar">
                <input value="${escapeHtml(state.actividadesFiltro.q)}" oninput="actualizarFiltroActividades('q', this.value)" placeholder="Buscar actividad, equipo o trabajador...">
                <select onchange="actualizarFiltroActividades('estado', this.value)">
                  <option value="" ${!state.actividadesFiltro.estado ? "selected" : ""}>Todos los estados</option>
                  <option value="pendiente" ${state.actividadesFiltro.estado === "pendiente" ? "selected" : ""}>Pendiente</option>
                  <option value="pendiente_revision" ${state.actividadesFiltro.estado === "pendiente_revision" ? "selected" : ""}>En revisión</option>
                  <option value="cerrada_aprobada" ${state.actividadesFiltro.estado === "cerrada_aprobada" ? "selected" : ""}>Aprobada</option>
                  <option value="rechazada" ${state.actividadesFiltro.estado === "rechazada" ? "selected" : ""}>Rechazada</option>
                </select>
                <select onchange="actualizarFiltroActividades('orden', this.value)">${opcionesOrden(state.actividadesFiltro.orden)}</select>
              </div>
              <div class="activity-list">${recientes}</div>
            </section>
          </div>`;
        bindWorkerTools();
        return;
      }
      if (id === "tareas") {
        const tareasVisibles = tareasFiltradas(visibleTareas());
        const totalTareasVisibles = visibleTareas().length;
        const user = activeUser();
        const tareasHtml = tareasVisibles.length ? tareasVisibles.map(tarea => `
          <article class="activity-row clickable" onclick="seleccionarTarea('${escapeHtml(tarea.id)}')">
            <div>
              <strong>${escapeHtml(tarea.actividad || tarea.descripcion || "Sin actividad")}</strong>
              <span>${escapeHtml(tarea.equipo_texto || "Sin equipo")} - ${escapeHtml(tarea.asignado_nombre || "Sin trabajador")}</span>
              <small>Envío: ${escapeHtml(tarea.fecha_envio || "Sin fecha")} ${escapeHtml(tarea.hora_envio || "")}</small>
              ${tarea.fecha_limite ? `<small>Fecha limite: ${escapeHtml(tarea.fecha_limite)}</small>` : ""}
              ${tarea.comentario ? `<small>${escapeHtml(tarea.comentario)}</small>` : ""}
              ${tarea.cierre_comentario ? `<small>Cierre: ${escapeHtml(tarea.cierre_comentario)}</small>` : ""}
            </div>
            <div class="row-actions">
              <span class="pill">${escapeHtml(tarea.status || "pendiente")}</span>
            </div>
          </article>
        `).join("") : `<div class="empty-state">${totalTareasVisibles ? "Sin resultados con estos filtros." : isSupervisorMode() ? "Todavía no hay tareas asignadas para esta empresa." : "Todavía no tienes tareas asignadas en este usuario de prueba."}</div>`;
        view.querySelector(".module-panel").innerHTML = `
          <div class="module-wide">
            <section>
              <p class="eyebrow">Asignaciones</p>
              <h2>${isSupervisorMode() ? "Trabajos asignados" : "Mis trabajos asignados"}</h2>
              ${!isSupervisorMode() && user ? `<p class="muted">Panel de prueba para ${escapeHtml(user.nombre)}. Toca una tarea para prepararla o revisarla.</p>` : `<p class="muted">Toca una tarea para revisar y aprobar o rechazar su cierre.</p>`}
              <div class="list-toolbar">
                <input value="${escapeHtml(state.tareasFiltro.q)}" oninput="actualizarFiltroTareas('q', this.value)" placeholder="Buscar actividad, equipo o trabajador...">
                <select onchange="actualizarFiltroTareas('estado', this.value)">
                  <option value="" ${!state.tareasFiltro.estado ? "selected" : ""}>Todos los estados</option>
                  <option value="pendiente" ${state.tareasFiltro.estado === "pendiente" ? "selected" : ""}>Pendiente</option>
                  <option value="pendiente_revision" ${state.tareasFiltro.estado === "pendiente_revision" ? "selected" : ""}>En revisión</option>
                  <option value="cerrada_aprobada" ${state.tareasFiltro.estado === "cerrada_aprobada" ? "selected" : ""}>Aprobada</option>
                  <option value="rechazada" ${state.tareasFiltro.estado === "rechazada" ? "selected" : ""}>Rechazada</option>
                </select>
                ${isSupervisorMode() ? `<select onchange="actualizarFiltroTareas('trabajador', this.value)">${opcionesTrabajador(visibleTareas(), "asignado_nombre", state.tareasFiltro.trabajador)}</select>` : ""}
                <select onchange="actualizarFiltroTareas('orden', this.value)">${opcionesOrden(state.tareasFiltro.orden)}</select>
              </div>
              <span class="muted">${tareasVisibles.length} de ${totalTareasVisibles} registros</span>
              <div class="activity-list">${tareasHtml}</div>
            </section>
          </div>`;
        return;
      }
      if (id === "extras") {
        const extrasVisibles = extrasFiltradas(visibleActividadesExtra());
        const totalExtrasVisibles = visibleActividadesExtra().length;
        const user = activeUser();
        const extrasHtml = extrasVisibles.length ? extrasVisibles.map(act => {
          const extraUser = displayExtraUser(act) || "Sin técnico";
          const extraPhotoData = displayExtraPhotoData(act);
          return `
          <article class="activity-row clickable" onclick="seleccionarExtra('${escapeHtml(act.id)}')">
            <div>
              <strong>${escapeHtml(act.descripcion || "Sin descripción")}</strong>
              <span>${escapeHtml(act.equipo_texto || "Sin equipo")} - ${escapeHtml(extraUser)}</span>
              <small>${escapeHtml(act.fecha || "Sin fecha")} ${escapeHtml(act.hora || "")} ${act.horas_hombre ? `- ${escapeHtml(act.horas_hombre)} h` : ""}</small>
              ${act.comentario ? `<small>${escapeHtml(act.comentario)}</small>` : ""}
              ${act.evidencia_texto ? `<small>Evidencia: ${escapeHtml(act.evidencia_texto)}</small>` : ""}
              ${extraPhotoData ? `<small>Foto: ${escapeHtml(displayExtraPhotoName(act))}</small>` : ""}
            </div>
            <span class="pill">${escapeHtml(act.status || act.tipo || "extra")}</span>
          </article>
        `;}).join("") : `<div class="empty-state">${totalExtrasVisibles ? "Sin resultados con estos filtros." : isSupervisorMode() ? "Todavía no hay actividades extra registradas para esta empresa." : "Todavía no has registrado actividades extra con este usuario de prueba."}</div>`;
        view.querySelector(".module-panel").innerHTML = `
          <div class="module-wide">
            <p class="eyebrow">Actividades extra</p>
            <h2>${isSupervisorMode() ? "Reportes desde campo" : "Reportar actividad extra"}</h2>
            <p class="muted">${isSupervisorMode() ? "Aquí supervisor revisa los trabajos no programados subidos por campo. Toca uno para aprobarlo o rechazarlo." : `Panel de prueba para ${escapeHtml(user?.nombre || "técnico")}.`}</p>
            ${isSupervisorMode() ? "" : `
              <div class="form-preview">
                <label>Qué actividad realizaste<textarea id="extra-descripcion" placeholder="Ej: Se corrigió fuga en chumacera, se ajustó guarda, se limpió área..."></textarea></label>
                <label>Equipo o área<input id="extra-equipo" placeholder="Ej: BTR-5133 o Secador enfriador"></label>
                <div class="two-cols">
                  <label>Hora inicio<input id="extra-hora-inicio" type="time"></label>
                  <label>Hora fin<input id="extra-hora-fin" type="time"></label>
                </div>
                <label>Comentario<textarea id="extra-comentario" placeholder="Observaciones, material usado, condición encontrada..."></textarea></label>
                <label>Evidencia o referencia<textarea id="extra-evidencia" placeholder="Folio, nota de evidencia, liga o referencia temporal..."></textarea></label>
                <label>Adjuntar foto<input id="extra-foto" type="file" accept="image/*" onchange="previewExtraFoto(this)"></label>
                <div id="extra-foto-preview"></div>
                <div class="form-action"><button onclick="guardarActividadExtra()">Enviar</button></div>
              </div>
            `}
            <div class="panel-head compact-head">
              <h3>${isSupervisorMode() ? "Extras recientes" : "Mis extras recientes"}</h3>
              <span class="muted">${extrasVisibles.length} de ${totalExtrasVisibles} registros</span>
            </div>
            <div class="list-toolbar">
              <input value="${escapeHtml(state.extrasFiltro.q)}" oninput="actualizarFiltroExtras('q', this.value)" placeholder="Buscar actividad, equipo o comentario...">
              <select onchange="actualizarFiltroExtras('estado', this.value)">
                <option value="" ${!state.extrasFiltro.estado ? "selected" : ""}>Todos los estados</option>
                <option value="pendiente_revision" ${state.extrasFiltro.estado === "pendiente_revision" ? "selected" : ""}>En revisión</option>
                <option value="extra_aprobada" ${state.extrasFiltro.estado === "extra_aprobada" ? "selected" : ""}>Aprobada</option>
                <option value="extra_rechazada" ${state.extrasFiltro.estado === "extra_rechazada" ? "selected" : ""}>Rechazada</option>
              </select>
              ${isSupervisorMode() ? `<select onchange="actualizarFiltroExtras('trabajador', this.value)">${opcionesTrabajador(visibleActividadesExtra(), displayExtraUser, state.extrasFiltro.trabajador)}</select>` : ""}
              <select onchange="actualizarFiltroExtras('orden', this.value)">${opcionesOrden(state.extrasFiltro.orden)}</select>
            </div>
            <div class="activity-list">${extrasHtml}</div>
          </div>`;
        return;
      }
      if (id === "horas") {
        if (!isSupervisorMode()) {
          view.querySelector(".module-panel").innerHTML = `
            <div>
              <p class="eyebrow">Módulo de supervisor</p>
              <h2>Horas hombre</h2>
              <p>Este resumen lo revisa supervisor/admin. Tus horas reportadas aparecen desde Actividades extra y Asignaciones.</p>
            </div>
            <button onclick="setView('extras')">Ver mis extras</button>`;
          return;
        }

        const resumen = horasResumen();
        const selectedHoras = state.selectedHorasTecnico || "";
        const listaBase = selectedHoras ? horasDetalleTecnico(selectedHoras) : state.actividades;
        const lista = ordenarPorFecha(listaBase, "recientes", ["fecha", "created_at"]);

        const itemsHtml = lista.length ? lista.map(act => {
          const foto = displayExtraPhotoData(act);
          return `
          <article class="activity-row clickable ${act.id === state.selectedExtraId ? "selected" : ""}" onclick="seleccionarHorasExtra('${escapeHtml(act.id)}')">
            <div>
              <strong>${escapeHtml(displayExtraUser(act) || "Sin técnico")}</strong>
              <span>${escapeHtml(act.descripcion || "Sin descripción")} - ${escapeHtml(act.equipo_texto || "Sin equipo")}</span>
              <small>${escapeHtml(act.fecha || "Sin fecha")} ${escapeHtml(act.hora || "")} ${act.horas_hombre ? `- ${escapeHtml(act.horas_hombre)} h` : ""}</small>
              ${act.comentario ? `<small>${escapeHtml(act.comentario)}</small>` : ""}
              ${foto ? `<small>Foto: ${escapeHtml(displayExtraPhotoName(act))}</small>` : ""}
            </div>
            <span class="pill">${escapeHtml(act.status || act.revision_status || "extra")}</span>
          </article>
        `;}).join("") : `<div class="empty-state">${selectedHoras ? "Este trabajador todavía no tiene movimientos registrados." : "Todavía no hay horas reportadas en actividades extra."}</div>`;

        view.querySelector(".module-panel").innerHTML = `
          <div class="module-wide">
            <p class="eyebrow">Horas hombre</p>
            <h2>Resumen por técnico</h2>
            <div class="cards mini-cards hours-cards">
              <article><span>Horas extra</span><strong>${escapeHtml(resumen.totalHorasExtra)}</strong></article>
              <article><span>Extras</span><strong>${escapeHtml(resumen.extras)}</strong></article>
              <article><span>Aprobadas</span><strong>${escapeHtml(resumen.extrasAprobadas)}</strong></article>
              <article><span>Pendientes</span><strong>${escapeHtml(resumen.extrasPendientes)}</strong></article>
              <article><span>Tareas cerradas</span><strong>${escapeHtml(resumen.tareasCerradas)}</strong></article>
            </div>
            <div class="panel-head compact-head">
              <h3>${selectedHoras ? `Movimientos de ${escapeHtml(selectedHoras)}` : "Todos los movimientos"}</h3>
              <span class="muted">${lista.length} registros</span>
            </div>
            <div class="list-toolbar">
              <select onchange="seleccionarHorasTecnico(this.value)">
                <option value="" ${!selectedHoras ? "selected" : ""}>Todos los trabajadores</option>
                ${resumen.rows.map(row => `<option value="${escapeHtml(row.tecnico)}" ${selectedHoras === row.tecnico ? "selected" : ""}>${escapeHtml(row.tecnico)} · ${escapeHtml(row.horasExtra)} h</option>`).join("")}
              </select>
            </div>
            <div class="activity-list">${itemsHtml}</div>
          </div>`;
        return;
      }
      if (id === "raci") {
        view.querySelector(".module-panel").innerHTML = renderRaciMatriz();
        return;
      }
      if (id === "lubricantes") {
        if (state.lubricanteDetailMode) {
          view.querySelector(".module-panel").innerHTML = `<div class="module-wide">${renderDetalleLubricante()}</div>`;
          return;
        }

        const lubricantes = lubricantesFiltrados();
        const lubricantesHtml = lubricantes.length ? lubricantes.map(l => {
          const visual = lubricanteVisual(l.tipo);
          const equiposCount = new Set(equiposAsociadosDe(l.id).map(e => e.equipo_id)).size;
          const presPrincipal = presentacionPrincipal(l.id);
          return `
          <article class="lubricante-card" onclick="seleccionarLubricante('${escapeHtml(l.id)}')">
            <div class="lubricante-card-icon ${visual.clase} ${l.foto_producto_data_url ? "has-photo" : ""}">${lubricanteIconHtml(l, visual)}</div>
            <div class="lubricante-card-body">
              <span class="lubricante-card-tipo">${lubricanteColorSwatchHtml(l)}${escapeHtml(l.tipo || "Grasa")}${l.color_nombre ? ` · ${escapeHtml(l.color_nombre)}` : ""}</span>
              <strong>${escapeHtml(l.nombre)}</strong>
              <span class="lubricante-card-marca">${escapeHtml(l.marca || "Sin marca")}</span>
              ${presPrincipal ? `<span class="lubricante-card-spec">${escapeHtml(presentacionTexto(presPrincipal))}</span>` : ""}
              <span class="lubricante-card-equipos">⚙️ ${equiposCount} equipo${equiposCount === 1 ? "" : "s"} asociado${equiposCount === 1 ? "" : "s"}</span>
            </div>
            ${(l.ficha_tecnica_nombre || l.msds_nombre) ? `<span class="lubricante-card-ficha" title="Tiene documentos adjuntos">📎</span>` : ""}
          </article>`;
        }).join("") : `<div class="empty-state">${state.lubricantes.length ? "Sin resultados con estos filtros." : "Todavía no hay lubricantes dados de alta para esta empresa."}</div>`;

        const editando = state.editandoLubricanteId ? state.lubricantes.find(item => String(item.id) === String(state.editandoLubricanteId)) : null;
        const formAbierto = isSupervisorMode() && (state.lubricanteFormAbierto || Boolean(editando));

        view.querySelector(".module-panel").innerHTML = `
          <div class="module-wide">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Lubricantes</p>
                <h2>Catálogo de lubricantes</h2>
                <span class="muted">${lubricantes.length} de ${state.lubricantes.length} registros</span>
              </div>
              ${isSupervisorMode() ? `<button onclick="toggleLubricanteForm()">${formAbierto ? "✕ Cerrar" : "+ Agregar lubricante"}</button>` : ""}
            </div>
            ${formAbierto ? `
              <section class="lube-form-panel">
                <h3>${editando ? `Editar: ${escapeHtml(editando.nombre)}` : "Dar de alta lubricante"}</h3>
                <div class="form-preview">
                  <div class="two-cols">
                    <label>Nombre<input id="lub-nombre" placeholder="Ej: Synlox Xtreme Syn Grado 2" value="${escapeHtml(editando?.nombre || "")}"></label>
                    <label>Marca<input id="lub-marca" placeholder="Ej: Molub" value="${escapeHtml(editando?.marca || "")}"></label>
                  </div>
                  <div class="two-cols">
                    <label>Tipo<select id="lub-tipo">
                      <option ${(!editando || editando.tipo === "Grasa") ? "selected" : ""}>Grasa</option>
                      <option ${editando?.tipo === "Aceite" ? "selected" : ""}>Aceite</option>
                      <option ${editando?.tipo === "Otro" ? "selected" : ""}>Otro</option>
                    </select></label>
                    <label>Código / SKU<input id="lub-codigo" placeholder="Ej: SYN-XTR-220" value="${escapeHtml(editando?.codigo || "")}"></label>
                  </div>
                  <label>Especificación<input id="lub-especificacion" placeholder="Ej: ISO 220, NLGI 2..." value="${escapeHtml(editando?.especificacion || "")}"></label>
                  <label>Descripción<textarea id="lub-descripcion" placeholder="Descripción corta del producto y su uso principal...">${escapeHtml(editando?.descripcion || "")}</textarea></label>
                  <label>Observaciones<textarea id="lub-nota" placeholder="Uso recomendado, equivalencias, observaciones...">${escapeHtml(editando?.nota || "")}</textarea></label>
                  <div class="two-cols">
                    <label>Foto del producto (imagen)<input id="lub-foto" type="file" accept="image/*" onchange="previewFotoProductoLubricante(this)"></label>
                    <label>Ficha técnica (PDF o imagen)<input id="lub-ficha" type="file" accept="application/pdf,image/*" onchange="previewFichaLubricante(this)"></label>
                  </div>
                  <div class="two-cols">
                    <div id="lub-foto-preview">${editando?.foto_producto_data_url ? `<div class="closure-photo"><img src="${escapeHtml(editando.foto_producto_data_url)}" alt="Foto actual"><small>Sube otra imagen para reemplazarla</small></div>` : ""}</div>
                    <div id="lub-ficha-preview">${editando?.ficha_tecnica_nombre ? `<div class="closure-photo"><small>📎 Ya tiene: ${escapeHtml(editando.ficha_tecnica_nombre)} (sube otro archivo para reemplazarla)</small></div>` : ""}</div>
                  </div>
                  <div class="two-cols">
                    <label>Color de la grasa/aceite<input id="lub-color-nombre" placeholder="Ej: Azul, Ámbar, Café..." value="${escapeHtml(editando?.color_nombre || "")}"></label>
                    <label>Foto del color (opcional)<input id="lub-color-foto" type="file" accept="image/*" onchange="previewColorFotoLubricante(this)"></label>
                  </div>
                  <div id="lub-color-foto-preview">${editando?.color_foto_data_url ? `<div class="closure-photo"><img src="${escapeHtml(editando.color_foto_data_url)}" alt="Color actual"><small>Sube otra imagen para reemplazarla</small></div>` : ""}</div>
                  <label>MSDS / Hoja de seguridad (PDF o imagen)<input id="lub-msds" type="file" accept="application/pdf,image/*" onchange="previewMsdsLubricante(this)"></label>
                  <div id="lub-msds-preview">${editando?.msds_nombre ? `<div class="closure-photo"><small>📎 Ya tiene: ${escapeHtml(editando.msds_nombre)} (sube otro archivo para reemplazarla)</small></div>` : ""}</div>
                  <div class="form-action">
                    ${editando ? `<button class="ghost-action" onclick="cancelarEdicionLubricante()">Cancelar</button>` : ""}
                    <button onclick="guardarLubricante()">${editando ? "Guardar cambios" : "Dar de alta"}</button>
                  </div>
                </div>
              </section>
            ` : ""}
            <div class="list-toolbar">
              <input value="${escapeHtml(state.lubricanteSearch)}" oninput="buscarLubricantes(this.value)" placeholder="Buscar por nombre, marca o código...">
              <select onchange="actualizarFiltroLubricantes('tipo', this.value)">
                <option value="" ${!state.lubricantesFiltro.tipo ? "selected" : ""}>Todos los tipos</option>
                <option value="Grasa" ${state.lubricantesFiltro.tipo === "Grasa" ? "selected" : ""}>Grasa</option>
                <option value="Aceite" ${state.lubricantesFiltro.tipo === "Aceite" ? "selected" : ""}>Aceite</option>
                <option value="Otro" ${state.lubricantesFiltro.tipo === "Otro" ? "selected" : ""}>Otro</option>
              </select>
              <select onchange="actualizarFiltroLubricantes('marca', this.value)">${opcionesDistintas(state.lubricantes, "marca", state.lubricantesFiltro.marca, "Todas las marcas")}</select>
              <select onchange="actualizarFiltroLubricantes('area', this.value)">${opcionesDistintas(state.equipos, "area", state.lubricantesFiltro.area, "Todas las áreas")}</select>
              <select onchange="actualizarFiltroLubricantes('estado', this.value)">
                <option value="" ${!state.lubricantesFiltro.estado ? "selected" : ""}>Activos e inactivos</option>
                <option value="activo" ${state.lubricantesFiltro.estado === "activo" ? "selected" : ""}>Activos</option>
                <option value="inactivo" ${state.lubricantesFiltro.estado === "inactivo" ? "selected" : ""}>Inactivos</option>
              </select>
            </div>
            <div class="lubricantes-grid">${lubricantesHtml}</div>
          </div>`;
        return;
      }
      if (id === "cartas") {
        const cartas = cartasFiltradas();
        const carta = selectedCarta();
        const equipo = cartaEquipo(carta);
        const elementos = elementosForCarta(carta, equipo);
        const detailMode = Boolean(state.cartaDetailMode && carta);
        const guardadas = state.cartas.filter(c => !String(firstValue(c, ["status", "estado"], "guardada")).toLowerCase().includes("pend")).length;
        const pendientes = Math.max(state.equipos.length - guardadas, 0);
        const cartasHtml = cartas.length ? cartas.map(row => {
          const rowEquipo = cartaEquipo(row);
          const selected = String(row.id) === String(state.selectedCartaId);
          const fecha = cartaFecha(row);
          return `
            <article class="carta-list-row ${selected ? "selected" : ""}" onclick="seleccionarCarta('${escapeHtml(row.id)}')" title="Ver carta">
              <span class="doc-icon">DOC</span>
              <div class="carta-list-main">
                <strong>${escapeHtml(cartaTag(row, rowEquipo))}</strong>
                <span>${escapeHtml(cartaNombre(row, rowEquipo))}</span>
                <small>${escapeHtml(cartaArea(row, rowEquipo))} - Criticidad ${escapeHtml(cartaCriticidad(row, rowEquipo))} - ${escapeHtml(elementosForCarta(row, rowEquipo).length || firstValue(row, ["puntos_lubricacion", "elementos"], "0"))} puntos lubricacion</small>
              </div>
              <div class="carta-list-status">
                <span class="${cartaStatusPillClass(row, rowEquipo)}">${escapeHtml(cartaStatus(row, rowEquipo))}</span>
                <small>${escapeHtml(fecha)}</small>
              </div>
              <span class="arrow-link" aria-hidden="true">&rsaquo;</span>
            </article>
          `;
        }).join("") : `<div class="empty-state">Aún no hay cartas guardadas para esta empresa.</div>`;
        const panelCarta = construirPanelCarta(carta, equipo, elementos, detailMode);
        if (detailMode && state.vistaQr) {
          view.querySelector(".module-panel").innerHTML = `
            <div class="qr-print-view">
              <div class="qr-print-bar no-print">
                <img src="${escapeHtml(companyLogoUrl(activeEmpresa()) || "./assets/logo-covia.png")}" alt="">
                <button class="print-main-action" onclick="imprimirCarta()">Imprimir / Descargar PDF</button>
              </div>
              ${panelCarta}
            </div>`;
          return;
        }
        if (detailMode) {
          const cartaEsReal = Boolean(carta.id) && !String(carta.id).startsWith("auto-") && !String(carta.id).startsWith("pendiente-") && !carta.__autoCarta;
          view.querySelector(".module-panel").innerHTML = `
            <div class="module-wide cartas-realizadas-view carta-detail-view">
              <div class="legacy-page-hero carta-detail-hero">
                <button class="back-action hero-back" onclick="volverListaCartas()">&#8592;</button>
                <div>
                  <p class="eyebrow">Ver carta</p>
                  <h2>${escapeHtml(cartaTag(carta, equipo))}</h2>
                  <p>${escapeHtml(cartaNombre(carta, equipo))}</p>
                </div>
                <div class="hero-actions">
                  ${cartaEsReal ? `<button class="secondary-action qr-action" onclick="mostrarQrCarta('${escapeHtml(carta.id)}')">Generar QR</button>` : ""}
                  <button class="secondary-action print-main-action" onclick="imprimirCarta()">Imprimir / PDF</button>
                </div>
              </div>
              ${renderCartaEditorSection(carta, equipo, elementos)}
              ${panelCarta}
            </div>`;
        } else {
          view.querySelector(".module-panel").innerHTML = `
            <div class="module-wide cartas-realizadas-view">
              <div class="legacy-page-hero cartas-list-hero">
                <div>
                  <p class="eyebrow">Cartas realizadas</p>
                  <h2>Cartas realizadas</h2>
                  <p>Cartas de lubricación guardadas para esta empresa.</p>
                </div>
                <div class="hero-actions">
                  <button class="secondary-action qr-action" onclick="descargarTodasLasCartas()">Descargar todas (PDF)</button>
                </div>
              </div>
              <div class="filter-row">
                <input class="cartas-search" value="${escapeHtml(state.cartaSearch)}" oninput="buscarCartas(this.value)" placeholder="Buscar por ID TAG, nombre o área...">
                <select onchange="filtrarCartasPorArea(this.value)">
                  <option value="">Todas las áreas</option>
                  ${groupByArea(state.equipos).map(([area]) => `<option value="${escapeHtml(area)}" ${area === state.cartaAreaFiltro ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}
                </select>
              </div>
              <div class="cards mini-cards hours-cards">
                <article><span>Guardadas</span><strong>${escapeHtml(guardadas)}</strong></article>
                <article><span>Pendientes</span><strong>${escapeHtml(pendientes)}</strong></article>
                <article><span>Elementos</span><strong>${escapeHtml(state.elementosCartas.length)}</strong></article>
              </div>
              <section>
                <div class="panel-head compact-head">
                  <h3>Cartas guardadas</h3>
                  <span class="muted">${escapeHtml(cartas.length)} registros</span>
                </div>
                <div class="cartas-list">${cartasHtml}</div>
              </section>
            </div>`;
        }
        return;
      }
      view.querySelector(".module-panel").innerHTML = `
        <div>
          <p class="eyebrow">Módulo activo</p>
          <h2>${escapeHtml(module?.label || id)}</h2>
          <p>${escapeHtml(details[id] || module?.desc || "")}</p>
        </div>`;
    }
  });
}

function render() {
  renderDashboard();
  renderEquipos();
  syncUserPicker();
  renderAuthPanel();
  renderModules();
  syncNavigationForRole();
}

function setView(view) {
  if (!roleAllowsView(view)) {
    view = isSupervisorMode() ? "dashboard" : "tareas";
  }
  if (MODULES.some(m => m.id === view) && !moduleEnabled(view)) {
    view = "modulos";
  }
  state.view = view;
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === view));
  document.body.classList.toggle("hide-topbar", view !== "dashboard");
}

function ocultarPantallaCargaQr() {
  document.documentElement.classList.remove("cargando-carta");
  $("qr-loading")?.remove();
}

async function abrirCartaDesdeLiga(cartaId) {
  setStatus("Cargando carta desde el código QR...");
  // Esto usa una funcion especial en Supabase (obtener_carta_publica,
  // Paso 42) que funciona SIN iniciar sesion: entrega solo la carta
  // de este id exacto (el que trae el QR), su equipo, sus puntos y
  // sus fotos - nada mas de la empresa. Es lo que permite que
  // cualquiera escanee el QR fisico sin usuario ni contraseña, sin
  // reabrir el acceso a todo lo demas.
  const { data, error } = await sb.rpc("obtener_carta_publica", { p_carta_id: cartaId });

  if (error || !data || !data.carta) {
    setStatus("No se encontró la carta de esa liga o código QR. Puede que haya sido eliminada.", "error");
    ocultarPantallaCargaQr();
    if (state.authUser) {
      // Ya tiene sesion iniciada (por ejemplo, la esta probando desde
      // su propia cuenta): no la dejamos varada sin datos, la
      // regresamos a su empresa de siempre con todo cargado normal.
      await loadEmpresas();
      await loadEquipos();
    } else {
      mostrarGateAcceso();
    }
    return;
  }

  const carta = data.carta;
  state.empresaId = carta.empresa_id || state.empresaId || "";
  if ($("empresa-select")) {
    $("empresa-select").innerHTML = `<option value="${escapeHtml(state.empresaId)}">${escapeHtml(data.empresa_nombre || "")}</option>`;
    $("empresa-select").value = state.empresaId;
  }
  state.empresas = [{ id: state.empresaId, nombre: data.empresa_nombre || "", direccion: carta.direccion || "" }];
  state.equipos = data.equipo ? [data.equipo] : [];
  state.cartas = [carta];
  // Las fotos migradas viejas viven en Storage con una liga firmada
  // que vence cada semana - withSignedFotoUrl la regenera fresca.
  const [elementosFirmados, fotosFirmadas] = await Promise.all([
    Promise.all((data.elementos || []).map(withSignedFotoUrl)),
    Promise.all((data.fotos || []).map(withSignedFotoUrl))
  ]);
  state.elementosCartas = elementosFirmados.map(el => ({ ...el, __fotoCargada: true }));
  state.fotosEmpresa = fotosFirmadas.map(f => ({ ...f, __urlCargada: true }));
  state.fotoCounts = {};
  state.fotosEmpresa.forEach(f => {
    if (f.equipo_id) state.fotoCounts[f.equipo_id] = (state.fotoCounts[f.equipo_id] || 0) + 1;
  });

  state.selectedCartaId = cartaId;
  state.cartaDetailMode = true;
  state.vistaQr = true;
  document.body.classList.add("vista-qr");
  document.body.classList.remove("gate-activo");
  $("acceso-gate")?.classList.add("hidden");
  setView("cartas");
  render();
  clearStatus();
  ocultarPantallaCargaQr();
}

async function init() {
  try {
    loadLocalModulePrefs();
    await initAuthSession();
    const cartaIdDesdeLiga = new URLSearchParams(location.search).get("carta");
    if (cartaIdDesdeLiga) {
      await abrirCartaDesdeLiga(cartaIdDesdeLiga);
      return;
    }
    await loadEmpresas();
    $("empresa-select").value = state.empresaId;
    syncAuthLockedControls();
    if (state.authUser) {
      await loadEquipos();
    } else {
      mostrarGateAcceso();
    }
  } catch (err) {
    setStatus(err.message || String(err), "error");
  } finally {
    bootstrapping = false;
  }
}

document.querySelectorAll(".nav").forEach(btn => {
  btn.addEventListener("click", () => {
    setView(btn.dataset.view);
    toggleSidebarMobile(false);
  });
});

function toggleSidebarMobile(forzar) {
  const abrir = typeof forzar === "boolean" ? forzar : !document.body.classList.contains("sidebar-open");
  document.body.classList.toggle("sidebar-open", abrir);
  document.querySelector(".sidebar")?.classList.toggle("open", abrir);
}

function resetearVistasDeDetalle() {
  // Al cambiar de empresa, cualquier pantalla de "detalle" o
  // formulario abierto (un lubricante, una carta, un equipo) sigue
  // apuntando a un id de la empresa ANTERIOR. Si no se limpia, la
  // pantalla se queda mostrando "Selecciona un lubricante" (o
  // similar) en vez de la lista de la empresa nueva.
  state.selectedEquipoId = "";
  state.equipoFormAbierto = false;
  state.editandoEquipoId = "";
  state.lubricanteDetailMode = false;
  state.selectedLubricanteId = "";
  state.lubricanteFormAbierto = false;
  state.editandoLubricanteId = "";
  state.lubricanteAsociarFormAbierto = false;
  state.lubricantePresentacionFormAbierto = false;
  state.lubricanteMovimientoFormAbierto = false;
  state.lubricanteAliasPickerAbierto = false;
  state.cartaDetailMode = false;
  state.selectedCartaId = "";
  state.selectedCartaEquipoId = "";
  state.selectedTareaId = "";
  state.selectedExtraId = "";
  state.selectedHorasTecnico = "";
}

$("empresa-select").addEventListener("change", async (event) => {
  state.empresaId = event.target.value;
  resetearVistasDeDetalle();
  state.selectedUserId = "";
  if (state.authPerfiles && state.authPerfiles.length) {
    // Un comisionista puede tener un rol distinto guardado por cada
    // empresa (aunque hoy sea siempre el mismo); al cambiar de
    // empresa nos aseguramos de usar el perfil que le corresponde a
    // la empresa recien elegida.
    state.authPerfil = elegirAuthPerfilParaEmpresa(state.empresaId);
    if (state.authPerfil) {
      state.sessionRole = roleOptionFromProfile(state.authPerfil.rol);
      state.selectedUserId = isSupervisorMode() ? "" : state.authPerfil.id;
      if ($("role-select")) $("role-select").value = state.sessionRole;
    }
    renderAuthPanel();
  }
  await loadEquipos();
});

$("role-select").addEventListener("change", (event) => {
  state.sessionRole = event.target.value;
  state.selectedUserId = "";
  render();
});

$("user-select").addEventListener("change", (event) => {
  state.selectedUserId = event.target.value;
  render();
});

$("search").addEventListener("input", renderEquipos);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("modal-overlay").classList.contains("hidden")) cerrarModal();
});

$("auth-login")?.addEventListener("click", loginAuth);
$("auth-logout")?.addEventListener("click", logoutAuth);
$("sidebar-auth-logout")?.addEventListener("click", logoutAuth);
$("auth-password")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loginAuth();
});
$("auth-email")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loginAuth();
});

async function intentarLoginDesdeGate() {
  ocultarErrorGate();
  if ($("auth-email")) $("auth-email").value = $("gate-email")?.value.trim() || "";
  if ($("auth-password")) $("auth-password").value = $("gate-password")?.value || "";
  await loginAuth();
  if (state.authUser) {
    if ($("gate-password")) $("gate-password").value = "";
    ocultarGateAcceso();
    const empresaNombre = activeEmpresa()?.nombre || "tu empresa";
    mostrarAvisoFlotante(`Bienvenido, ${authDisplayName()} · ${roleLabel(state.sessionRole)} · ${empresaNombre}`, "ok");
  } else {
    mostrarErrorGate(traducirErrorAuth($("status")?.textContent));
  }
}

function traducirErrorAuth(mensaje) {
  const texto = String(mensaje || "");
  if (texto.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (texto.includes("Email not confirmed")) return "Ese correo aún no ha sido confirmado.";
  if (texto.includes("correo y contraseña")) return texto;
  return texto || "No se pudo iniciar sesión. Revisa tu correo y contraseña.";
}

$("gate-login-btn")?.addEventListener("click", intentarLoginDesdeGate);
$("gate-email")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") intentarLoginDesdeGate();
});
$("gate-password")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") intentarLoginDesdeGate();
});


sb.auth.onAuthStateChange((_event, session) => {
  if (state.vistaQr || /[?&]carta=/.test(location.search)) {
    // La vista de un QR maneja sus propios datos con
    // obtener_carta_publica y no necesita (ni debe) sesion. Supabase
    // dispara este evento tambien para visitantes anonimos poco
    // despues de cargar la pagina; si se le hacia caso aqui, disparaba
    // una recarga completa que fallaba por RLS (sin sesion) y borraba
    // la carta que el QR ya habia mostrado - por eso se veia lento y
    // terminaba sin la carta.
    return;
  }
  applyAuthSession(session, !bootstrapping).catch(err => {
    console.warn("No se pudo sincronizar sesion:", err.message);
  });
});

init();
