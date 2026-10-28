# MOLUB Platform — Sistema de Gestión de Lubricación

Aplicación web para que MOLUB administre el levantamiento de equipos, cartas de lubricación, actividades de técnicos y catálogo de lubricantes de sus empresas cliente (actualmente COVIA Lampazos). Multiempresa: cada cliente ve únicamente sus propios datos.

- **App en producción:** https://molubadmin.github.io/molub-lubricacion/
- **Ambiente de pruebas** (misma app, datos de prueba, no afecta a ningún cliente real): https://molubadmin.github.io/molub-lubricacion/index-pruebas.html
- **Repositorio:** https://github.com/Molubadmin/molub-lubricacion

Para una explicación completa de qué hace cada módulo, el modelo de seguridad y el histórico de decisiones del proyecto, ver [`CHECKLIST-ANTES-DE-PUBLICAR.md`](./CHECKLIST-ANTES-DE-PUBLICAR.md) — este README es la referencia técnica corta para instalar, correr y publicar el proyecto.

## 1. Estructura y tecnología

No hay framework ni paso de compilación (`build`): es HTML, CSS y JavaScript "vanilla" servidos directamente como archivos estáticos por GitHub Pages. El backend es [Supabase](https://supabase.com) (Postgres + autenticación + RLS), consultado directo desde el navegador con el SDK `@supabase/supabase-js` (cargado por CDN, no instalado localmente).

```
index.html                  Página principal (producción) — carga config.js
index-pruebas.html          Misma app, apunta al proyecto de Supabase de pruebas
config.js                   URL y llave pública de Supabase — producción
config-pruebas.js           URL y llave pública de Supabase — ambiente de pruebas
styles.css                  Todos los estilos de la app

app.js                      Núcleo: login/roles, arranque, Dashboard, enrutador de vistas
equipos.js                  Equipos, levantamiento de fotos, carta de lubricación (editor)
cartas.js                   Cartas realizadas: estatus, impresión/PDF, QR público
lubricantes.js              Catálogo de lubricantes, presentaciones, inventario, consumos
actividades-extra.js        Actividades extra (trabajo no programado)
actividades-programadas.js  Actividades programadas por el supervisor
tareas.js                   Asignaciones: cierre y revisión de tareas
horas.js                    Horas hombre, incluyendo exportación a Excel
raci.js                     Matriz RACI

assets/                     Logos e imágenes
*.sql                       Scripts de Supabase (NO se suben al repositorio, ver sección 5)
```

**Por qué está dividido en varios archivos `.js`:** antes era un solo archivo de más de 5,000 líneas; se separó por módulo para que cualquier persona pueda ubicar y corregir una sola parte sin tener que leer todo el proyecto. Todos los archivos comparten el mismo espacio global del navegador (no hay `import`/`export`) — por eso el orden de los `<script>` en los `index*.html` importa: cada módulo se carga *antes* que `app.js`, que es quien finalmente arranca la app.

## 2. Correr el proyecto en local

No requiere instalar dependencias (no hay `package.json`). Solo hace falta servir los archivos estáticos:

```bash
python -m http.server 8766
```

Y abrir `http://localhost:8766/index.html` (producción) o `http://localhost:8766/index-pruebas.html` (pruebas) en el navegador. Cualquier servidor estático sirve (`npx serve`, la extensión Live Server de VS Code, etc.) — lo único importante es abrirlo vía `http://`, no como archivo (`file://`), porque el navegador bloquea algunas cosas (como `fetch`) en ese modo.

## 3. Configuración (no hay archivo `.env`)

Este proyecto no usa variables de entorno tradicionales porque no tiene paso de build que las inyecte. En su lugar, `config.js` y `config-pruebas.js` declaran directamente:

```js
window.MOLUB_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "...",
  tables: { /* nombres de las tablas */ }
};
```

La `supabaseAnonKey` es la llave **pública** de Supabase (no la `service_role`) — está diseñada para ir expuesta en el navegador; la seguridad real la da **Row Level Security (RLS)** en la base de datos, no el secreto de esta llave. Por eso `config.js` sí está en el repositorio. Nunca se debe poner aquí la `service_role key` (esa sí es secreta y nunca debe llegar al navegador).

Para apuntar la app a otro proyecto de Supabase, se edita `supabaseUrl`/`supabaseAnonKey` en el archivo de config correspondiente.

## 4. Publicar cambios (deployment)

El sitio se sirve directo desde GitHub Pages, rama `main`, sin paso de build. Publicar una nueva versión es:

```bash
git add <archivos que cambiaron>
git commit -m "mensaje descriptivo"
git push origin main
```

GitHub Pages reconstruye automáticamente en 1–3 minutos. Para confirmar que ya se publicó:

```bash
gh api repos/Molubadmin/molub-lubricacion/pages/builds/latest --jq '.status'
```

**Importante — caché del navegador:** cada `<script>`/`<link>` en los `index*.html` lleva un parámetro `?v=algo` (ej. `app.js?v=paso115-...`). Si se modifica un archivo `.js`/`.css` y no se cambia ese parámetro en el HTML, el navegador puede seguir sirviendo la versión vieja desde caché. Siempre hay que subir el número/nombre de versión al tocar un archivo.

**Flujo recomendado antes de publicar cambios grandes:** probar primero contra `index-pruebas.html` (apunta al proyecto `MOLUB-PRUEBAS` en Supabase, con datos de prueba) antes de tocar producción — ver sección 5.

## 5. Base de datos (Supabase)

Hay dos proyectos de Supabase:

| | Proyecto | Para qué |
|---|---|---|
| Producción | `molub-platform` | Datos reales de COVIA y futuros clientes |
| Pruebas | `MOLUB-PRUEBAS` | Datos de prueba, aislado — no afecta a ningún cliente |

**Los scripts `.sql` del proyecto no se suben a GitHub a propósito** (están en `.gitignore`): la mayoría de ellos son migraciones puntuales que en su momento incluyeron datos reales (nombres de personas, equipos). El esquema completo y limpio (todas las tablas, relaciones y políticas de RLS, sin datos reales) sí existe y se puede compartir aparte: `supabase-staging-00-schema-completo.sql` — es el script que se usó para crear `MOLUB-PRUEBAS` desde cero, y sirve como respaldo/documentación completa de la estructura de la base de datos.

El modelo de seguridad (quién puede ver y editar qué) está explicado a detalle, con el código real, en [`CHECKLIST-ANTES-DE-PUBLICAR.md`](./CHECKLIST-ANTES-DE-PUBLICAR.md).

## 6. Librerías externas (por CDN, no instaladas)

| Librería | Para qué |
|---|---|
| [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) | Cliente de Supabase |
| [`qrcodejs`](https://github.com/davidshimjs/qrcodejs) | Generar el código QR de cada carta |
| [`ExcelJS`](https://github.com/exceljs/exceljs) | Exportar reportes a Excel (Horas hombre) |

## 7. Accesos administrativos

El panel de administración de usuarios, roles y permisos se maneja hoy desde el propio panel de **Supabase** (Authentication → Users, y la tabla `perfiles`), no desde una pantalla dentro de la app — no existe todavía una pantalla de "crear usuario" dentro de la aplicación misma. Quien tenga acceso de administrador al proyecto de Supabase puede dar de alta cuentas, cambiar roles y restablecer contraseñas.
