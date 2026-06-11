import Socio from '../models/Socio.js';
import { updateSheetRow, appendToSheet } from '../../../services/googleSheetsService.js';
import { buildSocioSheetRow } from '../services/socioSheetSync.js';

export const updateSocioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (!updateData.domicilioCompleto) {
      if (updateData.calle) {
        updateData.domicilioCompleto = `${updateData.calle}${updateData.altura ? ' ' + updateData.altura : ''}`;
      } else if (updateData.direccionActual) {
        updateData.domicilioCompleto = updateData.direccionActual;
      }
    }

    const socio = await Socio.findOneAndUpdate(
      { _id: id, clubId: req.user?.clubId },
      updateData,
      { new: true, runValidators: true }
    );
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });

    const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
    const sheetName = process.env.GOOGLE_SHEETS_SOCIOS_SHEET_NAME || 'Socios';
    if (spreadsheetId) {
      const sheetRow = buildSocioSheetRow(socio);
      if (socio.sheetRowNumber) {
        await updateSheetRow(spreadsheetId, sheetName, socio.sheetRowNumber, sheetRow);
        socio.sheetUpdatedAt = new Date();
        await socio.save();
      } else {
        const { rowNumber } = await appendToSheet(spreadsheetId, `${sheetName}!A:Z`, sheetRow);
        if (rowNumber) {
          socio.sheetRowNumber = rowNumber;
          socio.sheetName = sheetName;
          socio.spreadsheetId = spreadsheetId;
          socio.sheetUpdatedAt = new Date();
          await socio.save();
        }
      }
    }

    res.status(200).json(socio);
  } catch (error) {
    console.error('Error actualizando socio (handler):', error);
    res.status(400).json({ message: error.message });
  }
};

export default updateSocioHandler;
