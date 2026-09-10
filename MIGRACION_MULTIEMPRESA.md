# Migracion multiempresa MOLUB

Esta app nueva reemplaza el enfoque fijo de COVIA LAMPAZOS por una plataforma MOLUB donde cada empresa tiene sus datos, logo, color y modulos.

## Regla principal

Nunca mezclamos datos entre empresas. Todas las tablas operativas deben tener `empresa_id`.

Ejemplos:

- `equipos.empresa_id`
- `levantamientos.empresa_id`
- `cartas_lubricacion.empresa_id`
- `elementos_lubricacion.empresa_id`
- `actividades_extra.empresa_id`
- `tareas_asignadas.empresa_id`
- `fotos.empresa_id`

## Como se vera para el usuario

1. Entra a MOLUB Platform.
2. El sistema detecta o permite seleccionar empresa.
3. El dashboard muestra logo, color, equipos y modulos de esa empresa.
4. Si cambia a otra empresa, cambia el panel completo:
   - logo
   - nombre
   - equipos
   - modulos activos
   - cartas
   - levantamientos
   - tareas

## Etapas de migracion

### Etapa 1 - Identidad y modulos

Proposito: que COVIA, DEACERO y futuras empresas existan como clientes dentro de MOLUB.

Incluye:

- `empresas.logo_url`
- `empresas.color_principal`
- `empresas.activo`
- tabla `empresa_modulos_app`

Prueba de exito:

- COVIA muestra su logo.
- DEACERO muestra su logo.
- Puedes apagar/prender modulos por empresa.
- Al recargar, los modulos se conservan.

### Etapa 2 - Usuarios y acceso

Proposito: que cada persona entre con correo y solo vea lo que le toca.

Incluye:

- Supabase Auth
- relacion entre usuario y perfil
- perfil MASTER MOLUB
- usuarios por empresa
- politicas RLS reales

Prueba de exito:

- Admin MOLUB puede ver varias empresas.
- Usuario COVIA solo ve COVIA.
- Usuario DEACERO solo ve DEACERO.

### Etapa 3 - Equipos

Proposito: que la base de equipos sea el centro de los demas modulos.

Prueba de exito:

- COVIA carga 89 equipos.
- DEACERO carga sus equipos cuando se importen.
- El buscador y areas funcionan por empresa.

### Etapa 4 - Levantamiento

Proposito: migrar el flujo de campo: fotos, referencias, descripciones y avance.

Prueba de exito:

- Un tecnico puede levantar un equipo.
- Las fotos quedan asociadas a empresa y equipo.
- El dashboard actualiza avance.

### Etapa 5 - Cartas de lubricacion

Proposito: migrar cartas, elementos, puntos, frecuencias, impresion/PDF y cartas guardadas.

Prueba de exito:

- Una carta pertenece a una empresa y equipo.
- Sus elementos aparecen correctamente.
- Se puede guardar y consultar.

### Etapa 6 - Actividades, tareas y horas hombre

Proposito: completar operacion diaria y seguimiento.

Prueba de exito:

- Se asignan tareas.
- Se registran actividades.
- Se calculan horas por tecnico, periodo y empresa.

## Politicas temporales

Durante laboratorio usamos algunas politicas `TEMP anon` para leer y probar rapido.

Antes de produccion deben reemplazarse por politicas con `auth.uid()` para proteger datos por empresa.

## Nota sobre empresa_modulos antigua

El proyecto ya tenia una tabla `empresa_modulos` con una estructura anterior. Para no afectar nada existente, la app nueva usara `empresa_modulos_app`.

Proposito: mantener intacto lo viejo mientras construimos la nueva plataforma.
