import sharp from 'sharp';
import CategoriaInventario from '../models/CategoriaInventario.js';

// Si un modelo está saturado (503/429), se prueba el siguiente.
const MODELOS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3-flash-preview'].filter(Boolean);
const TIMEOUT_MS = 20000;
const url = (modelo) => `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

const limpiarTexto = (valor, max) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

export const sugerirItemInventarioHandler = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ message: 'La sugerencia por foto no está configurada en el servidor' });
  if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

  try {
    const categorias = (await CategoriaInventario.find({ clubId: req.user?.clubId, active: true }).select('nombre').lean())
      .map((c) => c.nombre);

    // Una foto de cámara pesa varios MB: alcanza con una versión chica para
    // identificar el objeto, y así la llamada no se pasa del tiempo máximo.
    const imagen = await sharp(req.file.buffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const prompt = [
      'Sos el asistente de inventario de un club de montaña y escalada.',
      'Mirá la foto del objeto y respondé solo con JSON con estas claves:',
      '- "nombre": nombre corto del objeto, en español.',
      `- "categoria": exactamente una de estas opciones, o "" si ninguna encaja: ${JSON.stringify(categorias)}.`,
      '- "descripcion": una o dos frases en español sobre el objeto y su estado visible.',
    ].join('\n');

    const cuerpo = JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: imagen.toString('base64') } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    let respuesta;
    for (const modelo of MODELOS) {
      respuesta = await fetch(url(modelo), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: cuerpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (respuesta.status !== 503 && respuesta.status !== 429) break;
      console.error(`Gemini ${modelo} respondió ${respuesta.status}, pruebo el siguiente modelo`);
    }

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
