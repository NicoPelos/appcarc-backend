export const PERMISOS = {
  // Socios
  SOCIOS_READ:    'socios:read',
  SOCIOS_CREATE:  'socios:create',
  SOCIOS_WRITE:   'socios:write',
  SOCIOS_DELETE:  'socios:delete',
  SOCIOS_RESTORE: 'socios:restore',

  // Cobros
  COBROS_READ:   'cobros:read',
  COBROS_WRITE:  'cobros:write',
  COBROS_DELETE: 'cobros:delete',

  // Movimientos
  MOVIMIENTOS_READ:   'movimientos:read',
  MOVIMIENTOS_WRITE:  'movimientos:write',
  MOVIMIENTOS_DELETE: 'movimientos:delete',

  // Escuelita
  ESCUELITA_READ:    'escuelita:read',
  ESCUELITA_WRITE:   'escuelita:write',
  ESCUELITA_DELETE:  'escuelita:delete',
  ESCUELITA_CHECKIN: 'escuelita:checkin',
  ESCUELITA_PURGAR:  'escuelita:purgar',

  // Muro Libre
  MURO_LIBRE_READ:    'muroLibre:read',
  MURO_LIBRE_WRITE:   'muroLibre:write',
  MURO_LIBRE_DELETE:  'muroLibre:delete',
  MURO_LIBRE_CHECKIN: 'muroLibre:checkin',

  // Horarios
  HORARIOS_READ:   'horarios:read',
  HORARIOS_WRITE:  'horarios:write',
  HORARIOS_DELETE: 'horarios:delete',
  HORARIOS_DEUDA:  'horarios:deuda',

  // Etiquetas
  ETIQUETAS_READ:   'etiquetas:read',
  ETIQUETAS_WRITE:  'etiquetas:write',
  ETIQUETAS_DELETE: 'etiquetas:delete',

  // Precios
  PRECIOS_READ:   'precios:read',
  PRECIOS_WRITE:  'precios:write',
  PRECIOS_DELETE: 'precios:delete',

  // Planes
  PLANES_READ:   'planes:read',
  PLANES_WRITE:  'planes:write',
  PLANES_DELETE: 'planes:delete',

  // Suscripciones
  SUSCRIPCIONES_READ:   'suscripciones:read',
  SUSCRIPCIONES_WRITE:  'suscripciones:write',
  SUSCRIPCIONES_CLOSE:  'suscripciones:close',
  SUSCRIPCIONES_DELETE: 'suscripciones:delete',

  // Asistencias
  ASISTENCIAS_READ:  'asistencias:read',
  ASISTENCIAS_WRITE: 'asistencias:write',

  // Novedades
  NOVEDADES_WRITE: 'novedades:write',

  // Export
  EXPORT_SHEETS: 'export:sheets',

  // Audit
  AUDIT_READ:   'audit:read',
  AUDIT_REVERT: 'audit:revert',

  // Usuarios (gestión dentro del club)
  USUARIOS_WRITE: 'usuarios:write',

  // Roles (gestión dentro del club)
  ROLES_READ:   'roles:read',
  ROLES_WRITE:  'roles:write',
  ROLES_DELETE: 'roles:delete',
};

export const TODOS_LOS_PERMISOS = Object.values(PERMISOS);
