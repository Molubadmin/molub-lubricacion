# MOLUB Platform — Documentación completa y checklist

Este documento explica, de principio a fin, **todo lo que se ha construido** en este
proyecto: qué es, cómo está armado, qué problemas reales se resolvieron, y el
código completo de las partes más importantes. Al final está la checklist que
se debe seguir antes de publicar cualquier cambio.

> **Nota sobre "el código completo":** el código de la base de datos (SQL —
> tablas, seguridad, funciones) es compacto y está **completo, tal cual, en
> este documento**. El código de la aplicación (`app.js`) tiene miles de
> líneas — aquí se explica cada pieza con el **código real y completo de
> cada función clave**, pero el archivo completo vive en `app.js`, en esta
> misma carpeta del proyecto, porque pegarlo entero aquí (todo el archivo)
> lo haría casi imposible de leer y quedaría duplicado sin necesidad.

---

## 1. Qué es MOLUB Platform

Un sistema para que MOLUB (proveedor de lubricantes) gestione el servicio de
lubricación industrial que le da a sus clientes (COVIA Lampazos es el primer
cliente real, completamente cargado). Un técnico en planta escanea un equipo,
sube fotos, se arma una "carta de lubricación" (una ficha técnica por equipo
con sus puntos de lubricación), y esa carta se puede consultar o imprimir — ya
sea entrando con usuario y contraseña, o escaneando un código QR pegado en el
equipo, **sin necesitar cuenta**.

Es una sola aplicación web (sin instalación, funciona en navegador/celular)
que sirve a **varias empresas distintas a la vez**, cada una viendo solo sus
propios datos — eso es lo que técnicamente se llama "multiempresa" o
"multi-tenant".

## 2. Con qué está construido, y por qué

- **Frontend:** HTML, CSS y JavaScript "a mano" (sin React ni ningún
  framework, sin paso de compilación). Un solo archivo `app.js` contiene toda
  la lógica.
