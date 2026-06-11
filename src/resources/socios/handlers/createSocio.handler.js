import Socio from '../models/Socio.js';
import { appendToSheet } from '../../../services/googleSheetsService.js';
import { buildSocioSheetRow } from '../services/socioSheetSync.js';

export const createSocioHandler = async (req, res) => {
  try {
    const data = {
      ...req.body,
      clubId: req.body.clubId || req.user?.clubId,
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    };

    if (!data.domicilioCompleto) {
      if (data.calle) {
        data.domicilioCompleto = `${data.calle}${data.altura ? ' ' + data.altura : ''}`;
      } else if (data.direccionActual) {
        data.domicilioCompleto = data.direccionActual;
      }
    }

    const socio = new Socio(data);
    await socio.save();

    const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
    const sheetName = process.env.GOOGLE_SHEETS_SOCIOS_SHEET_NAME || 'Socios';
    if (spreadsheetId) {
      const sheetRow = buildSocioSheetRow(socio);
      const { rowNumber } = await appendToSheet(spreadsheetId, `${sheetName}!A:Z`, sheetRow);
      if (rowNumber) {
        socio.sheetRowNumber = rowNumber;
        socio.sheetName = sheetName;
        socio.spreadsheetId = spreadsheetId;
        socio.sheetUpdatedAt = new Date();
        await socio.save();
      }
    }

    res.status(201).json(socio);
  } catch (error) {
    console.error('Error creando socio (handler):', error);
    res.status(400).json({ message: error.message });
  }
};

export default createSocioHandler;
