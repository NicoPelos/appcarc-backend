import Parser from 'rss-parser';
import Novedad from '../models/Novedad.js';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['enclosure', 'enclosure'],
    ],
  },
});

const extractImageUrl = (item) => {
  if (item.mediaContent?.$.url) return item.mediaContent.$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  // Algunos feeds RSS de Instagram incluyen la imagen en el contenido HTML
  const match = item.content?.match(/<img[^>]+src="([^"]+)"/i);
  return match?.[1] ?? null;
};

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, '').trim();

export const syncInstagramFeed = async ({ rssUrl, clubId }) => {
  if (!rssUrl) throw new Error('INSTAGRAM_RSS_URL no está configurado');
  if (!clubId) throw new Error('clubId es requerido para la sincronización');

  const feed = await parser.parseURL(rssUrl);

  let inserted = 0;
  let skipped = 0;

  for (const item of feed.items) {
    const fuenteId = item.guid || item.link;
    if (!fuenteId) { skipped++; continue; }

    const novedad = {
      clubId,
      fuente: 'instagram',
      fuenteId,
      titulo: stripHtml(item.title || '').slice(0, 200) || 'Post de Instagram',
      cuerpo: stripHtml(item.contentSnippet || item.content || ''),
      imagenUrl: extractImageUrl(item),
      linkOriginal: item.link || null,
      fechaPublicacion: item.isoDate ? new Date(item.isoDate) : new Date(),
      createdBy: 'sync:instagram',
    };

    const result = await Novedad.updateOne(
      { clubId, fuenteId },
      { $setOnInsert: novedad },
      { upsert: true },
    );

    if (result.upsertedCount > 0) inserted++;
    else skipped++;
  }

  return { inserted, skipped, total: feed.items.length };
};
