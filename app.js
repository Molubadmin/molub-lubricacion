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
  selectedLubricanteId: "",
  lubricanteDetailMode: false,
  lubricanteTab: "equipos",
  lubricanteAsociarFormAbierto: false,
  lubricantePresentacionFormAbierto: false,
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
  selectedTareaId: "",
  selectedExtraId: "",
  selectedHorasTecnico: "",
  selectedCartaEquipoId: "",
  selectedCartaId: "",
  cartaDetailMode: false,
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
  authPerfil: null
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

function roleAllowsView(view) {
  if (isSupervisorMode()) return true;
  return ["equipos", "levantamiento", "tareas", "extras", "cartas", "lubricantes"].includes(view);
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
  const locked = isAuthMode();
  if ($("role-select")) $("role-select").disabled = locked;
  if ($("empresa-select")) $("empresa-select").disabled = locked;
}

function renderAuthPanel() {
  const logged = Boolean(state.authUser);
  const locked = isAuthMode();
  $("auth-login-form")?.classList.toggle("hidden", logged);
  $("auth-session")?.classList.toggle("hidden", !logged);
  if ($("auth-user-label")) $("auth-user-label").textContent = logged ? authDisplayName() : "Sin sesión";
  $("sidebar-auth-session")?.classList.toggle("hidden", !logged);
  if ($("sidebar-auth-user-label")) $("sidebar-auth-user-label").textContent = logged ? authDisplayName() : "Sin sesión";

  const msg = $("auth-message");
  if (msg) {
    msg.textContent = locked
      ? `${authDisplayName()} · ${roleLabel(state.sessionRole)} · ${activeEmpresa()?.nombre || "sin empresa"}`
      : logged
        ? "Sesión activa sin perfil vinculado. Revisa el Paso 19."
        : "Acceso por rol activo.";
    msg.style.color = locked ? "var(--green)" : "var(--muted)";
  }

  const sessionBox = document.querySelector(".session span");
  if (sessionBox) sessionBox.textContent = locked ? roleLabel(state.sessionRole) : "Acceso por rol";
  syncAuthLockedControls();
}

async function fetchAuthPerfil(user) {
  if (!cfg.tables.perfiles || !user) return null;

  const { data, error } = await sb
    .from(cfg.tables.perfiles)
    .select("id,empresa_id,nombre,rol,activo,email,auth_user_id")
    .eq("activo", true)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) console.warn("No se pudo buscar perfil por auth_user_id:", error.message);
  if (data) return data;

  const email = String(user.email || "").trim();
  if (!email) return null;

  const fallback = await sb
    .from(cfg.tables.perfiles)
    .select("id,empresa_id,nombre,rol,activo,email,auth_user_id")
    .eq("activo", true)
    .ilike("email", email)
    .maybeSingle();

  if (fallback.error) {
    console.warn("No se pudo buscar perfil por email:", fallback.error.message);
    return null;
  }
  return fallback.data || null;
}

async function applyAuthSession(session, reload = false) {
  state.authSession = session || null;
  state.authUser = session?.user || null;
  state.authPerfil = state.authUser ? await fetchAuthPerfil(state.authUser) : null;

  if (state.authPerfil) {
    state.empresaId = state.authPerfil.empresa_id || state.empresaId;
    state.sessionRole = roleOptionFromProfile(state.authPerfil.rol);
    state.selectedUserId = isSupervisorMode() ? "" : state.authPerfil.id;
    if ($("role-select")) $("role-select").value = state.sessionRole;
    if ($("empresa-select") && state.empresaId) $("empresa-select").value = state.empresaId;
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

function tareasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.tareasFiltro, ["actividad", "descripcion", "equipo_texto", "asignado_nombre"], "asignado_nombre");
  return ordenarPorFecha(filtradas, state.tareasFiltro.orden, ["fecha_envio", "created_at"]);
}

function actividadesProgramadasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.actividadesFiltro, ["actividad", "descripcion", "equipo_texto", "asignado_nombre"], "asignado_nombre");
  return ordenarPorFecha(filtradas, state.actividadesFiltro.orden, ["fecha_envio", "created_at"]);
}

function extrasFiltradas(rows) {
  const filtradas = filtrarPorTextoYEstado(rows, state.extrasFiltro, ["descripcion", "equipo_texto", "comentario"], displayExtraUser);
  return ordenarPorFecha(filtradas, state.extrasFiltro.orden, ["fecha", "created_at"]);
}

