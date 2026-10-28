// ============================================================
// ADMINISTRAR USUARIOS — panel para que Admin MOLUB pueda crear
// cuentas, cambiar rol/empresa y desactivar usuarios desde la propia
// app, sin tener que entrar a Supabase a mano.
// ============================================================
// Noveno modulo separado de app.js, mismo patron que los anteriores:
// se carga ANTES que app.js en index.html. Depende de utilidades
// compartidas que siguen en app.js ($, escapeHtml, mostrarAvisoFlotante,
// setStatus, esAdminMolub, activeEmpresa, renderModules, sb, cfg,
// state) y de que window.supabase (el SDK, cargado por CDN) siga
// disponible para abrir un cliente aparte al crear un usuario nuevo.
//
// Por que un cliente aparte al crear un usuario: sb.auth.signUp()
// normalmente deja iniciada la sesion del usuario que se acaba de
// crear en ese mismo cliente - si se usara el cliente "sb" de
// siempre, sacaria de su propia sesion al Admin MOLUB que esta
// creando la cuenta. Un cliente temporal, sin guardar sesion
// (persistSession:false), evita ese problema por completo.

function toggleUsuarioForm() {
  if (!esAdminMolub()) return;
  state.usuariosFormAbierto = !state.usuariosFormAbierto;
  renderModules();
}

async function loadUsuariosAdmin() {
  if (!esAdminMolub() || !cfg.tables.perfiles || !state.empresaId) {
    state.usuariosAdmin = [];
    state.usuariosAdminCargado = true;
    return;
  }
  state.usuariosAdminCargando = true;
  const { data, error } = await sb
    .from(cfg.tables.perfiles)
    .select("id,nombre,email,rol,empresa_id,activo,auth_user_id")
    .eq("empresa_id", state.empresaId)
    .order("nombre");

  state.usuariosAdminCargando = false;
  state.usuariosAdminCargado = true;
  if (error) {
    console.warn("No se pudieron cargar usuarios:", error.message);
    mostrarAvisoFlotante(`No se pudieron cargar los usuarios: ${error.message}`, "error");
    state.usuariosAdmin = [];
    renderModules();
    return;
  }
  state.usuariosAdmin = data || [];
  renderModules();
}

const ROLES_USUARIO_ADMIN = [
  { value: "TECNICO_MEC", label: "Técnico mecánico" },
  { value: "TECNICO_ELC", label: "Técnico eléctrico" },
  { value: "TECNICO_CONTR", label: "Contratista" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "REVISOR_ADM", label: "Revisor MOLUB" },
  { value: "COMISIONISTA", label: "Comisionista" }
];

function etiquetaRolUsuario(rol) {
  const encontrado = ROLES_USUARIO_ADMIN.find(r => r.value === String(rol || "").toUpperCase());
  return encontrado ? encontrado.label : (rol || "Sin rol");
}