- **Backend / base de datos:** [Supabase](https://supabase.com), que por
  dentro es una base de datos Postgres real, con un sistema de
  autenticación (login) y de permisos por fila integrado.
- **Hosting:** GitHub Pages — gratis, solo sirve los archivos tal cual,
  no hay servidor propio que mantener.

**¿Por qué Supabase y no Firebase?** (pregunta que hizo el Ing. Sergio).
Los datos de este proyecto son profundamente relacionales — una empresa
tiene equipos, un equipo tiene cartas, una carta tiene puntos de
lubricación. Eso es exactamente lo que una base de datos relacional
(Postgres) maneja de forma nativa, con permisos por fila (lo que
permite todo el modelo de seguridad descrito abajo). Firebase es una
base de documentos (NoSQL): hubiera significado duplicar datos entre
documentos y armar la seguridad a mano en el cliente, mucho más frágil.

## 3. Cronología: qué se ha construido, en orden

1. **Base del sistema**: empresas, perfiles (usuarios), equipos, login.
2. **Levantamiento de equipos**: capturar fotos de cada equipo (foto
   completa, placa, puntos de lubricación, referencias).
3. **Cartas de lubricación**: la ficha técnica por equipo, con sus puntos,
   lubricantes, recomendaciones y firmas — exportable a PDF.
4. **Catálogo de lubricantes**: productos, presentaciones, documentación
   técnica (ficha técnica, MSDS), y qué equipos usan cada uno.
5. **Roles multiempresa**: cuentas de administrador (ve todas las
   empresas), comisionista (ve solo las de sus clientes), revisor interno
   de MOLUB (ve una empresa, con permisos limitados a ciertos módulos), y
   técnico/supervisor normal (ve solo la suya).
6. **Endurecimiento de seguridad real (RLS)**: cada tabla quedó protegida
   para que una empresa jamás pueda ver los datos de otra (sección 5).
7. **QR sin iniciar sesión**: cualquier técnico en planta escanea el
   código físico del equipo y ve la carta, sin usuario ni contraseña
   (sección 6).
8. **Reducción de costos (egress)**: fotos comprimidas al subir,
   cargas más ligeras, para no rebasar el límite gratuito de Supabase.
9. **Matriz RACI**: tabla de responsabilidades por empresa (quién
   Responsable/Aprueba/Consulta/se le Informa, por actividad).
10. **Historial de entradas de lubricante**: registrar cada OC (orden de
    compra) que llega, sumando automático al inventario.
11. **Ambiente de pruebas (MOLUB-PRUEBAS)**: una copia completa y aislada
    de la base de datos, para probar cambios antes de tocar producción
    (sección 7).
12. **Esta checklist**: para que todo lo anterior no dependa de la memoria
    de nadie.

---

## 4. El modelo de datos completo (todas las tablas)

Estas son las 15 tablas reales que usa la aplicación hoy (se excluyen a
propósito 2 tablas viejas sin uso, ver sección 9). Este es el código SQL
**completo y exacto** — es el mismo que arma el ambiente de pruebas desde
cero (`supabase-staging-00-schema-completo.sql`):

```sql
create extension if not exists pgcrypto;

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null,
  logo_url text,
  color_principal text default '#1228ff',
  color_acento text,
  activa boolean default true,
  activo boolean default true,
  created_at timestamptz default now()
);

create table public.perfiles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  nombre text not null,
  rol text not null default 'TECNICO',
  activo boolean default true,
  email text,
  auth_user_id uuid,
  ultimo_acceso timestamptz,
  created_at timestamptz default now()
);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  area text not null,
  proceso text,
  id_tag text not null,
  nombre_equipo text not null,
  criticidad text default 'C',
  sistema text,
  activo boolean default true,
  created_at timestamptz default now()
);

create table public.levantamientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  equipo_id uuid not null references public.equipos(id),
  usuario_id uuid,
  descripcion text,
  completo boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  equipo_id uuid references public.equipos(id),
  usuario_id uuid,
  tipo text not null,
  categoria text,
  url text not null,
  storage_path text,
  file_name text,
  mime_type text,
  created_at timestamptz default now()
);

create table public.cartas_lubricacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  equipo_id uuid not null references public.equipos(id),
  usuario_id uuid,
  planta text,
  direccion text,
  recomendaciones text,
  reviso text,
  autorizo text,
  fecha_emision date,
  guardada boolean default false,
  firmas jsonb default '{}'::jsonb,
  fecha_guardado timestamptz,
  equipo_texto text,
  folio text,
  nombre text,
  descripcion text,
  status text default 'guardada',
  foto_url text,
  foto_storage_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.elementos_lubricacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  carta_id uuid references public.cartas_lubricacion(id) on delete cascade,
  equipo_id uuid references public.equipos(id),
  npunto integer not null,
  orden integer,
  elemento text,
  nombre text,
  descripcion text,
  lubricante text,
  lub_inicial text,
  relub text,
  tipo text default 'grasa',
  gramos text,
  bombazos text,
  litros text,
  frecuencia text,
  tarea text,
  intervalo_muestreo text,
  temperatura_ambiental text,
  temp_real text,
  recomendaciones text,
  foto_url text,
  foto_storage_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.empresa_modulos_app (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  modulo text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, modulo)
);

create table public.lubricantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  nombre text,
  tipo text default 'Grasa',
  marca text,
  especificacion text,
  descripcion text,
  codigo text,
  nota text,
  activo boolean default true,
  foto_producto_nombre text,
  foto_producto_data_url text,
  ficha_tecnica_nombre text,
  ficha_tecnica_tipo text,
  ficha_tecnica_data_url text,
  msds_nombre text,
  msds_tipo text,
  msds_data_url text,
  alias_cartas text,
  color_nombre text,
  color_foto_nombre text,
  color_foto_data_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.lubricante_equipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  lubricante_id uuid not null references public.lubricantes(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id),
  componente text,
  punto_lubricacion text,
  cantidad_aplicada text,
  frecuencia text,
  created_at timestamptz default now()
);

create table public.lubricante_presentaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  lubricante_id uuid not null references public.lubricantes(id) on delete cascade,
  nombre text not null,
  cantidad numeric,
  unidad text default 'kg',
  es_principal boolean default false,
  num_envases numeric default 0,
  inventario_minimo numeric default 0,
  created_at timestamptz default now()
);

create table public.lubricante_movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lubricante_id uuid not null references public.lubricantes(id) on delete cascade,
  presentacion_id uuid references public.lubricante_presentaciones(id) on delete set null,
  tipo text not null default 'entrada',
  oc text,
  cantidad numeric not null,
  fecha_suministro date,
  nota text,
  usuario text,
  created_at timestamptz not null default now()
);

create table public.raci_matriz (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  roles jsonb not null default '[]'::jsonb,
  actividades jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique (empresa_id)
);

create table public.actividades_extra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  usuario_id uuid,
  equipo_id uuid references public.equipos(id),
  equipo_texto text,
  tipo text not null,
  descripcion text not null,
  hora_inicio time,
  hora_fin time,
  horas_hombre numeric,
  comentario text,
  foto_url text,
  storage_path text,
  foto_storage_path text,
  status text default 'pendiente',
  validado_por uuid,
  fecha_validacion timestamptz,
  motivo_rechazo text,
  codigo text,
  usuario text,
  nombre text,
  puesto text,
  equipo text,
  fecha text,
  hora text,
  usuario_nombre text,
  usuario_rol text,
  evidencia_texto text,
  evidencia_foto_nombre text,
  evidencia_foto_tipo text,
  evidencia_foto_data_url text,
  revision_status text default 'pendiente_revision',
  revision_comentario text,
  revisado_por_id uuid,
  revisado_por_nombre text,
  revisado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.tareas_asignadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  asignado_por uuid,
  asignado_a uuid,
  puesto text,
  contratista_nombre text,
  descripcion text not null,
  equipo_id uuid references public.equipos(id),
  equipo_texto text,
  prioridad text default 'normal',
  fecha_limite date,
  status text default 'pendiente',
  comentario_supervisor text,
  evidencia_comentario text,
  evidencia_foto_url text,
  evidencia_storage_path text,
  completado_fecha timestamptz,
  validado_por uuid,
  validado_fecha timestamptz,
  motivo_rechazo text,
  fecha_inicio date,
  hora_inicio time,
  fecha_fin date,
  hora_fin time,
  horas_hombre numeric,
  programada_id uuid,
  fecha_programada date,
  hora_programada time,
  tipo_programacion text,
  actividad text,
  fecha_envio date,
  hora_envio time,
  comentario text,
  tipo text default 'programada',
  asignado_nombre text,
  asignado_rol text,
  usuario_id uuid,
  cierre_comentario text,
  cierre_evidencia text,
  cerrado_por_id uuid,
  cerrado_por_nombre text,
  fecha_cierre timestamptz,
  revision_status text default 'sin_cierre',
  revision_comentario text,
  revisado_por_id uuid,
  revisado_por_nombre text,
  revisado_at timestamptz,
  cierre_foto_nombre text,
  cierre_foto_tipo text,
  cierre_foto_data_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 5. Seguridad: cómo se garantiza que una empresa nunca vea los datos de otra

Esta es la pieza más importante de todo el sistema. Se llama **RLS** (Row
Level Security / Seguridad a Nivel de Fila): una regla puesta directamente
en la base de datos, no en la aplicación — así, aunque alguien intente
saltarse la aplicación y pedir los datos directo, la base de datos igual
se los niega si no le corresponden.

**La función central** — una sola pregunta que se reutiliza en TODAS las
tablas: *"¿esta persona (ya con sesión iniciada) tiene permiso de ver datos
de esta empresa?"*

```sql
create or replace function public.tiene_acceso_a_empresa(target_empresa_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.auth_user_id = auth.uid()
      and p.activo = true
      and (p.empresa_id = target_empresa_id or p.rol ilike '%molub%')
  );
$$;
```

Traducido: "sí, si tiene un perfil activo ligado a su cuenta, y ese perfil
pertenece exactamente a esa empresa — **o** su rol contiene la palabra
MOLUB (eso es lo que hace que las cuentas de MOLUB vean todas las
empresas)".

Esa función se usa, exactamente igual, en cada una de las 14 tablas que
guardan información operativa (equipos, cartas, fotos, lubricantes, etc.):

```sql
create policy "acceso por empresa - select" on public.NOMBRE_TABLA
  for select to authenticated using (tiene_acceso_a_empresa(empresa_id));
create policy "acceso por empresa - insert" on public.NOMBRE_TABLA
  for insert to authenticated with check (tiene_acceso_a_empresa(empresa_id));
create policy "acceso por empresa - update" on public.NOMBRE_TABLA
  for update to authenticated using (tiene_acceso_a_empresa(empresa_id)) with check (tiene_acceso_a_empresa(empresa_id));
create policy "acceso por empresa - delete" on public.NOMBRE_TABLA
  for delete to authenticated using (tiene_acceso_a_empresa(empresa_id));
```

**`perfiles`** tiene una regla extra, porque cada quien debe poder ver su
propio perfil incluso antes de saber a qué empresa pertenece:

```sql
create policy "acceso perfiles select" on public.perfiles
  for select to authenticated
  using (auth_user_id = auth.uid() or tiene_acceso_a_empresa(empresa_id));
```

### El hueco de seguridad que se encontró y se cerró (14 de octubre de 2026)

Durante el arreglo del QR (ver sección 6) se había dejado, a propósito y de
forma temporal, una regla de escape en `perfiles` y `empresas` que decía
"cualquiera, sin sesión, puede leer esto". Nunca se quitó. Se encontró al
revisar la estructura completa y se cerró así:

```sql
drop policy if exists "TEMP anon read perfiles" on public.perfiles;
drop policy if exists "TEMP anon read empresas" on public.empresas;
```

---

## 6. El QR sin iniciar sesión — cómo funciona exactamente

La idea: un técnico escanea el código físico pegado en el equipo, y ve la
carta de lubricación de ese equipo, sin usuario ni contraseña. Pero sin
abrir por eso el resto del sistema a cualquiera.

**La solución correcta no es "quitar la seguridad"** — es una función muy
angosta: *"si me das el id exacto de una carta, te regreso solo esa carta,
su equipo, sus puntos y sus fotos. Nada más."* Sin ese id exacto (que solo
existe dentro del código QR físico), no sirve para ver nada:

```sql
create or replace function public.obtener_carta_publica(p_carta_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_carta record;
  resultado jsonb;
begin
  select * into v_carta from public.cartas_lubricacion where id = p_carta_id;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'carta', to_jsonb(v_carta) - 'empresa_id',
    'equipo', (select to_jsonb(eq) - 'empresa_id' from public.equipos eq where eq.id = v_carta.equipo_id),
    'elementos', coalesce((select jsonb_agg(to_jsonb(el) - 'empresa_id' order by el.orden, el.npunto) from public.elementos_lubricacion el where el.carta_id = v_carta.id), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' - 'usuario_id') from public.fotos f where f.equipo_id = v_carta.equipo_id), '[]'::jsonb),
    'empresa_nombre', (select nombre from public.empresas where id = v_carta.empresa_id)
  ) into resultado;

  return resultado;
end;
$$;

revoke all on function public.obtener_carta_publica(uuid) from public;
grant execute on function public.obtener_carta_publica(uuid) to anon, authenticated;
```

Del lado de la aplicación (`app.js`), así es como se usa esa función — nota
que, si falla, reconoce si la persona ya tenía sesión iniciada (la regresa a
su empresa normal) o si es un visitante anónimo (le muestra el login):

```js
async function abrirCartaDesdeLiga(cartaId) {
  setStatus("Cargando carta desde el código QR...");
  const { data, error } = await sb.rpc("obtener_carta_publica", { p_carta_id: cartaId });

  if (error || !data || !data.carta) {
    setStatus("No se encontró la carta de esa liga o código QR. Puede que haya sido eliminada.", "error");
    ocultarPantallaCargaQr();
    if (state.authUser) {
      await loadEmpresas();
      await loadEquipos();
    } else {
      mostrarGateAcceso();
    }
    return;
  }

  const carta = data.carta;
  state.empresaId = carta.empresa_id || state.empresaId || "";
  state.empresas = [{ id: state.empresaId, nombre: data.empresa_nombre || "", direccion: carta.direccion || "" }];
  state.equipos = data.equipo ? [data.equipo] : [];
  state.cartas = [carta];
  const [elementosFirmados, fotosFirmadas] = await Promise.all([
    Promise.all((data.elementos || []).map(withSignedFotoUrl)),
    Promise.all((data.fotos || []).map(withSignedFotoUrl))
  ]);
  state.elementosCartas = elementosFirmados.map(el => ({ ...el, __fotoCargada: true }));
  state.fotosEmpresa = fotosFirmadas.map(f => ({ ...f, __urlCargada: true }));
  state.selectedCartaId = cartaId;
  state.cartaDetailMode = true;
  state.vistaQr = true;
  document.body.classList.add("vista-qr");
  setView("cartas");
  render();
  ocultarPantallaCargaQr();
}
```

### Un bug real que esto causó (y cómo se arregló)

Supabase avisa de cambios de sesión también a los **visitantes anónimos**.
Si a ese aviso se le hacía caso durante la vista del QR, disparaba una
recarga completa que fallaba (porque un anónimo no tiene permiso de leer
nada directo) y **borraba la carta que el QR ya había mostrado**. Se
arregló ignorando ese aviso específicamente cuando se está viendo un QR:

```js
sb.auth.onAuthStateChange((_event, session) => {
  if (state.vistaQr || /[?&]carta=/.test(location.search)) {
    return;
  }
  applyAuthSession(session, !bootstrapping).catch(err => {
    console.warn("No se pudo sincronizar sesion:", err.message);
  });
});
```

---

## 7. El ambiente de pruebas (MOLUB-PRUEBAS)

Un segundo proyecto de Supabase, totalmente aparte del real, con la misma
estructura (sección 4) y la misma seguridad (sección 5), pero con datos de
juguete. Una copia de la aplicación (`index-pruebas.html` +
`config-pruebas.js`) apunta ahí en vez de a producción, con un aviso
amarillo fijo para no confundirlo.

**Para qué sirve:** antes de correr un cambio de base de datos en
producción, se corre aquí primero. Si algo sale mal, no le pasa nada a
COVIA ni a nadie real — se corrige con calma y solo después se pasa al
sistema real.

Se armó con dos archivos (ya en el repositorio):
`supabase-staging-00-schema-completo.sql` (toda la sección 4 y 5 de un
jalón) y `supabase-staging-01-datos-de-prueba.sql` (una empresa y un
usuario de prueba).

---

## 8. Otros mecanismos importantes (resueltos durante el proyecto)

**Por qué "Guardada" no es solo haberle dado clic a Guardar:**

```js
function cartaStatus(carta, equipo = cartaEquipo(carta)) {
  const raw = String(firstValue(carta, ["status", "estado"], "guardada")).toLowerCase();
  if (raw.includes("pend")) return "Pendiente";
  if (raw.includes("guard") || raw.includes("aprob")) {
    return cartaTienePuntosConLubricante(carta, equipo) ? "Guardada" : "Pendiente";
  }
  return raw || "Guardada";
}
```

**Por qué una foto de celular ya no pesa 5-10 MB** (se comprime sola al
subirse, sin que nadie tenga que hacer nada):

```js
const FOTO_MAX_LADO = 1600;
const FOTO_CALIDAD_JPEG = 0.8;
const FOTO_UMBRAL_BYTES = 250 * 1024;

async function comprimirImagenSiConviene(file) {
  try {
    if (!file || !/^image\/(jpeg|png)$/.test(file.type) || file.size < FOTO_UMBRAL_BYTES) return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, FOTO_MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type, FOTO_CALIDAD_JPEG));
    if (!blob || blob.size >= file.size * 0.9) return file;
    return new File([blob], file.name, { type: file.type });
  } catch (err) {
    return file; // si algo falla, se sube la original - nunca se pierde la foto
  }
}
```

**Por qué dos cargas al mismo tiempo ya no duplican el conteo de fotos:**

```js
let loadEquiposEnCurso = null;

