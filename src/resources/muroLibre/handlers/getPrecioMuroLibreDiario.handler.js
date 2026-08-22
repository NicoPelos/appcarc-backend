import { findPrecioVigenteByUsoSistema, USO_SISTEMA_BY_TIPO } from '../services/registrarMuroLibre.service.js';

/**
 * @openapi
 * /api/muro-libre/precio-diario:
 *   get:
 *     summary: Precio vigente sugerido para el pase diario de Muro Libre
 *     tags: [MuroLibre]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: esSocio
 *         in: query
 *         schema: { type: boolean }
 *         description: true para el precio de socio, false para no socio (visitante externo)
 *     responses:
 *       200:
 *         description: Monto sugerido (null si no hay precio configurado)
 */
export const getPrecioMuroLibreDiarioHandler = async (req, res) => {
  try {
    const esSocio = req.query.esSocio !== 'false';
    const uso_sistema = USO_SISTEMA_BY_TIPO.diario[esSocio ? 'socio' : 'noSocio'];
    const precio = await findPrecioVigenteByUsoSistema({ clubId: req.user?.clubId, uso_sistema, date: new Date() });
    res.json({ monto: precio?.monto ?? null });
  } catch (error) {
    console.error('Error buscando precio sugerido de muro libre:', error);
    res.status(500).json({ message: 'Error al buscar el precio sugerido' });
  }
};

export default getPrecioMuroLibreDiarioHandler;
