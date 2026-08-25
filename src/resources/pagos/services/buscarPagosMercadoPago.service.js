const MP_API_BASE = 'https://api.mercadopago.com';
const PAGE_SIZE = 50;
const MAX_RESULTADOS = 500;

/**
 * Busca pagos recibidos en la cuenta de Mercado Pago del club. Dos modos:
 * - `fecha` + `rangoDias`: ventana centrada en una fecha (vincular contra un
 *   Movimiento puntual).
 * - `desde` + `hasta`: rango explícito (revisión general de pagos sin
 *   vincular, paginada).
 *
 * Solo devuelve Ingresos reales — /v1/payments/search también trae pagos
 * salientes (ej. honorarios pagados por transferencia interna de MP a otra
 * cuenta MP, no por CVU/banco) cuando el destinatario también tiene MP.
 * Ahí el club figura como `payer_id`, no `collector_id` — sin filtrar por
 * esto, una transferencia SALIENTE aparecía en la lista de "sin vincular"
 * como si fuera plata que entró (bug encontrado 2026-08-25).
 */
export const buscarPagosMercadoPago = async ({ accessToken, fecha, rangoDias = 5, desde, hasta }) => {
  let desdeDate;
  let hastaDate;
  if (desde || hasta) {
    desdeDate = desde ? new Date(desde) : new Date(0);
    hastaDate = hasta ? new Date(hasta) : new Date();
  } else {
    desdeDate = new Date(fecha);
    desdeDate.setDate(desdeDate.getDate() - rangoDias);
    hastaDate = new Date(fecha);
    hastaDate.setDate(hastaDate.getDate() + rangoDias);
  }

  const userRes = await fetch(`${MP_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    throw new Error(`Mercado Pago devolvió ${userRes.status} identificando la cuenta`);
  }
  const clubUserId = (await userRes.json()).id;

  const resultados = [];
  let offset = 0;
  while (offset < MAX_RESULTADOS) {
    const params = new URLSearchParams({
      sort: 'date_approved',
      criteria: 'desc',
      range: 'date_approved',
      begin_date: desdeDate.toISOString(),
      end_date: hastaDate.toISOString(),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    const response = await fetch(`${MP_API_BASE}/v1/payments/search?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago devolvió ${response.status} buscando pagos`);
    }
    const data = await response.json();
    const batch = data.results ?? [];
    resultados.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return resultados
    .filter((p) => (
      p.status === 'approved'
      && ['money_transfer', 'account_fund'].includes(p.operation_type)
      && p.collector_id === clubUserId
    ))
    .map((p) => ({
      paymentId: String(p.id),
      monto: p.transaction_amount,
      fecha: p.date_approved,
      payerEmail: p.payer?.email ?? '',
      descripcion: p.description ?? '',
    }));
};