async function guardarNuevoUsuario() {
  if (!esAdminMolub()) return;
  const nombre = $("usuario-nombre")?.value.trim();
  const correo = $("usuario-correo")?.value.trim().toLowerCase();
  const rol = $("usuario-rol")?.value;
  const empresaId = $("usuario-empresa")?.value || state.empresaId;

  if (!nombre || !correo || !rol || !empresaId) {
    mostrarAvisoFlotante("Completa nombre, correo, rol y empresa antes de crear.", "error");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    mostrarAvisoFlotante("Escribe un correo válido.", "error");
    return;
  }

  setStatus("Creando usuario...", "warn");
  try {
    const clienteTemporal = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const passwordTemporal = crypto.randomUUID() + "Aa1!";
    const { data: signUpData, error: signUpError } = await clienteTemporal.auth.signUp({
      email: correo,
      password: passwordTemporal
    });
    if (signUpError) throw signUpError;
    const nuevoAuthUserId = signUpData?.user?.id;
    if (!nuevoAuthUserId) throw new Error("No se pudo obtener el usuario recién creado.");

    const { error: perfilError } = await sb.from(cfg.tables.perfiles).insert({
      auth_user_id: nuevoAuthUserId,
      nombre,
      email: correo,
      rol,
      empresa_id: empresaId,
      activo: true
    });
    if (perfilError) throw perfilError;

    const { error: resetError } = await sb.auth.resetPasswordForEmail(correo, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (resetError) {
      console.warn("Usuario creado pero no se pudo enviar el correo de acceso:", resetError.message);
    }

    ["usuario-nombre", "usuario-correo"].forEach(id => { if ($(id)) $(id).value = ""; });
    state.usuariosFormAbierto = false;
    await loadUsuariosAdmin();
    setStatus("Usuario creado.", "");
    mostrarAvisoFlotante(
      resetError
        ? `"${escapeHtml(nombre)}" fue creado, pero no se pudo enviar el correo de acceso automáticamente. Usa "Reenviar acceso" en su fila.`
        : `"${escapeHtml(nombre)}" fue creado. Le llegará un correo a ${escapeHtml(correo)} para crear su contraseña.`,
      resetError ? "warn" : "ok"
    );
  } catch (err) {
    setStatus(`No se pudo crear el usuario: ${err.message}`, "error");
    mostrarAvisoFlotante(`No se pudo crear el usuario: ${err.message}`, "error");
  }
}

async function actualizarRolUsuario(id, nuevoRol) {
  if (!esAdminMolub()) return;
  const { error } = await sb.from(cfg.tables.perfiles).update({ rol: nuevoRol }).eq("id", id);
  if (error) {
    mostrarAvisoFlotante(`No se pudo cambiar el rol: ${error.message}`, "error");
    return;
  }
  await loadUsuariosAdmin();
  mostrarAvisoFlotante("Rol actualizado.", "ok");
}

async function actualizarEmpresaUsuario(id, nuevaEmpresaId) {
  if (!esAdminMolub()) return;
  const { error } = await sb.from(cfg.tables.perfiles).update({ empresa_id: nuevaEmpresaId }).eq("id", id);
  if (error) {
    mostrarAvisoFlotante(`No se pudo cambiar la empresa: ${error.message}`, "error");
    return;
  }
  await loadUsuariosAdmin();
  mostrarAvisoFlotante("Empresa actualizada.", "ok");
}

async function toggleActivoUsuario(id, activoActual) {
  if (!esAdminMolub()) return;
  const nuevoValor = !activoActual;
  if (nuevoValor === false && !window.confirm("¿Desactivar a este usuario? Ya no podrá iniciar sesión.")) return;
  const { error } = await sb.from(cfg.tables.perfiles).update({ activo: nuevoValor }).eq("id", id);
  if (error) {
    mostrarAvisoFlotante(`No se pudo actualizar: ${error.message}`, "error");
    return;
  }
  await loadUsuariosAdmin();
  mostrarAvisoFlotante(nuevoValor ? "Usuario reactivado." : "Usuario desactivado.", "ok");
}

async function reenviarAccesoUsuario(correo) {
  if (!esAdminMolub() || !correo) return;
  mostrarAvisoFlotante(`Enviando correo de acceso a ${escapeHtml(correo)}...`, "ok");
  const { error } = await sb.auth.resetPasswordForEmail(correo, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) {
    mostrarAvisoFlotante(`No se pudo enviar el correo: ${error.message}`, "error");
    return;
  }
  mostrarAvisoFlotante(`Correo de acceso enviado a ${escapeHtml(correo)}.`, "ok");
}

function renderUsuariosAdminPanel() {
  if (!esAdminMolub()) {
    return `
      <div>
        <p class="eyebrow">Administración</p>
        <h2>Administrar usuarios</h2>
        <p class="muted">Este apartado es solo para Admin MOLUB.</p>
      </div>`;
  }

  const empresaActual = activeEmpresa();
  const filasHtml = (state.usuariosAdmin || []).length ? state.usuariosAdmin.map(u => `
    <tr>
      <td>
        <strong>${escapeHtml(u.nombre || "Sin nombre")}</strong>
        <div class="muted" style="font-size:12px">${escapeHtml(u.email || "")}</div>
      </td>
      <td>
        <select onchange="actualizarRolUsuario('${escapeHtml(u.id)}', this.value)">
          ${ROLES_USUARIO_ADMIN.map(r => `<option value="${r.value}" ${String(u.rol || "").toUpperCase() === r.value ? "selected" : ""}>${escapeHtml(r.label)}</option>`).join("")}
        </select>
      </td>
      <td>
        <select onchange="actualizarEmpresaUsuario('${escapeHtml(u.id)}', this.value)">
          ${(state.empresas || []).map(e => `<option value="${escapeHtml(e.id)}" ${String(u.empresa_id) === String(e.id) ? "selected" : ""}>${escapeHtml(e.nombre)}</option>`).join("")}
        </select>
      </td>
      <td>
        <button type="button" class="secondary-action" onclick="reenviarAccesoUsuario('${escapeHtml(u.email || "")}')">Reenviar acceso</button>
      </td>
      <td>
        <button type="button" class="${u.activo ? "secondary-action" : "primary-action"}" onclick="toggleActivoUsuario('${escapeHtml(u.id)}', ${u.activo ? "true" : "false"})">${u.activo ? "Desactivar" : "Reactivar"}</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="empty-state">Todavía no hay usuarios registrados para ${escapeHtml(empresaActual?.nombre || "esta empresa")}.</td></tr>`;

  const formularioHtml = state.usuariosFormAbierto ? `
    <div class="form-preview">
      <label>Nombre completo<input id="usuario-nombre" placeholder="Ej. Eliud Cerda"></label>
      <label>Correo<input id="usuario-correo" type="email" placeholder="correo@empresa.com"></label>
      <div class="two-cols">
        <label>Rol
          <select id="usuario-rol">
            ${ROLES_USUARIO_ADMIN.map(r => `<option value="${r.value}">${escapeHtml(r.label)}</option>`).join("")}
          </select>
        </label>
        <label>Empresa
          <select id="usuario-empresa">
            ${(state.empresas || []).map(e => `<option value="${escapeHtml(e.id)}" ${String(state.empresaId) === String(e.id) ? "selected" : ""}>${escapeHtml(e.nombre)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="form-action"><button onclick="guardarNuevoUsuario()">Crear usuario</button></div>
      <small class="muted">Al crear el usuario se le manda un correo para que cree su propia contraseña — nadie la ve ni la escribe aquí.</small>
    </div>
  ` : "";

  return `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h2>Administrar usuarios</h2>
      </div>
      <button type="button" class="primary-action" onclick="toggleUsuarioForm()">${state.usuariosFormAbierto ? "✕ Cerrar" : "+ Agregar usuario"}</button>
    </div>
    <p class="muted">Usuarios de ${escapeHtml(empresaActual?.nombre || "la empresa activa")}. Para ver o agregar usuarios de otra empresa, cámbiala arriba en "Empresa activa".</p>
    ${formularioHtml}
    <div class="lube-uso-table-wrap">
      <table class="lube-uso-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Empresa</th><th></th><th></th></tr></thead>
        <tbody>${state.usuariosAdminCargando ? `<tr><td colspan="5" class="empty-state">Cargando usuarios...</td></tr>` : filasHtml}</tbody>
      </table>
    </div>
  `;
}