function actualizarFiltroTareas(campo, valor) {
  state.tareasFiltro[campo] = valor;
  renderModules();
}

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
    setView("tareas");
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
  select.innerHTML = state.empresas
    .map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nombre)}</option>`)
    .join("");
  state.empresaId = state.authPerfil?.empresa_id || state.empresaId || state.empresas[0]?.id || "";
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

async function loadEquipos() {
  if (!state.empresaId) return;
  setStatus("Cargando equipos de la empresa seleccionada...");
  await loadEmpresaModulos();
  const { data, error } = await sb
    .from(cfg.tables.equipos)
    .select("id,empresa_id,area,proceso,id_tag,nombre_equipo,criticidad,sistema,activo")
    .eq("empresa_id", state.empresaId)
    .order("area")
    .order("id_tag");
  if (error) throw error;
  state.equipos = data || [];
  await loadFotoCounts();
  await loadActividades();
  await loadTareas();
  await loadCartas();
  await loadElementosCartas();
  await loadLubricantes();
  await loadLubricanteEquipos();
  await loadLubricantePresentaciones();
  await loadPerfiles();
  if (!state.equipos.some(e => e.id === state.selectedEquipoId)) {
    state.selectedEquipoId = state.equipos[0]?.id || "";
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

async function loadLubricantes() {
  state.lubricantes = [];
  if (!cfg.tables.lubricantes || !state.empresaId) return;

  const { data, error } = await sb
    .from(cfg.tables.lubricantes)
    .select("*")
    .eq("empresa_id", state.empresaId)
    .order("nombre");

  if (error) {
    console.warn("No se pudieron cargar lubricantes:", error.message);
    return;
  }
  state.lubricantes = data || [];
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
    return `<button type="button" class="lube-equipo-chip" onclick="irALubricante('${escapeHtml(lub.id)}')">
      <strong>${escapeHtml(lub.nombre)}</strong>
      <span>${escapeHtml(le.componente || "")}${le.componente && le.punto_lubricacion ? " · " : ""}${escapeHtml(le.punto_lubricacion || "")}</span>
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
  const foto = $("lub-foto")?.files?.[0];
  const ficha = $("lub-ficha")?.files?.[0];
  const msds = $("lub-msds")?.files?.[0];

  if (!nombre) {
    mostrarAvisoFlotante("Escribe el nombre del lubricante antes de guardar.", "error");
    return;
  }

  for (const [file, label] of [[foto, "La foto del producto"], [ficha, "La ficha técnica"], [msds, "El MSDS"]]) {
    if (!file) continue;
    const esImagenOPdf = file.type === "application/pdf" || file.type.startsWith("image/");
    if (file === foto ? !file.type.startsWith("image/") : !esImagenOPdf) {
      mostrarAvisoFlotante(`${label} debe ser ${file === foto ? "una imagen" : "un PDF o una imagen"}.`, "error");
      return;
    }
    if (file.size > 4500000) {
      mostrarAvisoFlotante(`${label} pesa demasiado, usa un archivo menor a 4.5 MB.`, "error");
      return;
    }
  }

  const editandoId = state.editandoLubricanteId;
  const editando = editandoId ? state.lubricantes.find(item => String(item.id) === String(editandoId)) : null;

  let fotoDataUrl = editando?.foto_producto_data_url || null;
  let fotoNombre = editando?.foto_producto_nombre || null;
  if (foto) {
    fotoDataUrl = await fileToDataUrl(foto);
    fotoNombre = foto.name;
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

  ["lub-nombre", "lub-marca", "lub-codigo", "lub-especificacion", "lub-descripcion", "lub-nota"].forEach(id => { if ($(id)) $(id).value = ""; });
  ["lub-foto", "lub-ficha", "lub-msds"].forEach(id => { if ($(id)) $(id).value = ""; });
  ["lub-foto-preview", "lub-ficha-preview", "lub-msds-preview"].forEach(id => { if ($(id)) $(id).innerHTML = ""; });
  state.editandoLubricanteId = "";
  await loadLubricantes();
  renderModules();
  mostrarAvisoFlotante(editando ? "Cambios guardados." : "Lubricante dado de alta.", "ok");

  if (!editando && guardado?.id) {
    await autoAsociarEquiposLubricante(guardado.id, { silencioso: true });
  }
}

