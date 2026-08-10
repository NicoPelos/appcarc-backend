import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    sheets: vi.fn().mockReturnValue({}),
  },
}));
vi.mock('../../../resources/socios/models/Socio.js', () => ({ default: { find: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('../../../resources/cuotas/models/Cuota.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/suscripciones/models/Suscripcion.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/cobros/models/Cobro.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/escuelita/models/Escuelita.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/movimientos/models/Movimiento.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/horarios/models/Horarios.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/etiquetas/models/Etiqueta.js', () => ({ default: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock('../../../resources/asistencias/models/Asistencia.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/advertencias/models/Advertencia.js', () => ({ default: { countDocuments: vi.fn() } }));
vi.mock('../../../resources/cuotas/services/calcularDeuda.service.js', () => ({ calcularDeuda: vi.fn() }));

import { buildCuotasSocialesRows, buildCuotasEscuelitaRows, buildMovimientosRows } from '../../sheetsExport.service.js';
import Socio from '../../../resources/socios/models/Socio.js';
import Cuota from '../../../resources/cuotas/models/Cuota.js';
import Suscripcion from '../../../resources/suscripciones/models/Suscripcion.js';
import Escuelita from '../../../resources/escuelita/models/Escuelita.js';
import Etiqueta from '../../../resources/etiquetas/models/Etiqueta.js';
import Movimiento from '../../../resources/movimientos/models/Movimiento.js';
import { calcularDeuda } from '../../../resources/cuotas/services/calcularDeuda.service.js';

const chain = (result) => {
  const obj = {};
  obj.sort = () => obj;
  obj.populate = () => obj;
  obj.lean = () => Promise.resolve(result);
  return obj;
};

// Los mismos 24 períodos "YYYY-MM" que genera generatePeriodos(24) en el service.
const last24Periodos = () => {
  const periods = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
};

const deudaCon = (usoSistema, mesesDeuda, periodos = []) => ({
  suscripciones: [{ etiqueta: { uso_sistema: usoSistema }, mesesDeuda, periodos }],
  otrosCargos: [],
});
const deudaVacia = () => ({ suscripciones: [], otrosCargos: [] });

beforeEach(() => vi.clearAllMocks());

describe('buildCuotasSocialesRows', () => {
  it('incluye la columna Estado (todos los estados juntos, para filtrar desde Sheets)', async () => {
    const periodos = last24Periodos();
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqSocial' }]));
    Socio.find.mockReturnValue(chain([
      { _id: 'socio1', socioNumber: '1', apellido: 'Pagador', nombre: 'A', dni: '1', estado: 'Activo' },
      { _id: 'socio2', socioNumber: '2', apellido: 'Baja', nombre: 'B', dni: '2', estado: 'Baja' },
    ]));
    Cuota.find.mockReturnValue(chain([
      { socioId: 'socio1', periodo: periodos.at(-1), estado: 'pagada' },
    ]));
    Suscripcion.find.mockReturnValue(chain([]));
    calcularDeuda.mockResolvedValue(deudaVacia());

    const { headers, rows } = await buildCuotasSocialesRows('CARC');

    expect(headers).toContain('Estado');
    expect(headers).not.toContain('Deuda estimada');
    expect(headers.at(-1)).toBe('Meses adeudados');
    expect(rows).toHaveLength(2); // Activo y Baja en la misma pestaña
    expect(rows[0]).toContain('Activo');
    expect(rows[1]).toContain('Baja');
  });

  it('"Meses adeudados" sale de calcularDeuda, no de contar pendiente', async () => {
    const periodos = last24Periodos();
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqSocial' }]));
    Socio.find.mockReturnValue(chain([
      { _id: 'socio1', socioNumber: '1', apellido: 'Deudor', nombre: 'A', dni: '1', estado: 'Activo' },
    ]));
    Cuota.find.mockReturnValue(chain([])); // sin Cuota 'pendiente' precargada
    Suscripcion.find.mockReturnValue(chain([]));
    calcularDeuda.mockResolvedValue(deudaCon('cuota_social', 2, [periodos.at(-1), periodos.at(-2)]));

    const { rows } = await buildCuotasSocialesRows('CARC');
    const INFO_COLS = 5; // N°Socio, Apellido, Nombre, DNI, Estado
    const cells = rows[0].slice(INFO_COLS, INFO_COLS + periodos.length);

    expect(rows[0].at(-1)).toBe(2);
    expect(cells.at(-1)).toBe('✗');
    expect(cells.at(-2)).toBe('✗');
  });

  it('marca con tilde verde los períodos cubiertos por una suscripción exenta', async () => {
    const periodos = last24Periodos();
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqSocial' }]));
    Socio.find.mockReturnValue(chain([
      { _id: 'socioExento', socioNumber: '2', apellido: 'Exento', nombre: 'B', dni: '2', estado: 'Activo' },
    ]));
    Cuota.find.mockReturnValue(chain([])); // exento no genera Cuota
    Suscripcion.find.mockReturnValue(chain([
      { socioId: 'socioExento', fechaDesde: periodos[0], fechaHasta: null, active: true, exento: true },
    ]));
    calcularDeuda.mockResolvedValue(deudaVacia());

    const { headers, rows } = await buildCuotasSocialesRows('CARC');
    const INFO_COLS = 5;
    const cells = rows[0].slice(INFO_COLS, INFO_COLS + periodos.length);

    expect(cells.every((c) => c === '✓')).toBe(true);
    expect(rows[0].at(-1)).toBe(0);
    expect(headers).not.toContain('Deuda estimada');
  });
});

describe('buildCuotasEscuelitaRows', () => {
  it('incluye Categoría y Estado, con todos los alumnos juntos', async () => {
    const periodos = last24Periodos();
    Escuelita.find.mockReturnValue(chain([
      {
        socioId: { _id: 'alumno1', socioNumber: '3', apellido: 'Chico', nombre: 'C', dni: '3', estado: 'Adherente' },
        planId: { nombre: 'Plan Escuelita' },
      },
    ]));
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqEsc' }]));
    Cuota.find.mockReturnValue(chain([]));
    Suscripcion.find.mockReturnValue(chain([
      { socioId: 'alumno1', fechaDesde: periodos[0], fechaHasta: periodos.at(-1), active: true, exento: true },
    ]));
    calcularDeuda.mockResolvedValue(deudaVacia());

    const { headers, rows } = await buildCuotasEscuelitaRows('CARC');

    expect(headers).toContain('Categoría');
    expect(headers).toContain('Estado');
    expect(headers).not.toContain('Deuda estimada');
    expect(rows[0]).toContain('Adherente');
    const INFO_COLS = 6; // N°Socio, Apellido, Nombre, DNI, Categoría, Estado
    const cells = rows[0].slice(INFO_COLS, INFO_COLS + periodos.length);
    expect(cells.every((c) => c === '✓')).toBe(true);
  });

  it('devuelve headers sin Deuda estimada cuando no hay alumnos', async () => {
    Escuelita.find.mockReturnValue(chain([]));
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqEsc' }]));

    const { headers, rows } = await buildCuotasEscuelitaRows('CARC');

    expect(headers).not.toContain('Deuda estimada');
    expect(rows).toEqual([]);
  });
});

describe('buildMovimientosRows', () => {
  it('ordena cronológicamente y calcula el saldo acumulado', async () => {
    Movimiento.find.mockReturnValue(chain([
      { date: new Date(2026, 5, 5), type: 'Ingreso', amount: 1000, concept: 'A', paymentMethod: 'Efectivo', responsable: 'x' },
      { date: new Date(2026, 5, 10), type: 'Egreso', amount: 300, concept: 'B', paymentMethod: 'Efectivo', responsable: 'x' },
    ]));

    const { headers, rows } = await buildMovimientosRows('CARC');

    expect(headers).toEqual(['Fecha', 'Tipo', 'Concepto', 'Monto', 'Método', 'Responsable', 'Saldo', 'Ingresos del mes', 'Egresos del mes']);
    expect(rows[0][0]).toBe('05/06/2026');
    expect(rows[0][6]).toBe('$1.000'); // saldo tras el ingreso
    expect(rows[1][6]).toBe('$700'); // saldo tras el egreso (1000-300)
  });

  it('agrega una fila de cierre al pasar de un mes a otro, con el saldo y los totales del mes', async () => {
    Movimiento.find.mockReturnValue(chain([
      { date: new Date(2026, 5, 5), type: 'Ingreso', amount: 1000, concept: 'A', paymentMethod: 'Efectivo', responsable: 'x' },
      { date: new Date(2026, 6, 1), type: 'Egreso', amount: 400, concept: 'B', paymentMethod: 'Efectivo', responsable: 'x' },
    ]));

    const { rows, cierreRowIndices } = await buildMovimientosRows('CARC');

    expect(rows).toHaveLength(4); // 2 movimientos + cierre de junio + cierre de julio
    expect(cierreRowIndices).toEqual([1, 3]);
    expect(rows[1][0]).toBe('Cierre Junio 2026');
    expect(rows[1][6]).toBe('$1.000'); // saldo al cierre de junio
    expect(rows[1][7]).toBe('$1.000'); // ingresos de junio
    expect(rows[1][8]).toBe('$0'); // egresos de junio
    expect(rows[2][6]).toBe('$600'); // saldo tras el egreso de julio (1000-400)
    expect(rows[3][0]).toBe('Cierre Julio 2026');
    expect(rows[3][6]).toBe('$600'); // saldo al cierre de julio
  });

  it('agrega el cierre del último mes aunque no haya un movimiento posterior', async () => {
    Movimiento.find.mockReturnValue(chain([
      { date: new Date(2026, 5, 5), type: 'Ingreso', amount: 1000, concept: 'A', paymentMethod: 'Efectivo', responsable: 'x' },
    ]));

    const { rows, cierreRowIndices } = await buildMovimientosRows('CARC');

    expect(rows).toHaveLength(2);
    expect(cierreRowIndices).toEqual([1]);
    expect(rows[1][0]).toBe('Cierre Junio 2026');
  });
});
