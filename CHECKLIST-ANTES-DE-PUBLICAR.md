# Checklist antes de publicar — MOLUB Platform

Esto existe porque ya nos pasó dos veces: un cambio de seguridad rompió
el QR sin que nadie lo viera venir, y una columna que no existía tumbó
todas las cartas justo antes de una presentación. Esta lista es para
que eso no vuelva a pasar, sin depender de que alguien se acuerde.

Aplica para cualquiera que siga trabajando en este proyecto, no solo
para esta sesión.

---

## A) Si el cambio toca la base de datos (SQL nuevo)

- [ ] **Primero se corre en MOLUB-PRUEBAS, nunca directo en producción.**
      Si algo falla ahí, no le pasa nada a COVIA.
- [ ] Si el SQL menciona una columna de otra tabla que no se creó en
      este mismo cambio (ej. `empresas.direccion`), **verificar que
      esa columna de verdad existe** antes de asumirlo:
      ```sql
      select column_name from information_schema.columns
      where table_schema='public' and table_name='NOMBRE_TABLA';
      ```
- [ ] Si crea una tabla nueva: **incluir los `grant` explícitos**
      (select/insert/update/delete a `authenticated`, y a `anon` solo
      si de verdad debe ser pública) — obligatorio desde el 30 de
      octubre de 2026, Supabase ya no los da solos.
- [ ] Si cambia una política de seguridad (RLS) de cualquier tabla
      que el QR usa (`cartas_lubricacion`, `equipos`,
      `elementos_lubricacion`, `fotos`, `empresas`): **probar el QR
      después**, en incógnito, con una carta real.
- [ ] Nunca dejar una política "TEMP" o de escape permanente. Si se
      agrega una por emergencia, anotarla aquí abajo en pendientes y
      quitarla en cuanto se resuelva lo de fondo.

## B) Si el cambio toca la app (app.js / styles.css / index.html)

- [ ] Probarlo localmente primero (servidor local + navegador),
      nunca publicar a ciegas.
- [ ] Revisar la consola del navegador — cero errores en rojo.
- [ ] Si toca fotos o PDFs: confirmar que las imágenes *aparecen*
      antes de imprimir/descargar, no solo que el código no truena.
- [ ] Si toca login o roles: probar con al menos dos roles distintos
      (ej. admin y técnico), no solo con el propio.
- [ ] Subir la versión del archivo en `index.html`
      (`?v=pasoNN-descripcion`) — si no, el navegador sirve la
      versión vieja aunque ya se haya publicado.

## C) Después de publicar (cualquier tipo de cambio)

- [ ] Abrir la app real en una ventana nueva y confirmar que carga
      sin errores.
- [ ] Si el cambio fue de seguridad o de acceso: escanear o pegar un
      QR real en incógnito — debe abrir la carta directo, sin pedir
      login.
- [ ] Avisarle a quien corresponda qué cambió, en una frase simple.

## D) Revisión periódica (no es por cada cambio, es de vez en cuando)

- [ ] Checar que no haya políticas con acceso a `anon` que no
      deberían estarlo:
      ```sql
      select tablename, policyname, roles from pg_policies
      where schemaname='public' and 'anon' = any(roles);
      ```
      Solo debe aparecer la función del QR (`obtener_carta_publica`),
      nunca una tabla completa.
- [ ] Revisar el uso de Supabase (Settings → Usage) una vez al mes,
      antes de que se acerque a su límite.

---

## Pendientes conocidos (no urgentes)

- Limpiar de producción las tablas/funciones viejas sin uso:
  `modulos`, `empresa_modulos`, `mi_rol()`, `mi_empresa_id()`,
  `soy_master()` — ver `supabase-paso-48-limpiar-restos-opcional.sql`.
