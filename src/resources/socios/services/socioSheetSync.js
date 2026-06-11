import { formatISO } from 'date-fns';

export const socioSheetHeaders = [
  'socioNumber',
  'sexo',
  'apellido',
  'nombre',
  'dni',
  'fechaNacimiento',
  'direccionActual',
  'domicilioCompleto',
  'calle',
  'altura',
  'ciudad',
  'nacionalidad',
  'fechaDeAsociado',
  'estado',
  'condicionObs',
  'correoElectronico',
  'telefono',
  'telefonoEmergencia',
  'observaciones',
];

export const buildSocioSheetRow = (socio) => {
  const formatDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatISO(date, { representation: 'date' });
  };

  return [
    socio.socioNumber || '',
    socio.sexo || '',
    socio.apellido || '',
    socio.nombre || '',
    socio.dni || '',
    formatDate(socio.fechaNacimiento),
    socio.direccionActual || '',
    socio.domicilioCompleto || '',
    socio.calle || '',
    socio.altura || '',
    socio.ciudad || '',
    socio.nacionalidad || '',
    formatDate(socio.fechaDeAsociado),
    socio.estado || '',
    socio.condicionObs || '',
    socio.correoElectronico || '',
    socio.telefono || '',
    socio.telefonoEmergencia || '',
    socio.observaciones || '',
  ];
};

const normalizeHeader = (text) => text?.toString().trim().toLowerCase().replace(/\s+/g, ' ');

const headerMap = {
  'nro socio': 'socioNumber',
  'socio number': 'socioNumber',
  'socio number': 'socioNumber',
  'sexo': 'sexo',
  'apellido': 'apellido',
  'nombre': 'nombre',
  'dni': 'dni',
  'fecha nacimiento': 'fechaNacimiento',
  'fecha de nacimiento': 'fechaNacimiento',
  'direccion actual': 'direccionActual',
  'domicilio completo': 'domicilioCompleto',
  'calle': 'calle',
  'altura': 'altura',
  'ciudad': 'ciudad',
  'nacionalidad': 'nacionalidad',
  'fecha de asociado': 'fechaDeAsociado',
  'estado': 'estado',
  'condicion obs': 'condicionObs',
  'correo electronico': 'correoElectronico',
  'email': 'correoElectronico',
  'telefono': 'telefono',
  'telefono emergencia': 'telefonoEmergencia',
  'observaciones': 'observaciones',
  'clubid': 'clubId',
  'club id': 'clubId',
  'club': 'clubId',
};

export const columnsToSocioData = (headerRow, valuesRow) => {
  const record = {};
  const headers = headerRow.map(normalizeHeader);

  headers.forEach((rawHeader, index) => {
    const field = headerMap[rawHeader];
    if (!field) return;
    const value = valuesRow[index] ?? '';
    if (field === 'fechaNacimiento' || field === 'fechaDeAsociado') {
      record[field] = value ? new Date(value) : undefined;
    } else {
      record[field] = value?.toString().trim();
    }
  });

  return record;
};

export const buildHeaderRow = () => {
  return [
    'socioNumber',
    'sexo',
    'apellido',
    'nombre',
    'dni',
    'fechaNacimiento',
    'direccionActual',
    'domicilioCompleto',
    'calle',
    'altura',
    'ciudad',
    'nacionalidad',
    'fechaDeAsociado',
    'estado',
    'condicionObs',
    'correoElectronico',
    'telefono',
    'telefonoEmergencia',
    'observaciones',
  ];
};
