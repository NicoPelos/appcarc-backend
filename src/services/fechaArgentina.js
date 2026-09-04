// Argentina no tiene horario de verano (siempre UTC-3). Este módulo centraliza
// el cálculo de período/día/semana "en términos de Argentina" a partir de
// una fecha arbitraria — no solo "ahora" — para que un check-in cargado con
// fecha pasada (ver appCARC-mobile#18) calcule su período de cuota, límite
// semanal y duplicado-del-día contra ESA fecha, no contra la fecha real del
// servidor. Antes esta cuenta vivía duplicada (y a medias) en
// checkinEscuelita.handler.js y registrarMuroLibre.service.js.

export const ARG_OFFSET_MS = -3 * 60 * 60 * 1000;

// Ventana de gracia para pagar la cuota del mes en curso antes de "reclamarla"
// (advertencias de check-in, aviso de morosidad): la deuda del mes existe
// desde el día 1 igual (se sigue mostrando en Cuotas/Deuda sin cambios), pero
// no se la trata como algo a exigir hasta pasado el día 10 — recién el 11 se
// puede considerar atrasada.
export const DIA_LIMITE_PAGO_MENSUAL = 10;

// Día del mes (1-31) de `fecha`, en huso horario argentino.
export const diaDelMesArgentino = (fecha) => new Date(fecha.getTime() + ARG_OFFSET_MS).getUTCDate();

// true si `fecha` todavía está dentro de la ventana de gracia del mes en curso.
export const dentroDeVentanaDeGracia = (fecha) => diaDelMesArgentino(fecha) <= DIA_LIMITE_PAGO_MENSUAL;

// 'YYYY-MM' de la fecha, en huso horario argentino.
export const periodoDeFecha = (fecha) => {
  const local = new Date(fecha.getTime() + ARG_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Rango UTC (00:00 a 23:59:59.999) del día calendario argentino que contiene `fecha`.
export const diaBoundsUTC = (fecha) => {
  const local = new Date(fecha.getTime() + ARG_OFFSET_MS);
  const startLocal = new Date(local); startLocal.setUTCHours(0, 0, 0, 0);
  const endLocal = new Date(local); endLocal.setUTCHours(23, 59, 59, 999);
  return {
    start: new Date(startLocal.getTime() - ARG_OFFSET_MS),
    end: new Date(endLocal.getTime() - ARG_OFFSET_MS),
  };
};

// Rango UTC de la semana argentina (lunes a domingo) que contiene `fecha`.
export const semanaBoundsUTC = (fecha) => {
  const local = new Date(fecha.getTime() + ARG_OFFSET_MS);
  const day = local.getUTCDay(); // 0=Dom, 1=Lun...
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  return {
    start: new Date(monday.getTime() - ARG_OFFSET_MS),
    end: new Date(sunday.getTime() - ARG_OFFSET_MS),
  };
};
