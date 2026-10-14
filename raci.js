// ============================================================
// MATRIZ RACI — módulo de gobernanza (quién Responsable / Aprueba /
// Consulta / se le Informa, por actividad, por empresa)
// ============================================================
// Primer módulo separado de app.js, como prueba del nuevo patrón de
// organizar el código por tema en vez de un solo archivo gigante.
// Depende solo de utilidades compartidas que siguen viviendo en
// app.js ($ , escapeHtml, mostrarAvisoFlotante, isSupervisorMode,
// activeEmpresa, sb, cfg, state, renderModules) — por eso este
// archivo se carga ANTES que app.js en index.html.

const RACI_LEYENDA = {
  R: "Responsable — Ejecuta",
  A: "Aprobador — Autoriza y rinde cuentas",
  C: "Consultado — Aporta opinión o información",
  I: "Informado — Se mantiene al tanto"
};

function raciDefault() {
  const roles = ["Dirección", "Ingeniería", "Mantto.", "Lubricador", "Compras"];
  const filas = [
    ["Definir política de lubricación", "A", "C", "C", "I", "I"],
    ["Aprobar objetivos y recursos", "A", "R", "C", "I", "C"],
    ["Seleccionar lubricantes", "I", "R", "C", "C", "A"],
    ["Ejecutar plan de lubricación", "I", "C", "R", "R", "I"],
    ["Monitorear y analizar resultados", "C", "R", "R", "C", "I"],
    ["Auditoría y mejora continua", "A", "R", "R", "C", "I"]
  ];
  return { roles, actividades: filas.map(([nombre, ...valores]) => ({ nombre, valores })) };
}

async function loadRaciMatriz() {
  state.raciMatriz = null;
  if (!cfg.tables.raciMatriz || !state.empresaId) return;
  const { data, error } = await sb
    .from(cfg.tables.raciMatriz)
    .select("id,empresa_id,roles,actividades,updated_at")
    .eq("empresa_id", state.empresaId)
    .maybeSingle();
  if (error) {
    console.warn("No se pudo cargar la matriz RACI:", error.message);
    return;
  }
  state.raciMatriz = data || null;
}

function raciDraftActual() {
  if (!state.raciDraft || state.raciDraftEmpresaId !== state.empresaId) {
    const base = state.raciMatriz
      ? { roles: [...(state.raciMatriz.roles || [])], actividades: (state.raciMatriz.actividades || []).map(a => ({ nombre: a.nombre, valores: [...(a.valores || [])] })) }
      : raciDefault();
    state.raciDraft = base;
    state.raciDraftEmpresaId = state.empresaId;
  }
  return state.raciDraft;
}

function raciSincronizarDesdeDOM() {
  const draft = raciDraftActual();
  draft.roles = draft.roles.map((rol, i) => { const v = $(`raci-rol-${i}`)?.value.trim(); return v || rol; });
  draft.actividades.forEach((act, i) => { const v = $(`raci-act-${i}`)?.value.trim(); if (v) act.nombre = v; });
}

function raciAgregarRol() {
  if (!isSupervisorMode()) return;
  raciSincronizarDesdeDOM();
  const draft = raciDraftActual();
  draft.roles.push("Nuevo rol");
  draft.actividades.forEach(a => a.valores.push(""));
  renderModules();
}

function raciQuitarRol(idx) {
  if (!isSupervisorMode()) return;
  raciSincronizarDesdeDOM();
  const draft = raciDraftActual();
  if (draft.roles.length <= 1) {
    mostrarAvisoFlotante("Debe quedar al menos un rol.", "error");
    return;
  }
  draft.roles.splice(idx, 1);
  draft.actividades.forEach(a => a.valores.splice(idx, 1));
  renderModules();
}

function raciAgregarActividad() {
  if (!isSupervisorMode()) return;
  raciSincronizarDesdeDOM();
  const draft = raciDraftActual();
  draft.actividades.push({ nombre: "Nueva actividad", valores: draft.roles.map(() => "") });
  renderModules();
}

function raciQuitarActividad(idx) {
  if (!isSupervisorMode()) return;
  raciSincronizarDesdeDOM();
  raciDraftActual().actividades.splice(idx, 1);
  renderModules();
}