function loadEquipos() {
  if (loadEquiposEnCurso) return loadEquiposEnCurso;
  loadEquiposEnCurso = loadEquiposInterno().finally(() => {
    loadEquiposEnCurso = null;
  });
  return loadEquiposEnCurso;
}
```

**Por qué "Descargar todas las cartas" ya no sale con fotos en blanco** —
se espera a que cada imagen termine de cargar de verdad antes de mandar a
imprimir, en vez de un tiempo fijo que no alcanzaba:

```js
function esperarImagenesCargadas(container, timeoutMs = 20000) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      const listo = () => resolve();
      img.addEventListener("load", listo, { once: true });
      img.addEventListener("error", listo, { once: true });
      setTimeout(listo, timeoutMs);
    });
  }));
}
```

---

## 9. Peso muerto conocido (sin riesgo, pendiente de limpieza)

Al revisar la estructura real se encontraron 2 tablas (`modulos`,
`empresa_modulos`) y 3 funciones (`mi_rol()`, `mi_empresa_id()`,
`soy_master()`) de un diseño de permisos anterior, ya reemplazado por todo
lo descrito en la sección 5. La aplicación de hoy no las usa (no aparecen
en `config.js`). No son un riesgo — ya tienen seguridad activada — solo
estorban. Limpiarlas es opcional, está en
`supabase-paso-48-limpiar-restos-opcional.sql`.

---

# Checklist antes de publicar

Esto existe porque ya nos pasó dos veces: un cambio de seguridad rompió
el QR sin que nadie lo viera venir, y una columna que no existía tumbó
todas las cartas justo antes de una presentación. Esta lista es para
que eso no vuelva a pasar, sin depender de que alguien se acuerde.

## A) Si el cambio toca la base de datos (SQL nuevo)

- [ ] **Primero se corre en MOLUB-PRUEBAS, nunca directo en producción.**
- [ ] Si el SQL menciona una columna de otra tabla que no se creó en
      este mismo cambio, **verificar que esa columna de verdad existe**:
      ```sql
      select column_name from information_schema.columns
      where table_schema='public' and table_name='NOMBRE_TABLA';
      ```
- [ ] Si crea una tabla nueva: **incluir los `grant` explícitos**
      (obligatorio desde el 30 de octubre de 2026).
- [ ] Si cambia una política de seguridad de una tabla que el QR usa:
      **probar el QR después**, en incógnito, con una carta real.
- [ ] Nunca dejar una política "TEMP" o de escape permanente.

## B) Si el cambio toca la app (app.js / styles.css / index.html)

- [ ] Probarlo localmente primero, nunca publicar a ciegas.
- [ ] Revisar la consola del navegador — cero errores en rojo.
- [ ] Si toca fotos o PDFs: confirmar que las imágenes *aparecen* antes
      de imprimir/descargar.
- [ ] Si toca login o roles: probar con al menos dos roles distintos.
- [ ] Subir la versión del archivo en `index.html` (`?v=pasoNN-...`).

## C) Después de publicar

- [ ] Abrir la app real y confirmar que carga sin errores.
- [ ] Si el cambio fue de seguridad: escanear o pegar un QR real en
      incógnito.
- [ ] Avisar qué cambió, en una frase simple.

## D) Revisión periódica

- [ ] Checar que no haya políticas con acceso a `anon` indebido:
      ```sql
      select tablename, policyname, roles from pg_policies
      where schemaname='public' and 'anon' = any(roles);
      ```
- [ ] Revisar el uso de Supabase (Settings → Usage) una vez al mes.

---

## Pendientes conocidos (no urgentes)

- Limpiar de producción las tablas/funciones viejas sin uso (sección 9).
