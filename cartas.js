// ============================================================
// CARTAS DE LUBRICACIÓN — el corazón del producto: la ficha técnica
// por equipo (puntos de lubricación, estatus Pendiente/Guardada,
// impresión/PDF, código QR, descarga masiva) y su editor.
// ============================================================
// Tercer módulo separado de app.js (los primeros fueron raci.js y
// lubricantes.js), mismo patrón: movimiento de código, no
// reescritura. Depende de utilidades compartidas que siguen en
// app.js ($, escapeHtml, firstValue, activeUser, activeEmpresa,
// mostrarAvisoFlotante, isSupervisorMode, abrirModal, sb, cfg,
// state, renderModules, cargarFotosDeEquipoConUrl,
// cargarFotosDeElementosCarta, fotosPuntosDeEquipo,
// fotoPuntoCartaRow, fotosEmpresaDeEquipo, fotoSrc, esFotoEquipo,
// autoCartaFromEquipo) — por eso este archivo se carga ANTES que
// app.js en index.html.

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

function cartaTienePuntosConLubricante(carta, equipo) {
  return elementosForCarta(carta, equipo).some(el => String(firstValue(el, ["lubricante", "lub", "producto"], "")).trim());
}

function cartaStatus(carta, equipo = cartaEquipo(carta)) {
  const raw = String(firstValue(carta, ["status", "estado"], "guardada")).toLowerCase();
  if (raw.includes("pend")) return "Pendiente";
  if (raw.includes("guard") || raw.includes("aprob")) {
    // Una carta puede tener status "guardada" en la base de datos
    // (por ejemplo, cartas viejas migradas) sin tener realmente
    // ningun punto con lubricante capturado. Eso no cuenta como
    // "Guardada" de verdad: sigue faltando llenarla.
    return cartaTienePuntosConLubricante(carta, equipo) ? "Guardada" : "Pendiente";
  }
  return raw || "Guardada";
}

