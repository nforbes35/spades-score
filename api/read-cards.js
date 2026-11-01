// Vercel function: reads the cards in a photo of a player's hand with Claude.
// Needs ANTHROPIC_API_KEY set on the server (never sent to the browser).
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['S', 'H', 'D', 'C'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rank', 'suit'],
        properties: {
          rank: { type: 'string', enum: RANKS },
          suit: { type: 'string', enum: SUITS },
        },
      },
    },
  },
};

const PROMPT = `This photo shows one player's hand from a standard 52-card deck, dealt for a game of Spades. It is usually 13 cards, often fanned or overlapped so mainly the corners show.

Identify every card in the hand by reading each card's corner index: the rank and the suit symbol. Suits: S = spades, H = hearts, D = diamonds, C = clubs. Use "10" for tens.

List each card once. If a card is too hidden to read with confidence, leave it out rather than guessing: the scorekeeper checks the result and adds any missing cards by hand.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Photo reading isn’t switched on yet.' });
  }
  const { image, mediaType = 'image/jpeg' } = req.body ?? {};
  if (typeof image !== 'string' || image.length < 100 || image.length > 6_000_000) {
    return res.status(400).json({ error: 'Send one photo.' });
  }

  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') {
      return res.status(422).json({ error: 'Couldn’t read that photo.' });
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const { cards } = JSON.parse(text);
    const codes = [...new Set(cards.map((c) => `${c.rank}${c.suit}`))];
    return res.status(200).json({ cards: codes });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'The card reader is busy. Wait a moment and try again.' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('read-cards API error', err.status, err.message);
      return res.status(502).json({ error: 'The card reader had a problem.' });
    }
    console.error('read-cards failed', err);
    return res.status(500).json({ error: 'Couldn’t read that photo.' });
  }
}
