const MP_API_BASE = 'https://api.mercadopago.com';

/**
 * Busca pagos recibidos en la cuenta de Mercado Pago del club cerca de una
 * fecha dada, para vincular manualmente contra un Movimiento de tipo
 * Transferencia. Solo sirve para Ingresos — la API de pagos de MP expone
 * plata que ENTRÓ a la cuenta, no egresos/retiros del club.
 */
export const buscarPagosMercadoPago = async ({ accessToken, fecha, rangoDias = 5 }) => {
  const desde = new Date(fecha);
  desde.setDate(desde.getDate() - rangoDias);
  const hasta = new Date(fecha);
  hasta.setDate(hasta.getDate() + rangoDias);

  const params = new URLSearchParams({
    sort: 'date_approved',
    criteria: 'desc',
    range: 'date_approved',
    begin_date: desde.toISOString(),
    end_date: hasta.toISOString(),
    limit: '50',
  });

  const response = await fetch(`${MP_API_BASE}/v1/payments/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Mercado Pago devolvió ${response.status} buscando pagos`);
  }
  const data = await response.json();

  return (data.results ?? [])
    .filter((p) => p.status === 'approved')
    .map((p) => ({
      paymentId: String(p.id),
      monto: p.transaction_amount,
      fecha: p.date_approved,
      payerEmail: p.payer?.email ?? '',
      descripcion: p.description ?? '',
    }));
};
