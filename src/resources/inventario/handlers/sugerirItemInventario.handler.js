import CategoriaInventario from '../models/CategoriaInventario.js';

const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
const TIMEOUT_MS = 25000;

const limpiarTexto = (valor, max) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

export const sugerirItemInventarioHandler = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ message: 'La sugerencia por foto no está configurada en el servidor' });
  if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

  try {
    const categorias = (await CategoriaInventario.find({ clubId: req.user?.clubId, active: true }).select('nombre').lean())
      .map((c) => c.nombre);

    const prompt = [
      'Sos el asistente de inventario de un club de montaña y escalada.',
      'Mirá la foto del objeto y respondé solo con JSON con estas claves:',
      '- "nombre": nombre corto del objeto, en español.',
      `- "categoria": exactamente una de estas opciones, o "" si ninguna encaja: ${JSON.stringify(categorias)}.`,
      '- "descripcion": una o dos frases en español sobre el objeto y su estado visible.',
    ].join('\n');

    const respuesta = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      console.error('Gemini respondió', respuesta.status);
      return res.status(502).json({ message: 'No se pudo obtener la sugerencia en este momento' });
    }

    const data = await respuesta.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let propuesta;
    try {
      propuesta = JSON.parse(texto);
    } catch {
      return res.status(502).json({ message: 'La sugerencia llegó en un formato que no se pudo leer' });
    }

    const categoria = typeof propuesta.categoria === 'string' && categorias.includes(propuesta.categoria) ? propuesta.categoria : '';
    res.status(200).json({
      nombre: limpiarTexto(propuesta.nombre, 80),
      categoria,
      descripcion: limpiarTexto(propuesta.descripcion, 300),
    });
  } catch (error) {
    console.error('Error sugiriendo ítem de inventario:', error);
    res.status(502).json({ message: 'No se pudo obtener la sugerencia en este momento' });
  }
};

export default sugerirItemInventarioHandler;
