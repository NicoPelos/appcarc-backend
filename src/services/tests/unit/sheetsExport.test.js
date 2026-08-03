import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    sheets: vi.fn().mockReturnValue({}),
  },
}));
vi.mock('../../../resources/socios/models/Socio.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/cuotas/models/Cuota.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/suscripciones/models/Suscripcion.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/cobros/models/Cobro.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/escuelita/models/Escuelita.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/movimientos/models/Movimiento.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/horarios/models/Horarios.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/etiquetas/models/Etiqueta.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../resources/asistencias/models/Asistencia.js', () => ({ default: { find: vi.fn() } }));

import { buildCuotasSocialesRows, buildCuotasEscuelitaRows } from '../../sheetsExport.service.js';
import Socio from '../../../resources/socios/models/Socio.js';
import Cuota from '../../../resources/cuotas/models/Cuota.js';
import Suscripcion from '../../../resources/suscripciones/models/Suscripcion.js';
import Escuelita from '../../../resources/escuelita/models/Escuelita.js';
import Etiqueta from '../../../resources/etiquetas/models/Etiqueta.js';

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

beforeEach(() => vi.clearAllMocks());

describe('buildCuotasSocialesRows', () => {
  it('no incluye columna de montos, solo tildes y meses adeudados', async () => {
    const periodos = last24Periodos();
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqSocial' }]));
    Socio.find.mockReturnValue(chain([
      { _id: 'socio1', socioNumber: '1', apellido: 'Pagador', nombre: 'A', dni: '1' },
    ]));
    Cuota.find.mockReturnValue(chain([
      { socioId: 'socio1', periodo: periodos.at(-1), estado: 'pagada' },
      { socioId: 'socio1', periodo: periodos.at(-2), estado: 'pendiente' },
    ]));
    Suscripcion.find.mockReturnValue(chain([]));

    const { headers, rows } = await buildCuotasSocialesRows('CARC');

    expect(headers).not.toContain('Deuda estimada');
    expect(headers.at(-1)).toBe('Meses adeudados');
    const row = rows[0];
    expect(row.at(-1)).toBe(1); // 1 mes adeudado
    expect(row).not.toContain(expect.stringMatching(/^\$/));
  });

  it('marca con tilde verde los períodos cubiertos por una suscripción exenta', async () => {
    const periodos = last24Periodos();
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqSocial' }]));
    Socio.find.mockReturnValue(chain([
      { _id: 'socioExento', socioNumber: '2', apellido: 'Exento', nombre: 'B', dni: '2' },
    ]));
    Cuota.find.mockReturnValue(chain([])); // exento no genera Cuota
    Suscripcion.find.mockReturnValue(chain([
      { socioId: 'socioExento', fechaDesde: periodos[0], fechaHasta: null, active: true, exento: true },
    ]));

    const { headers, rows } = await buildCuotasSocialesRows('CARC');
    const INFO_COLS = 4;
    const cells = rows[0].slice(INFO_COLS, INFO_COLS + periodos.length);

    expect(cells.every((c) => c === '✓')).toBe(true);
    expect(rows[0].at(-1)).toBe(0); // ningún mes adeudado
    expect(headers).not.toContain('Deuda estimada');
  });
});

describe('buildCuotasEscuelitaRows', () => {
  it('no incluye columna de montos y marca exentos con tilde', async () => {
    const periodos = last24Periodos();
    Escuelita.find.mockReturnValue(chain([
      {
        socioId: { _id: 'alumno1', socioNumber: '3', apellido: 'Chico', nombre: 'C', dni: '3' },
        planId: { nombre: 'Plan Escuelita' },
      },
    ]));
    Etiqueta.find.mockReturnValue(chain([{ _id: 'etqEsc' }]));
    Cuota.find.mockReturnValue(chain([]));
    Suscripcion.find.mockReturnValue(chain([
      { socioId: 'alumno1', fechaDesde: periodos[0], fechaHasta: periodos.at(-1), active: true, exento: true },
    ]));

    const { headers, rows } = await buildCuotasEscuelitaRows('CARC');

    expect(headers).not.toContain('Deuda estimada');
    const INFO_COLS = 5;
    const cells = rows[0].slice(INFO_COLS, INFO_COLS + periodos.length);
    expect(cells.every((c) => c === '✓')).toBe(true);
  });

  it('devuelve headers sin Deuda estimada cuando no hay alumnos', async () => {
    Escuelita.find.mockReturnValue(chain([]));

    const { headers, rows } = await buildCuotasEscuelitaRows('CARC');

    expect(headers).not.toContain('Deuda estimada');
    expect(rows).toEqual([]);
  });
});
