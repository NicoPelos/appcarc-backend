import Socio from '../models/Socio.js';
import { updateSheetRow } from '../../../services/googleSheetsService.js';
import { buildSocioSheetRow } from '../services/socioSheetSync.js';

export const deleteSocioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socio = await Socio.findOneAndUpdate(
      { _id: id, clubId: req.user?.clubId },
      { active: false },
      { new: true }
    );
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });

    const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
    const sheetName = process.env.GOOGLE_SHEETS_SOCIOS_SHEET_NAME || 'Socios';
    if (spreadsheetId && socio.sheetRowNumber) {
      const sheetRow = buildSocioSheetRow(socio);
      sheetRow.push('BAJA');
      await updateSheetRow(spreadsheetId, sheetName, socio.sheetRowNumber, sheetRow);
      socio.sheetUpdatedAt = new Date();
      await socio.save();
    }

    res.status(200).json({ message: 'Socio desactivado con éxito' });
  } catch (error) {
    console.error('Error eliminando socio (handler):', error);
    res.status(500).json({ message: 'Error al eliminar socio' });
  }
};

export default deleteSocioHandler;