function raciCambiarValor(actIdx, rolIdx, valor) {
  if (!isSupervisorMode()) return;
  raciDraftActual().actividades[actIdx].valores[rolIdx] = valor;
}

async function guardarRaciMatriz() {
  if (!isSupervisorMode()) {
    mostrarAvisoFlotante("Solo supervisor/admin puede editar la matriz RACI.", "error");
    return;
  }
  raciSincronizarDesdeDOM();
  const draft = raciDraftActual();
  const payload = {
    empresa_id: state.empresaId,
    roles: draft.roles,
    actividades: draft.actividades,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from(cfg.tables.raciMatriz).upsert(payload, { onConflict: "empresa_id" });
  if (error) {
    mostrarAvisoFlotante(`No se pudo guardar la matriz RACI: ${error.message}. Corre el Paso 38 en Supabase si aún no lo has corrido.`, "error");
    return;
  }
  await loadRaciMatriz();
  state.raciDraft = null;
  renderModules();
  mostrarAvisoFlotante("Matriz RACI guardada.", "ok");
}

function renderRaciMatriz() {
  const draft = raciDraftActual();
  const editable = isSupervisorMode();
  const headerCols = draft.roles.map((rol, i) => `
    <th>
      ${editable ? `
        <div class="raci-col-head">
          <input id="raci-rol-${i}" value="${escapeHtml(rol)}" class="raci-rol-input">
          <button type="button" class="icon-danger-button" title="Quitar rol" onclick="raciQuitarRol(${i})">&times;</button>
        </div>` : escapeHtml(rol)}
    </th>`).join("");

  const filas = draft.actividades.length ? draft.actividades.map((act, ai) => `
    <tr>
      <td class="raci-actividad-cell">
        ${editable ? `<input id="raci-act-${ai}" value="${escapeHtml(act.nombre)}" class="raci-act-input">` : escapeHtml(act.nombre)}
      </td>
      ${draft.roles.map((rol, ri) => {
        const val = act.valores[ri] || "";
        return `<td class="raci-valor-cell">
          ${editable
            ? `<select class="raci-select raci-${val || "vacio"}" onchange="raciCambiarValor(${ai},${ri},this.value); this.className='raci-select raci-'+(this.value||'vacio')">
                <option value="" ${!val ? "selected" : ""}>—</option>
                ${["R", "A", "C", "I"].map(l => `<option value="${l}" ${val === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>`
            : (val ? `<span class="raci-badge raci-${escapeHtml(val)}">${escapeHtml(val)}</span>` : `<span class="muted">—</span>`)}
        </td>`;
      }).join("")}
      ${editable ? `<td class="raci-quitar-fila"><button type="button" class="icon-danger-button" title="Quitar actividad" onclick="raciQuitarActividad(${ai})">&times;</button></td>` : ""}
    </tr>`).join("") : `<tr><td colspan="${draft.roles.length + 2}" class="empty-table">Todavía no hay actividades en esta matriz.</td></tr>`;

  return `
    <div class="module-wide">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Gobernanza</p>
          <h2>Matriz RACI</h2>
          <span class="muted">Quién ejecuta, quién aprueba, a quién se consulta y a quién se informa en el programa de lubricación de ${escapeHtml(activeEmpresa()?.nombre || "esta empresa")}.</span>
        </div>
      </div>
      <div class="raci-leyenda">
        ${["R", "A", "C", "I"].map(l => `<span class="raci-leyenda-item"><span class="raci-badge raci-${l}">${l}</span><span>${escapeHtml(RACI_LEYENDA[l])}</span></span>`).join("")}
      </div>
      <div class="raci-table-wrap">
        <table class="raci-table">
          <thead><tr><th>Actividad</th>${headerCols}${editable ? "<th></th>" : ""}</tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${editable ? `
        <div class="raci-actions">
          <button class="secondary-action" onclick="raciAgregarRol()">+ Agregar rol</button>
          <button class="secondary-action" onclick="raciAgregarActividad()">+ Agregar actividad</button>
          <button class="primary-action" onclick="guardarRaciMatriz()">Guardar cambios</button>
        </div>` : ""}
    </div>`;
}