function cartaStatusPillClass(carta, equipo) {
  return cartaStatus(carta, equipo) === "Pendiente" ? "saved-pill pendiente" : "saved-pill";
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

async function seleccionarCarta(id) {
  state.selectedCartaId = id;
  state.cartaDetailMode = true;
  renderModules();
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  const carta = selectedCarta();
  const equipo = cartaEquipo(carta);
  await Promise.all([
    equipo?.id ? cargarFotosDeEquipoConUrl(equipo.id) : Promise.resolve(),
    cargarFotosDeElementosCarta(id, equipo?.id)
  ]);
  if (String(state.selectedCartaId) === String(id)) renderModules();
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

function legacyCardBodyHtml(carta, equipo, elementos) {
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
      <td colspan="12" class="empty-table">Esta carta todavía no tiene puntos de lubricación registrados.</td>
    </tr>
  `;
  const firmas = typeof carta?.firmas === "object" && carta?.firmas ? carta.firmas : {};
  const firmaReviso = firstValue(firmas, ["reviso", "reviso_nombre"], "");
  const firmaFecha = firstValue(firmas, ["fecha", "fecha_actualizacion"], cartaFecha(carta));
  const firmaAutorizo = firstValue(firmas, ["autorizo", "autorizo_nombre"], "");
  const recomendaciones = firstValue(carta, ["recomendaciones", "recomendacion", "observaciones"], "");
  const operadorCarta = firstValue(activeUser(), ["nombre", "usuario"], "admin");
  return `
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
        <div class="legacy-photo">${cartaFoto(carta, equipo) ? `<img src="${escapeHtml(cartaFoto(carta, equipo))}" alt="" referrerpolicy="no-referrer">` : `<span>Foto completa del equipo</span>`}</div>
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
    </div>`;
}

function construirPanelCarta(carta, equipo, elementos, detailMode) {
  if (!carta) {
    return `
      <section>
        <div class="empty-state">Selecciona una carta para ver el detalle.</div>
      </section>
    `;
  }
  return `
    <section class="legacy-carta-preview">
      <div class="legacy-toolbar">
        <div>
          ${detailMode ? `<button class="back-action" onclick="volverListaCartas()">&#8592;</button>` : ""}
          <strong>${escapeHtml(cartaTag(carta, equipo))}</strong>
          <span>${escapeHtml(cartaNombre(carta, equipo))}</span>
        </div>
        <button class="secondary-action" onclick="imprimirCarta()">Imprimir / PDF</button>
      </div>
      ${legacyCardBodyHtml(carta, equipo, elementos)}
    </section>
  `;
}

function imprimirCarta() {
  setStatus("Usa Ctrl+P o el diálogo del navegador para imprimir/PDF la carta visible.", "warn");
  window.print();
}

function cartasGuardadasDeEmpresa() {
  return (state.cartas || []).filter(carta => cartaStatus(carta, cartaEquipo(carta)) === "Guardada");
}

function esperarImagenesCargadas(container, timeoutMs = 20000) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      const listo = () => { img.removeEventListener("load", listo); img.removeEventListener("error", listo); resolve(); };
      img.addEventListener("load", listo, { once: true });
      img.addEventListener("error", listo, { once: true });
      setTimeout(listo, timeoutMs);
    });
  }));
}

async function descargarTodasLasCartas() {
  const candidatas = cartasGuardadasDeEmpresa();
  if (!candidatas.length) {
    mostrarAvisoFlotante("Aún no hay cartas guardadas con información capturada para descargar.", "warn");
    return;
  }
  const panel = document.querySelector("#cartas .module-panel");
  if (!panel) return;
  mostrarAvisoFlotante(`Preparando ${candidatas.length} carta(s), cargando fotos de los puntos...`, "ok");
  // Las fotos de los puntos no se traen en la carga normal de la
  // lista (para no descargar de mas - ver ELEMENTOS_CARTA_SELECT_LISTA).
  // Hay dos fuentes posibles: el propio punto en elementos_lubricacion
  // (cargarFotosDeElementosCarta) y las fotos de "Ingresar a planta"
  // categoria "Punto de lubricacion" que se acomodan por equipo
  // (cargarFotosDeEquipoConUrl). Una carta real puede depender de
  // cualquiera de las dos, asi que se piden ambas antes de armar el PDF.
  const equiposUnicos = [...new Set(candidatas.map(c => c.equipo_id).filter(Boolean))];
  await Promise.all([
    ...candidatas.map(carta => cargarFotosDeElementosCarta(carta.id, carta.equipo_id)),
    ...equiposUnicos.map(equipoId => cargarFotosDeEquipoConUrl(equipoId))
  ]);
  const html = candidatas.map(carta => {
    const equipo = cartaEquipo(carta);
    const elementos = elementosForCarta(carta, equipo);
    return `<div class="legacy-carta-preview legacy-carta-page">${legacyCardBodyHtml(carta, equipo, elementos)}</div>`;
  }).join("");
  panel.innerHTML = `<div class="module-wide cartas-realizadas-view">${html}</div>`;
  // Los datos de las fotos ya estan listos, pero cada <img> todavia
  // tiene que descargarse/pintarse en pantalla (muchas son fotos
  // migradas con liga firmada, no vienen incrustadas). Si se manda
  // a imprimir antes de que terminen de cargar, salen en blanco -
  // por eso se espera a que carguen todas antes de abrir el dialogo.
  mostrarAvisoFlotante(`Cargando las fotos en pantalla (puede tardar unos segundos con ${candidatas.length} cartas)...`, "ok");
  await esperarImagenesCargadas(panel);
  state.imprimiendoTodas = true;
  document.getElementById("aviso-flotante")?.classList.remove("show");
  window.print();
}

window.addEventListener("afterprint", () => {
  if (state.imprimiendoTodas) {
    state.imprimiendoTodas = false;
    renderModules();
  }
});

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
    if (canvas && link) link.href = qrConEtiquetaDataUrl(canvas, tag, nombre);
  }, 60);
}

function truncarTextoCanvas(ctx, texto, maxWidth) {
  if (ctx.measureText(texto).width <= maxWidth) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(corto + "…").width > maxWidth) {
    corto = corto.slice(0, -1);
  }
  return corto + "…";
}

function qrConEtiquetaDataUrl(qrCanvas, tag, nombre) {
  const pad = 20;
  const anchoMinimo = qrCanvas.width + pad * 2;
  const anchoTexto = 320;
  const out = document.createElement("canvas");
  out.width = Math.max(anchoMinimo, anchoTexto + pad * 2);
  out.height = qrCanvas.width + pad * 2 + 34 + (nombre ? 24 : 0);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qrCanvas, (out.width - qrCanvas.width) / 2, pad);
  ctx.textAlign = "center";
  ctx.fillStyle = "#07112e";
  ctx.font = "bold 22px Arial";
  ctx.fillText(truncarTextoCanvas(ctx, tag || "", out.width - pad * 2), out.width / 2, qrCanvas.width + pad + 26);
  if (nombre) {
    ctx.font = "15px Arial";
    ctx.fillStyle = "#4a5170";
    ctx.fillText(truncarTextoCanvas(ctx, nombre, out.width - pad * 2), out.width / 2, qrCanvas.width + pad + 48);
  }
  return out.toDataURL("image/png");
}

function verFotoDesdeCard(card) {
  const img = card?.querySelector("img");
  if (!img || !img.src) return;
  const title = card.querySelector("strong")?.textContent || "";
  verFotoAmpliada(img.src, title);
}

function verFotoAmpliada(src, title) {
  if (!src) return;
  abrirModal(`
    <div class="foto-ampliada">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(title || "")}" referrerpolicy="no-referrer">
      ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
    </div>
  `);
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
  if (!puedeEditarCartas()) return "";
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
  if (!puedeEditarCartas()) return;
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
  if (!puedeEditarCartas()) return;
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
  if (!puedeEditarCartas()) {
    setStatus("Solo MOLUB puede editar la carta de lubricación.", "warn");
    mostrarAvisoFlotante("Solo MOLUB puede editar la carta de lubricación.", "error");
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
  // Por seguridad: si esta carta todavia no tiene puntos guardados,
  // sus filas se arman a partir de las fotos de levantamiento del
  // equipo. Nos aseguramos de tenerlas completas (con url) antes de
  // guardar, para no perder la foto de cada punto en el primer guardado.
  await Promise.all([
    cargarFotosDeEquipoConUrl(equipo.id),
    cargarFotosDeElementosCarta(carta.id, equipo.id)
  ]);
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
  // loadElementosCartas trae la lista liviana (sin foto_url); sin
  // esto, la foto de cada punto que se acaba de guardar desaparecia
  // de la pantalla hasta volver a entrar a la carta.
  await cargarFotosDeElementosCarta(cartaId, equipo.id);
  renderModules();
  setStatusVisible("Carta de lubricación guardada.");
  mostrarAvisoFlotante("Carta de lubricación guardada.", "ok");
  setTimeout(clearStatus, 2500);
}