async function autoAsociarEquiposLubricante(lubricanteId, opciones = {}) {
  const l = state.lubricantes.find(item => String(item.id) === String(lubricanteId));
  if (!l) return;
  const nombre = String(l.nombre || "").trim().toLowerCase();
  if (!nombre) return;

  const coincidencias = state.elementosCartas.filter(el => {
    const valor = String(el.lubricante || "").trim().toLowerCase();
    return valor && el.equipo_id && (valor === nombre || valor.includes(nombre) || nombre.includes(valor));
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
    if (!opciones.silencioso) mostrarAvisoFlotante("No se encontraron equipos con ese nombre de lubricante en las cartas guardadas.", "info");
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

function editarLubricante(id) {
  if (!isSupervisorMode()) return;
  state.editandoLubricanteId = id;
  state.lubricanteFormAbierto = true;
  state.lubricanteDetailMode = false;
  renderModules();
  document.getElementById("lub-nombre")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
function previewFichaLubricante(input) { previewArchivoLubricante(input, "lub-ficha-preview", false); }
function previewMsdsLubricante(input) { previewArchivoLubricante(input, "lub-msds-preview", false); }

function seleccionarLubricante(id) {
  state.selectedLubricanteId = id;
  state.lubricanteDetailMode = true;
  state.lubricanteTab = "equipos";
  state.lubricanteAsociarFormAbierto = false;
  state.lubricantePresentacionFormAbierto = false;
  renderModules();
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
  renderModules();
}

function lubricanteVisual(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t.startsWith("grasa")) return { icon: "🧴", clase: "lube-grasa" };
  if (t.startsWith("aceite")) return { icon: "🛢️", clase: "lube-aceite" };
  return { icon: "⚙️", clase: "lube-otro" };
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
      </div>
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
  renderModules();
  mostrarAvisoFlotante("Documento actualizado.", "ok");
}

function renderTabConsumos() {
  return `<div class="empty-state small">Todavía no llevamos un registro de consumos por movimiento. Cuando definamos cómo capturar cada aplicación (técnico, fecha y cantidad), el historial se mostrará aquí.</div>`;
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
      ${tab === "consumos" ? renderTabConsumos() : ""}
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

async function loadElementosCartas() {
  state.elementosCartas = [];
  if (!cfg.tables.elementosCartas || !state.empresaId) return;

  const { data, error } = await sb
    .from(cfg.tables.elementosCartas)
    .select("*")
    .eq("empresa_id", state.empresaId)
    .limit(1500);

  if (error) {
    console.warn("No se pudieron cargar elementos de cartas:", error.message);
    return;
  }
  state.elementosCartas = await Promise.all((data || []).map(withSignedFotoUrl));
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

function seleccionarTarea(id) {
  state.selectedTareaId = id;
  abrirModal(renderPanelCierre());
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

function cartaForEquipo(equipoId) {
  return state.cartas.find(carta => carta.equipo_id === equipoId);
}

function cartaEquipo(carta) {
  if (!carta) return null;
  return state.equipos.find(equipo => equipo.id === carta.equipo_id)
    || state.equipos.find(equipo => equipo.id_tag && String(equipo.id_tag).toLowerCase() === String(firstValue(carta, ["id_tag", "tag", "folio", "equipo_texto"])).toLowerCase())
    || state.equipos.find(equipo => equipo.nombre_equipo && String(equipo.nombre_equipo).toLowerCase() === String(firstValue(carta, ["nombre_equipo", "nombre", "equipo_texto"])).toLowerCase());
}

function cartaTag(carta, equipo = cartaEquipo(carta)) {
  return firstValue(carta, ["id_tag", "tag", "folio", "equipo_texto"], equipo?.id_tag || "SIN TAG");
}

function cartaNombre(carta, equipo = cartaEquipo(carta)) {
  return firstValue(carta, ["nombre_equipo", "nombre", "descripcion"], equipo?.nombre_equipo || "Carta de lubricación");
}

function cartaArea(carta, equipo = cartaEquipo(carta)) {
  return firstValue(carta, ["area", "proceso", "area_nombre"], equipo?.area || equipo?.proceso || "Sin área");
}

function cartaCriticidad(carta, equipo = cartaEquipo(carta)) {
  return firstValue(carta, ["criticidad", "critica", "prioridad"], equipo?.criticidad || "Sin criticidad");
}

function cartaSistema(carta, equipo = cartaEquipo(carta)) {
  return firstValue(carta, ["sistema", "sistema_lubricacion"], equipo?.sistema || "Sin sistema");
}

function cartaFecha(carta) {
  return firstValue(carta, ["fecha_guardado", "updated_at", "created_at", "fecha"], "Sin fecha");
}

function cartaFoto(carta, equipo = cartaEquipo(carta)) {
  const directa = firstValue(carta, ["foto_url", "foto_data_url", "imagen_url", "equipo_foto_url", "foto_completa_url"], equipo?.foto_url || "");
  if (directa) return directa;
  const fotosEquipo = fotosEmpresaDeEquipo(carta?.equipo_id || equipo?.id);
  const completa = fotosEquipo.find(esFotoEquipo);
  return fotoSrc(completa || fotosEquipo[0]);
}

function cartaPuntoFoto(elemento) {
  return firstValue(elemento, ["signed_url", "signedUrl", "foto_url", "foto_data_url", "imagen_url", "punto_foto_url", "foto_punto_url", "foto"], "");
}

function elementoTipoCantidad(elemento) {
  const tipo = firstValue(elemento, ["tipo"], "");
  const gramos = firstValue(elemento, ["gramos", "g"], "");
  const cantidad = firstValue(elemento, ["cantidad", "tipo_cantidad", "tipo_cant", "cant"], "");
  const partes = [tipo, gramos ? `${gramos} g` : "", cantidad].filter(Boolean);
  return partes.join(" / ");
}

function elementoBombaLitros(elemento) {
  const bombazos = firstValue(elemento, ["bombazos", "bomba", "bombas", "bomb"], "");
  const litros = firstValue(elemento, ["litros", "l"], "");
  return [bombazos ? `${bombazos} bomb.` : "", litros ? `${litros} L` : ""].filter(Boolean).join(" / ");
}

function cartaStatus(carta) {
  const raw = String(firstValue(carta, ["status", "estado"], "guardada")).toLowerCase();
  if (raw.includes("guard")) return "Guardada";
  if (raw.includes("aprob")) return "Guardada";
  return raw || "Guardada";
}

function elementosForCarta(carta, equipo = cartaEquipo(carta)) {
  return elementosForCartaRaw(carta, equipo).filter(el => !state.puntosOcultosCarta.has(String(el.id)));
}

function elementosForCartaRaw(carta, equipo = cartaEquipo(carta)) {
  if (!carta) return [];
  const cartaId = String(carta.id || "");
  const equipoId = String(carta.equipo_id || equipo?.id || "");
  const tag = String(cartaTag(carta, equipo)).toLowerCase();
  const elementos = state.elementosCartas.filter(el => {
    const elCartaId = String(firstValue(el, ["carta_id", "carta_lubricacion_id", "lubricacion_id"]));
    const elEquipoId = String(firstValue(el, ["equipo_id", "equipoId"]));
    const elTag = String(firstValue(el, ["id_tag", "tag", "equipo_texto"])).toLowerCase();
    return (cartaId && elCartaId === cartaId) || (equipoId && elEquipoId === equipoId) || (tag && elTag === tag);
  }).sort((a, b) => {
    const ordenA = Number(firstValue(a, ["orden", "npunto"], 0));
    const ordenB = Number(firstValue(b, ["orden", "npunto"], 0));
    return ordenA - ordenB;
  });

  const fotosPuntos = fotosPuntosDeEquipo(equipoId);
  if (!fotosPuntos.length) return elementos;

  if (elementos.length) {
    const conFotos = elementos.map((elemento, index) => {
      if (cartaPuntoFoto(elemento)) return elemento;
      const foto = fotosPuntos[index];
      const src = fotoSrc(foto);
      if (!src) return elemento;
      return {
        ...elemento,
        signed_url: src,
        foto_url: src,
        file_name: firstValue(foto, ["file_name", "storage_path"], "")
      };
    });
    const extras = fotosPuntos
      .slice(elementos.length)
      .map((foto, index) => fotoPuntoCartaRow(foto, elementos.length + index, equipoId));
    return [...conFotos, ...extras].filter(row => !row.__fotoLevantamiento || cartaPuntoFoto(row));
  }

  return fotosPuntos
    .map((foto, index) => fotoPuntoCartaRow(foto, index, equipoId))
    .filter(row => cartaPuntoFoto(row));
}

function cartasFiltradas() {
  const q = String(state.cartaSearch || "").trim().toLowerCase();
  const areaFiltro = state.cartaAreaFiltro || "";
  const reales = state.cartas || [];
  const realesEquipoIds = new Set(reales.map(carta => String(carta.equipo_id || "")).filter(Boolean));
  const realesTags = new Set(reales.map(carta => String(cartaTag(carta, cartaEquipo(carta))).toLowerCase()).filter(Boolean));
  const automaticas = (state.equipos || [])
    .filter(equipo => (state.fotoCounts?.[equipo.id] || fotosEmpresaDeEquipo(equipo.id).length || 0) > 0)
    .filter(equipo => !realesEquipoIds.has(String(equipo.id)) && !realesTags.has(String(equipo.id_tag || "").toLowerCase()))
    .map(autoCartaFromEquipo);
  const rows = [...reales, ...automaticas];
  const sourceRows = rows.length
    ? rows
    : state.equipos.map(equipo => ({ id: `pendiente-${equipo.id}`, equipo_id: equipo.id, status: "pendiente" }));
  return sourceRows.filter(carta => {
    const equipo = cartaEquipo(carta);
    const matchArea = !areaFiltro || cartaArea(carta, equipo) === areaFiltro;
    if (!matchArea) return false;
    if (!q) return true;
    return [
      cartaTag(carta, equipo),
      cartaNombre(carta, equipo),
      cartaArea(carta, equipo),
      cartaCriticidad(carta, equipo),
      cartaSistema(carta, equipo)
    ].join(" ").toLowerCase().includes(q);
  });
}

function filtrarCartasPorArea(value) {
  state.cartaAreaFiltro = value || "";
  state.selectedCartaId = "";
  state.cartaDetailMode = false;
  renderModules();
}

function selectedCarta() {
  const rows = cartasFiltradas();
  if (!rows.length) {
    state.selectedCartaId = "";
    return null;
  }
  if (!rows.some(carta => String(carta.id) === String(state.selectedCartaId))) {
    state.selectedCartaId = rows[0].id;
  }
  return rows.find(carta => String(carta.id) === String(state.selectedCartaId)) || rows[0];
}

function seleccionarCarta(id) {
  state.selectedCartaId = id;
  state.cartaDetailMode = true;
  renderModules();
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
}

function volverListaCartas() {
  state.cartaDetailMode = false;
  renderModules();
}

function buscarCartas(value) {
  state.cartaSearch = value || "";
  state.selectedCartaId = "";
  state.cartaDetailMode = false;
  renderModules();
}

function imprimirCarta() {
  setStatus("Usa Ctrl+P o el diálogo del navegador para imprimir/PDF la carta visible.", "warn");
  window.print();
}

function mostrarQrCarta(cartaId) {
  const carta = state.cartas.find(c => String(c.id) === String(cartaId));
  const equipo = cartaEquipo(carta);
  const tag = carta ? cartaTag(carta, equipo) : cartaId;
  const nombre = carta ? cartaNombre(carta, equipo) : "";
  const url = `${location.origin}${location.pathname}?carta=${encodeURIComponent(cartaId)}`;
  abrirModal(`
    <div class="panel-head compact-head">
      <h3>Código QR — ${escapeHtml(tag)}</h3>
    </div>
    <p class="muted" style="margin-top:-8px">${escapeHtml(nombre)}</p>
    <div class="qr-box">
      <div id="qr-canvas-container"></div>
      <div class="qr-url">${escapeHtml(url)}</div>
      <p class="muted" style="text-align:center;max-width:380px">Imprime este código y pégalo en el equipo. Aunque edites la carta después, el código no cambia: siempre va a mostrar la versión más reciente.</p>
      <div class="qr-actions">
        <button class="ghost-action" onclick="copiarLigaQr('${escapeHtml(url)}')">Copiar liga</button>
        <a id="qr-download" class="secondary-action" download="carta-${escapeHtml(tag)}-qr.png" href="#">Descargar PNG</a>
      </div>
    </div>
  `);
  const container = document.getElementById("qr-canvas-container");
  if (!window.QRCode) {
    mostrarAvisoFlotante("No se pudo cargar el generador de QR. Revisa tu conexión a internet.", "error");
    return;
  }
  new QRCode(container, {
    text: url,
    width: 240,
    height: 240,
    colorDark: "#07112e",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
  setTimeout(() => {
    const canvas = container.querySelector("canvas");
    const link = document.getElementById("qr-download");
    if (canvas && link) link.href = canvas.toDataURL("image/png");
  }, 60);
}

function copiarLigaQr(url) {
  if (!navigator.clipboard) {
    mostrarAvisoFlotante("No se pudo copiar la liga.", "error");
    return;
  }
  navigator.clipboard.writeText(url)
    .then(() => mostrarAvisoFlotante("Liga copiada.", "ok"))
    .catch(() => mostrarAvisoFlotante("No se pudo copiar la liga.", "error"));
}

function elementoEditorRow(el, index) {
  const foto = cartaPuntoFoto(el);
  const npunto = firstValue(el, ["npunto", "orden"], index + 1);
  const campo = (nombreCampo, valor, placeholder = "") =>
    `<input id="elemento-editor-${index}-${nombreCampo}" value="${escapeHtml(valor)}" placeholder="${escapeHtml(placeholder)}">`;
  return `
    <tr>
      <td class="legacy-point-photo">
        <strong>${escapeHtml(npunto)}</strong>
        ${foto ? `<img src="${escapeHtml(foto)}" alt="" referrerpolicy="no-referrer">` : ""}
      </td>
      <td>${campo("elemento", firstValue(el, ["elemento", "nombre", "componente"], ""))}</td>
      <td>${campo("descripcion", firstValue(el, ["descripcion", "desc", "detalle"], ""))}</td>
      <td>${campo("lubricante", firstValue(el, ["lubricante", "lub", "producto"], ""))}</td>
      <td>${campo("lub_inicial", firstValue(el, ["lub_inicial", "lubInicial", "lubricacion_inicial", "inicial"], ""))}</td>
      <td>${campo("relub", firstValue(el, ["relub", "re_lub", "relubricacion"], ""))}</td>
      <td>${campo("tipo", firstValue(el, ["tipo"], ""), "grasa/aceite")}</td>
      <td>${campo("gramos", firstValue(el, ["gramos", "cantidad", "tipo_cantidad", "tipo_cant", "cant"], ""), "g / cant")}</td>
      <td>${campo("bombazos", firstValue(el, ["bombazos", "bomba", "bombas", "bomb"], ""))}</td>
      <td>${campo("litros", firstValue(el, ["litros", "l"], ""))}</td>
      <td>${campo("frecuencia", firstValue(el, ["frecuencia", "frec"], ""))}</td>
      <td>${campo("tarea", firstValue(el, ["tarea", "actividad"], ""))}</td>
      <td>${campo("intervalo_muestreo", firstValue(el, ["int_muestreo", "int", "intervalo_muestreo"], ""))}</td>
      <td>${campo("temp_real", firstValue(el, ["temp_real", "temp", "temperatura", "temperatura_real"], ""))}</td>
      <td class="carta-editor-quitar"><button type="button" class="icon-danger-button" title="Quitar este punto" onclick="eliminarPuntoCarta(${index})">&times;</button></td>
    </tr>`;
}

function renderCartaEditorSection(carta, equipo, elementos) {
  if (!carta || !equipo) return "";
  if (!isSupervisorMode()) return "";
  const firmas = typeof carta?.firmas === "object" && carta?.firmas ? carta.firmas : {};
  const filasHtml = elementos.length
    ? elementos.map((el, index) => elementoEditorRow(el, index)).join("")
    : `<tr><td colspan="15" class="empty-table">Agrega fotos de puntos de lubricación desde Ingresar a planta, o usa "Agregar punto manual".</td></tr>`;
  return `
    <section class="carta-editor no-print">
      <h4>Llenar carta de lubricación</h4>
      <div class="carta-editor-grid">
        <label>Planta<input id="carta-editor-planta" value="${escapeHtml(firstValue(carta, ["planta"], activeEmpresa()?.nombre || ""))}"></label>
        <label>Dirección<input id="carta-editor-direccion" value="${escapeHtml(firstValue(carta, ["direccion"], firstValue(activeEmpresa(), ["direccion", "ubicacion"], "Lampazos de Naranjo, N.L.")))}"></label>
        <label>Revisó<input id="carta-editor-reviso" value="${escapeHtml(firstValue(firmas, ["reviso", "reviso_nombre"], ""))}"></label>
        <label>Autorizó<input id="carta-editor-autorizo" value="${escapeHtml(firstValue(firmas, ["autorizo", "autorizo_nombre"], ""))}"></label>
        <label class="carta-editor-full">Recomendaciones de monitoreo e inspección<textarea id="carta-editor-recomendaciones">${escapeHtml(firstValue(carta, ["recomendaciones", "recomendacion", "observaciones"], ""))}</textarea></label>
      </div>
      <div class="carta-editor-table-wrap">
        <table class="carta-editor-table">
          <thead>
            <tr>
              <th>Foto punto</th><th>Elemento</th><th>Descripción</th><th>Lubricante</th><th>Lub. inicial</th><th>Re-Lub.</th><th>Tipo</th><th>Gramos/Cant.</th><th>Bombazos</th><th>Litros</th><th>Frecuencia</th><th>Tarea</th><th>Int. muestreo</th><th>Temp. real</th><th></th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>
      </div>
      <div class="carta-editor-actions">
        <button class="secondary-action" onclick="agregarPuntoManualCarta()">+ Agregar punto manual</button>
        <button onclick="guardarCartaCompleta()">Guardar carta</button>
      </div>
    </section>`;
}

function agregarPuntoManualCarta() {
  if (!isSupervisorMode()) return;
  const carta = selectedCarta();
  const equipo = cartaEquipo(carta);
  if (!carta || !equipo) {
    setStatus("Selecciona una carta antes de agregar un punto.", "warn");
    return;
  }
  const siguienteOrden = elementosForCarta(carta, equipo).length + 1;
  state.elementosCartas.push({
    id: `nuevo-${Date.now()}-${siguienteOrden}`,
    empresa_id: state.empresaId,
    equipo_id: equipo.id,
    npunto: siguienteOrden,
    orden: siguienteOrden,
    elemento: "",
    nombre: "",
    __nuevo: true
  });
  renderModules();
}

async function eliminarPuntoCarta(index) {
  if (!isSupervisorMode()) return;
  const carta = selectedCarta();
  const equipo = cartaEquipo(carta);
  if (!carta || !equipo) return;
  const elementos = elementosForCarta(carta, equipo);
  const el = elementos[index];
  if (!el) return;

  const esNuevo = Boolean(el.__nuevo) || String(el.id).startsWith("nuevo-");
  const esFotoAuto = Boolean(el.__fotoLevantamiento) || String(el.id).startsWith("foto-");

  if (esNuevo) {
    const idx = state.elementosCartas.findIndex(item => item.id === el.id);
    if (idx !== -1) state.elementosCartas.splice(idx, 1);
    renderModules();
    return;
  }

  if (esFotoAuto) {
    if (!window.confirm("Este punto viene de una foto de levantamiento. Se quitará de esta carta, pero la foto seguirá disponible en Ingresar a planta. ¿Continuar?")) return;
    state.puntosOcultosCarta.add(String(el.id));
    renderModules();
    return;
  }

  if (!window.confirm("¿Quitar este punto de lubricación? Se eliminará de la carta guardada en Supabase.")) return;
  setStatus("Eliminando punto de lubricación...");
  const { data, error } = await sb.from(cfg.tables.elementosCartas).delete().eq("id", el.id).select("id");
  if (!error && (!data || data.length === 0)) {
    setStatusVisible("Supabase no borró el punto: falta el permiso de borrado. Corre el Paso 21 en el editor SQL.", "warn");
    mostrarAvisoFlotante("Falta el permiso de borrado en Supabase (Paso 21).", "error");
    return;
  }
  if (error) {
    setStatusVisible(`No se pudo eliminar el punto: ${error.message}`, "warn");
    mostrarAvisoFlotante(`No se pudo eliminar el punto: ${error.message}`, "error");
    return;
  }
  await loadElementosCartas();
  renderModules();
  setStatusVisible("Punto de lubricación eliminado.");
  mostrarAvisoFlotante("Punto de lubricación eliminado.", "ok");
  setTimeout(clearStatus, 2500);
}

async function guardarCartaCompleta() {
  if (!isSupervisorMode()) {
    setStatus("Solo supervisor/admin puede editar la carta de lubricación.", "warn");
    mostrarAvisoFlotante("Solo supervisor/admin puede editar la carta.", "error");
    return;
  }
  const carta = selectedCarta();
  if (!carta) {
    setStatus("Selecciona una carta antes de guardar.", "warn");
    return;
  }
  const equipo = cartaEquipo(carta);
  if (!equipo) {
    setStatus("No se encontro el equipo de esta carta.", "warn");
    return;
  }
  const elementosActuales = elementosForCarta(carta, equipo);
  const firmas = {
    reviso: $("carta-editor-reviso")?.value.trim() || "",
    autorizo: $("carta-editor-autorizo")?.value.trim() || "",
    fecha: new Date().toLocaleDateString("es-MX")
  };

  setStatus("Guardando carta de lubricación...");
  mostrarAvisoFlotante("Guardando carta de lubricación...", "info");

  const esCartaReal = Boolean(carta.id) && !String(carta.id).startsWith("auto-") && !carta.__autoCarta;
  let cartaId = esCartaReal ? carta.id : null;

  const cartaPayload = {
    empresa_id: state.empresaId,
    equipo_id: equipo.id,
    planta: $("carta-editor-planta")?.value.trim() || null,
    direccion: $("carta-editor-direccion")?.value.trim() || null,
    recomendaciones: $("carta-editor-recomendaciones")?.value.trim() || null,
    firmas,
    fecha_guardado: new Date().toISOString(),
    status: "guardada",
    guardada: true,
    updated_at: new Date().toISOString()
  };

  if (cartaId) {
    const { error } = await sb.from(cfg.tables.cartas).update(cartaPayload).eq("id", cartaId);
    if (error) {
      setStatusVisible(`No se pudo actualizar la carta: ${error.message}`, "warn");
      mostrarAvisoFlotante(`No se pudo actualizar la carta: ${error.message}`, "error");
      return;
    }
  } else {
    const { data, error } = await sb.from(cfg.tables.cartas).insert(cartaPayload).select("id").single();
    if (error) {
      setStatusVisible(`No se pudo crear la carta: ${error.message}. Corre el Paso 20 si aún no lo has corrido.`, "warn");
      mostrarAvisoFlotante(`No se pudo crear la carta: ${error.message}`, "error");
      return;
    }
    cartaId = data.id;
  }

  for (let index = 0; index < elementosActuales.length; index++) {
    const el = elementosActuales[index];
    const leer = (nombreCampo) => $(`elemento-editor-${index}-${nombreCampo}`)?.value.trim() || null;
    const nombre = leer("elemento");
    const payload = {
      empresa_id: state.empresaId,
      carta_id: cartaId,
      equipo_id: equipo.id,
      npunto: Number(firstValue(el, ["npunto", "orden"], index + 1)) || index + 1,
      orden: Number(firstValue(el, ["orden", "npunto"], index + 1)) || index + 1,
      nombre,
      elemento: nombre,
      descripcion: leer("descripcion"),
      lubricante: leer("lubricante"),
      lub_inicial: leer("lub_inicial"),
      relub: leer("relub"),
      tipo: leer("tipo"),
      gramos: leer("gramos"),
      bombazos: leer("bombazos"),
      litros: leer("litros"),
      frecuencia: leer("frecuencia"),
      tarea: leer("tarea"),
      intervalo_muestreo: leer("intervalo_muestreo"),
      temp_real: leer("temp_real"),
      foto_url: cartaPuntoFoto(el) || null,
      updated_at: new Date().toISOString()
    };
    const esElementoReal = Boolean(el.id) && !String(el.id).startsWith("foto-") && !String(el.id).startsWith("nuevo-") && !el.__fotoLevantamiento && !el.__nuevo;
    if (esElementoReal) {
      const { error } = await sb.from(cfg.tables.elementosCartas).update(payload).eq("id", el.id);
      if (error) {
        setStatusVisible(`No se pudo actualizar el punto ${index + 1}: ${error.message}`, "warn");
        mostrarAvisoFlotante(`No se pudo actualizar el punto ${index + 1}: ${error.message}`, "error");
        return;
      }
    } else {
      const { error } = await sb.from(cfg.tables.elementosCartas).insert(payload);
      if (error) {
        setStatusVisible(`No se pudo guardar el punto ${index + 1}: ${error.message}. Corre el Paso 20 si aún no lo has corrido.`, "warn");
        mostrarAvisoFlotante(`No se pudo guardar el punto ${index + 1}: ${error.message}`, "error");
        return;
      }
    }
  }

  state.selectedCartaId = cartaId;
  await loadCartas();
  await loadElementosCartas();
  renderModules();
  setStatusVisible("Carta de lubricación guardada.");
  mostrarAvisoFlotante("Carta de lubricación guardada.", "ok");
  setTimeout(clearStatus, 2500);
}

async function guardarActividadExtra() {
  const user = activeUser();
  const descripcion = $("extra-descripcion")?.value.trim();
  const equipoTexto = $("extra-equipo")?.value.trim();
  const horaInicio = $("extra-hora-inicio")?.value;
  const horaFin = $("extra-hora-fin")?.value;
  const comentario = $("extra-comentario")?.value.trim();
  const evidenciaTexto = $("extra-evidencia")?.value.trim();
  const foto = $("extra-foto")?.files?.[0];

  if (isSupervisorMode()) {
    setStatus("Cambia a rol técnico/eléctrico/contratista para registrar actividad extra.", "warn");
    mostrarAvisoFlotante("Cambia a rol técnico/eléctrico/contratista para registrar.", "error");
    return;
  }

  if (!user) {
    setStatus("Selecciona un usuario de prueba antes de guardar la actividad extra.", "warn");
    mostrarAvisoFlotante("Selecciona un usuario de prueba antes de enviar.", "error");
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

  const { error } = await sb
    .from(cfg.tables.actividades)
    .insert({
      empresa_id: state.empresaId,
      equipo_id: equipoRelacionado?.id || null,
      equipo_texto: equipoTexto,
      tipo: "extra",
      descripcion,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      horas_hombre: horasEntre(horaInicio, horaFin),
      comentario,
      status: "pendiente_revision",
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
    });

  if (error) {
    setStatus(`Supabase no dejó guardar actividad extra: ${error.message}. Corre el Paso 11 si aún no lo has corrido.`, "warn");
    mostrarAvisoFlotante(`No se pudo enviar la actividad: ${error.message}`, "error");
    return;
  }

  await loadActividades();
  renderModules();
  mostrarAvisoFlotante("Actividad enviada a revisión.", "ok");
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
      <button class="reject-action" onclick="revisarActividadExtra('rechazado')">✕ Rechazar</button>
      <button class="approve-action" onclick="revisarActividadExtra('aprobado')">✓ Autorizar</button>
    </div>`;
}

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

async function loadFotoCounts() {
  state.fotoCounts = {};
  state.fotosEmpresa = [];
  if (!cfg.tables.fotos || !state.empresaId) return;

  const { data, error } = await sb
    .from(cfg.tables.fotos)
    .select("*")
    .eq("empresa_id", state.empresaId)
    .limit(2000);

  if (error) {
    console.warn("No se pudo contar fotos:", error.message);
    return;
  }

  state.fotosEmpresa = await Promise.all((data || []).map(withSignedFotoUrl));
  state.fotosEmpresa.forEach(row => {
    if (!row.equipo_id) return;
    state.fotoCounts[row.equipo_id] = (state.fotoCounts[row.equipo_id] || 0) + 1;
  });
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
      file_name: "Foto migrada desde carta",
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
  } catch (err) {
    console.warn("No se pudo cargar levantamiento/fotos:", err.message);
    setStatus(`No se pudo leer levantamiento/fotos: ${err.message}`, "warn");
  } finally {
    state.levantamientoLoading = false;
    renderModules();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

function renderDashboard() {
  const empresa = activeEmpresa();
  const equipos = state.equipos;
  const areas = groupByArea(equipos);
  const activeModules = MODULES.filter(m => moduleEnabled(m.id));
  applyCompanyTheme(empresa);
  renderCompanyLogo(empresa);
  $("session-company").textContent = empresa?.nombre || "Sin empresa";
  $("empresa-nombre").textContent = empresa?.nombre || "Selecciona una empresa";
  $("empresa-sub").textContent = `Logo, color y datos filtrados por empresa_id: ${state.empresaId || "sin empresa"}`;
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

function renderEquipos() {
  const q = $("search").value.trim().toLowerCase();
  const areaFiltro = state.equiposAreaFiltro;
  const areaSelect = $("equipos-area-filter");
  if (areaSelect) {
    const areas = groupByArea(state.equipos).map(([area]) => area);
    areaSelect.innerHTML = `<option value="">Todas las áreas</option>` +
      areas.map(area => `<option value="${escapeHtml(area)}" ${area === areaFiltro ? "selected" : ""}>${escapeHtml(area)}</option>`).join("");
  }
  const equipos = state.equipos.filter(e => {
    const haystack = [e.id_tag, e.nombre_equipo, e.area, e.proceso, e.sistema].join(" ").toLowerCase();
    const matchQ = !q || haystack.includes(q);
    const matchArea = !areaFiltro || (e.area || "SIN ÁREA") === areaFiltro;
    return matchQ && matchArea;
  });
  $("equipos-list").innerHTML = equipos.map(e => {
    const crit = String(e.criticidad || "C").toUpperCase();
    const fotoCount = state.fotoCounts[e.id] || 0;
    return `<button class="equipo-row equipo-button ${e.id === state.selectedEquipoId ? "selected" : ""}" onclick="selectEquipo('${escapeHtml(e.id)}')">
      <div class="equipo-top">
        <div>
          <div class="tag">${escapeHtml(e.id_tag || "SIN TAG")}</div>
          <strong>${escapeHtml(e.nombre_equipo || "Sin nombre")}</strong>
          <div class="muted">${escapeHtml(e.area || "Sin área")} - ${escapeHtml(e.proceso || "Sin proceso")}</div>
        </div>
        <div class="row-badges">
          ${fotoCount ? `<span class="pill photo-pill">${fotoCount} fotos</span>` : ""}
          <span class="pill crit-${escapeHtml(crit)}">Crit ${escapeHtml(crit)}</span>
        </div>
      </div>
    </button>`;
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
        const title = foto.categoria || foto.tipo || foto.file_name || "Foto";
        const puedeEliminar = fotosReales.has(String(foto.id));
        const botonEliminar = puedeEliminar
          ? `<button class="photo-delete-button" type="button" title="Eliminar foto" aria-label="Eliminar foto" onclick="event.stopPropagation(); eliminarFotoLevantamiento('${escapeHtml(String(foto.id))}')">&times;</button>`
          : "";
        return `<article class="photo-card">
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
            <p class="eyebrow">Levantamiento del equipo</p>
            <h2>${escapeHtml(equipo.id_tag || "SIN TAG")}</h2>
            <p><strong>${escapeHtml(equipo.nombre_equipo || "Sin nombre")}</strong></p>
            <p>${escapeHtml(equipo.area || "Sin área")} - ${escapeHtml(equipo.proceso || "Sin proceso")}</p>
            <div class="lift-meta">
              <span class="pill">${escapeHtml(status)}</span>
              <span class="muted">${state.levantamientoLoading ? "Cargando fotos..." : `${fotos.length} fotos`}</span>
            </div>
            ${state.levantamiento?.descripcion ? `<p>${escapeHtml(state.levantamiento.descripcion)}</p>` : ""}
            ${renderLubricantesDeEquipo(equipo.id)}
            <div class="photo-grid" aria-label="Fotos de levantamiento">${state.levantamientoLoading ? `<div class="photo-empty wide">Cargando evidencia...</div>` : fotosHtml}</div>
          </div>
          <div class="photo-uploader">
            <strong>Agregar foto de levantamiento</strong>
            <label>Tipo de foto
              <select id="levantamiento-categoria">
                <option value="foto_equipo">Foto equipo</option>
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
              <span class="lubricante-card-tipo">${escapeHtml(l.tipo || "Grasa")}</span>
              <strong>${escapeHtml(l.nombre)}</strong>
              <span class="lubricante-card-marca">${escapeHtml(l.marca || "Sin marca")}</span>
              ${presPrincipal ? `<span class="lubricante-card-spec">${escapeHtml(presentacionTexto(presPrincipal))}</span>` : ""}
              <span class="lubricante-card-equipos">⚙️ ${equiposCount} equipo${equiposCount === 1 ? "" : "s"} asociado${equiposCount === 1 ? "" : "s"}</span>
            </div>
            ${(l.ficha_tecnica_data_url || l.msds_data_url) ? `<span class="lubricante-card-ficha" title="Tiene documentos adjuntos">📎</span>` : ""}
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
          const isMigrada = !String(row.id || "").startsWith("pendiente-");
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
                <span class="saved-pill">${isMigrada ? cartaStatus(row) : "Pendiente"}</span>
                <small>${escapeHtml(fecha)}</small>
              </div>
              <span class="arrow-link" aria-hidden="true">&rsaquo;</span>
            </article>
          `;
        }).join("") : `<div class="empty-state">Aún no hay cartas migradas para esta empresa.</div>`;
        const elementosHtml = elementos.length ? elementos.map((el, index) => `
          <tr>
            <td class="legacy-point-photo">
              <strong>${escapeHtml(firstValue(el, ["npunto", "orden"], index + 1))}</strong>
              ${cartaPuntoFoto(el) ? `<img src="${escapeHtml(cartaPuntoFoto(el))}" alt="" referrerpolicy="no-referrer">` : ""}
            </td>
            <td>${escapeHtml(firstValue(el, ["elemento", "nombre", "componente"], "Elemento"))}</td>
            <td>${escapeHtml(firstValue(el, ["descripcion", "desc", "detalle"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["lubricante", "lub", "producto"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["lub_inicial", "lubInicial", "lubricacion_inicial", "inicial"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["relub", "re_lub", "relubricacion"], ""))}</td>
            <td>${escapeHtml(elementoTipoCantidad(el))}</td>
            <td>${escapeHtml(elementoBombaLitros(el))}</td>
            <td>${escapeHtml(firstValue(el, ["frecuencia", "frec"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["tarea", "actividad"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["int_muestreo", "int", "intervalo_muestreo"], ""))}</td>
            <td>${escapeHtml(firstValue(el, ["temp_real", "temp", "temperatura", "temperatura_real"], ""))}</td>
          </tr>
        `).join("") : `
          <tr>
            <td colspan="12" class="empty-table">Sin elementos migrados todavía. Corre el diagnóstico/migración de elementos para llenar la tabla.</td>
          </tr>
        `;
        const firmas = typeof carta?.firmas === "object" && carta?.firmas ? carta.firmas : {};
        const firmaReviso = firstValue(firmas, ["reviso", "reviso_nombre"], "");
        const firmaFecha = firstValue(firmas, ["fecha", "fecha_actualizacion"], cartaFecha(carta));
        const firmaAutorizo = firstValue(firmas, ["autorizo", "autorizo_nombre"], "");
        const recomendaciones = firstValue(carta, ["recomendaciones", "recomendacion", "observaciones"], "");
        const operadorCarta = firstValue(activeUser(), ["nombre", "usuario"], "admin");
        const panelCarta = carta ? `
          <section class="legacy-carta-preview">
            <div class="legacy-toolbar">
              <div>
                ${detailMode ? `<button class="back-action" onclick="volverListaCartas()">&#8592;</button>` : ""}
                <strong>${escapeHtml(cartaTag(carta, equipo))}</strong>
                <span>${escapeHtml(cartaNombre(carta, equipo))}</span>
              </div>
              <button class="secondary-action" onclick="imprimirCarta()">Imprimir / PDF</button>
            </div>
            <div class="legacy-card">
              <header class="legacy-card-head">
                <div class="legacy-brand"><img src="${escapeHtml(companyLogoUrl(activeEmpresa()) || "./assets/logo-covia.png")}" alt=""></div>
                <div>
                  <h3>CARTA DE LUBRICACIÓN</h3>
                  <span>SISTEMA DE GESTIÓN DE LUBRICACIÓN INDUSTRIAL - MOLUB</span>
                </div>
                <div class="legacy-site-box">
                  <strong>PLANTA:</strong><span>${escapeHtml(firstValue(carta, ["planta"], activeEmpresa()?.nombre || "Sin planta"))}</span>
                  <strong>DIRECCIÓN:</strong><span>${escapeHtml(firstValue(carta, ["direccion"], firstValue(activeEmpresa(), ["direccion", "ubicacion"], "Lampazos de Naranjo, N.L.")))}</span>
                  <strong>FECHA:</strong><span>${escapeHtml(cartaFecha(carta))}</span>
                </div>
              </header>
              <section class="legacy-equipment">
                <div class="legacy-photo">${cartaFoto(carta, equipo) ? `<img src="${escapeHtml(cartaFoto(carta, equipo))}" alt="" referrerpolicy="no-referrer">` : `<span>Foto equipo</span>`}</div>
                <div class="legacy-meta-grid">
                  <label>NOMBRE EQUIPO<strong>${escapeHtml(cartaNombre(carta, equipo))}</strong></label>
                  <label>ID TAG<strong>${escapeHtml(cartaTag(carta, equipo))}</strong></label>
                  <label>ÁREA<strong>${escapeHtml(cartaArea(carta, equipo))}</strong></label>
                  <label>CRITICIDAD<strong>${escapeHtml(cartaCriticidad(carta, equipo))}</strong></label>
                  <label>SISTEMA<strong>${escapeHtml(cartaSistema(carta, equipo))}</strong></label>
                  <label>ELEMENTOS<strong>${escapeHtml(elementos.length)} puntos de lubricación</strong></label>
                </div>
              </section>
              <div class="legacy-section-title">ELEMENTOS TRIBOLÓGICOS - PUNTOS DE LUBRICACIÓN</div>
              <div class="legacy-table-wrap">
                <table class="legacy-elements-table">
                  <thead>
                    <tr>
                      <th>Foto punto</th>
                      <th>Elemento</th>
                      <th>Descripción</th>
                      <th>Lubricante</th>
                      <th>Lub. inicial</th>
                      <th>Re-Lub.</th>
                      <th>Tipo / Cant.</th>
                      <th>Bomb. / Litros</th>
                      <th>Frecuencia</th>
                      <th>Tarea</th>
                      <th>Int. muestreo</th>
                      <th>Temp. real</th>
                    </tr>
                  </thead>
                  <tbody>${elementosHtml}</tbody>
                </table>
              </div>
              <section class="legacy-recommendations">
                <h4>RECOMENDACIONES DE MONITOREO E INSPECCIÓN</h4>
                <p>${escapeHtml(recomendaciones)}</p>
              </section>
              <section class="legacy-signatures">
                <div>
                  <span>REVISÓ</span>
                  <strong>Departamento de Lubricación</strong>
                  <i></i>
                  <p><b>Nombre:</b> ${escapeHtml(firmaReviso)}</p>
                </div>
                <div>
                  <span>FECHA DE ACTUALIZACIÓN</span>
                  <strong>Control de versiones</strong>
                  <i></i>
                  <p><b>Fecha:</b> ${escapeHtml(firmaFecha)}</p>
                </div>
                <div>
                  <span>AUTORIZÓ</span>
                  <strong>Autorización</strong>
                  <i></i>
                  <p><b>Nombre:</b> ${escapeHtml(firmaAutorizo)}</p>
                </div>
              </section>
              <footer class="legacy-footer-bar">
                <span>COVIA LAMPAZOS - MOLUB - Generada el ${escapeHtml(cartaFecha(carta))}</span>
                <span>Operador: ${escapeHtml(operadorCarta)}</span>
              </footer>
            </div>
          </section>
        ` : `
          <section>
            <div class="empty-state">Selecciona una carta para ver el detalle.</div>
          </section>
        `;
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
              <div class="legacy-page-hero">
                <div>
                  <p class="eyebrow">Cartas realizadas</p>
                  <h2>Cartas realizadas</h2>
                  <p>Cartas migradas desde el sistema anterior hacia MOLUB.</p>
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
        </div>
        <button>Preparar migración</button>`;
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
  const { data: cartaRow, error } = await sb
    .from(cfg.tables.cartas)
    .select("empresa_id")
    .eq("id", cartaId)
    .maybeSingle();

  if (error || !cartaRow) {
    setStatus("No se encontró la carta de esa liga o código QR. Puede que haya sido eliminada.", "error");
    await loadEmpresas();
    $("empresa-select").value = state.empresaId;
    syncAuthLockedControls();
    await loadEquipos();
    ocultarPantallaCargaQr();
    return;
  }

  state.empresaId = cartaRow.empresa_id;
  await loadEmpresas();
  $("empresa-select").value = state.empresaId;
  syncAuthLockedControls();
  await loadEquipos();
  state.selectedCartaId = cartaId;
  state.cartaDetailMode = true;
  state.vistaQr = true;
  document.body.classList.add("vista-qr");
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

$("empresa-select").addEventListener("change", async (event) => {
  state.empresaId = event.target.value;
  state.selectedEquipoId = "";
  state.selectedUserId = "";
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
  applyAuthSession(session, !bootstrapping).catch(err => {
    console.warn("No se pudo sincronizar sesion:", err.message);
  });
});

init();
