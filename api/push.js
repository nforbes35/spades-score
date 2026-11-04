// Sends a "your turn" push notification to one player's phone (Vercel serverless function).
// The game's host calls this when it's someone's turn and their app isn't on screen. The signing keys are
// private Vercel settings (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), never in the code.
import webpush from 'web-push';

// Only real browser push services, so this can't be used to send requests anywhere else.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
// At most one notification every few seconds to the same phone.
const recent = new Map();
const MIN_GAP_MS = 4000;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { res.status(503).json({ error: 'Push is not set up' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  const sub = body.subscription;
  let host;
  try { host = new URL(sub?.endpoint).hostname; } catch { /* bad endpoint */ }
  if (!host || !PUSH_HOSTS.some((re) => re.test(host)) || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: 'Bad subscription' });
    return;
  }
  const last = recent.get(sub.endpoint) ?? 0;
  if (Date.now() - last < MIN_GAP_MS) { res.status(429).json({ error: 'Too soon' }); return; }
  recent.set(sub.endpoint, Date.now());
  if (recent.size > 500) recent.clear();

  const payload = JSON.stringify({
    title: String(body.title ?? 'Family Spades').slice(0, 60),
    body: String(body.body ?? 'Your turn').slice(0, 120),
    tag: String(body.tag ?? 'turn').slice(0, 40),
    url: '/',
  });
  // A test alert can wait a few seconds first, so there's time to lock the phone
  const wait = Math.min(Math.max(Number(body.delay) || 0, 0), 8);
  if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
  try {
    webpush.setVapidDetails(VAPID_SUBJECT || 'https://spades-score-three.vercel.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    await webpush.sendNotification(sub, payload, { TTL: 60, urgency: 'high' });
    res.status(200).json({ ok: true });
  } catch (err) {
    // 404/410: that phone turned notifications off or the subscription expired
    res.status(err.statusCode === 404 || err.statusCode === 410 ? 410 : 502)
      .json({ error: 'Send failed', detail: `${err.statusCode ?? ''} ${String(err.body ?? err.message ?? '').slice(0, 120)}`.trim() });
  }
}
