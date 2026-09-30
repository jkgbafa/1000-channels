#!/usr/bin/env node
// Resolves data/videos.txt -> channels.js (window.CHANNELS) for index.html.
//
// Keyless by default: oEmbed identifies each channel, the channel page gives the avatar and
// subscriber count, and each watch page gives that video's view count. YouTube publishes a
// channel's *lifetime* view total only through the API, so without a key we sum the views of
// the videos you listed — which is what "views across all the videos" means here anyway.
//
// YT_API_KEY=… upgrades views, video counts and subscribers to the channel's true lifetime
// totals and costs ~2 quota units per 50 channels.
//
// Everything fetched is cached. Pass --refresh to re-fetch it: counts move, channel ids do not.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const KEY = process.env.YT_API_KEY;
const FRESH = process.argv.includes('--refresh');
const CACHE = new URL('./.cache.json', import.meta.url);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// --- parse ------------------------------------------------------------------
// "Name (12:10, 17:10): https://youtu.be/ID, Short https://youtube.com/shorts/ID2"
// -> { order: names first-seen, videos: name -> Set(videoId) }.  Non-link lines are noise.
export function parseVideos(text) {
  const ID = /(?:youtu\.be\/|shorts\/|[?&]v=)([\w-]{11})/g;
  const order = [], videos = new Map();
  for (const line of text.split('\n')) {
    const ids = [...line.matchAll(ID)].map(m => m[1]);
    if (!ids.length) continue;
    const name = line.split(/:\s*(?:https?:|Short\b)/)[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!name || name.length > 80) continue;
    if (!videos.has(name)) { videos.set(name, new Set()); order.push(name); }
    ids.forEach(id => videos.get(name).add(id));
  }
  return { order, videos };
}

// YouTube renders rounded counts: "18 subscribers", "1.2K subscribers", "3.4M subscribers".
const SCALE = { K: 1e3, M: 1e6, B: 1e9 };
export const count = text => {
  const m = /([\d.,]+)\s*([KMB])?/i.exec(text ?? '');
  return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * (SCALE[m[2]?.toUpperCase()] || 1)) : 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) { // skipped when imported by check.mjs

const cache = await readFile(CACHE, 'utf8').then(JSON.parse).catch(() => ({}));
cache.channels ??= {};  // name -> { id, title, url, icon, subs }
cache.views ??= {};     // videoId -> view count
const { order, videos } = parseVideos(await readFile(new URL('./data/videos.txt', import.meta.url), 'utf8'));

const pool = async (items, n, fn) => {
  const it = items[Symbol.iterator]();
  await Promise.all(Array.from({ length: n }, async () => { for (const x of it) await fn(x); }));
};
const page = url => fetch(url, { headers: { 'user-agent': UA } }).then(r => r.ok ? r.text() : '').catch(() => '');
const grab = (html, re) => html.match(re)?.[1];

// --- resolve channels -------------------------------------------------------
// One representative video per channel is enough to find the channel.
const todo = order.filter(n => FRESH || !cache.channels[n]?.id);
if (todo.length) console.error(`resolving ${todo.length} channel(s)…`);

if (KEY) {
  const reps = todo.map(n => [n, [...videos.get(n)][0]]);
  for (let i = 0; i < reps.length; i += 50) {
    const batch = reps.slice(i, i + 50);
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.map(b => b[1]).join(',')}&key=${KEY}`).then(r => r.json());
    if (r.error) throw new Error(r.error.message);
    const byVid = new Map(r.items.map(v => [v.id, v.snippet.channelId]));
    for (const [name, vid] of batch) if (byVid.has(vid)) cache.channels[name] = { id: byVid.get(vid) };
  }
} else {
  await pool(todo, 8, async name => {
    const vid = [...videos.get(name)][0];
    const o = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${vid}&format=json`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!o?.author_url) return;
    const html = await page(o.author_url);
    cache.channels[name] = {
      id: grab(html, /"externalId":"([^"]+)"/) || o.author_url,
      title: o.author_name,
      url: o.author_url,
      // Absent entirely when a channel has no subscribers yet.
      subs: count(grab(html, /"([\d.,]+[KMB]?) subscribers?"/)),
      icon: grab(html, /property="og:image" content="([^"]+)"/) || '',
    };
  });
}

// --- views ------------------------------------------------------------------
// Keyless only: with a key the channel's lifetime total comes back below, no per-video work.
if (!KEY) {
  const ids = [...videos.values()].flatMap(s => [...s]).filter(id => FRESH || cache.views[id] === undefined);
  if (ids.length) console.error(`counting views on ${ids.length} video(s)…`);
  await pool(ids, 8, async id => {
    cache.views[id] = count(grab(await page(`https://www.youtube.com/watch?v=${id}`), /"viewCount":"(\d+)"/));
  });
}
await writeFile(CACHE, JSON.stringify(cache));

// --- enrich (API only: avatars, lifetime views, subscribers, true video counts) ---
const stats = new Map();
if (KEY) {
  const ids = order.map(n => cache.channels[n]?.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids.slice(i, i + 50).join(',')}&key=${KEY}`).then(r => r.json());
    if (r.error) throw new Error(r.error.message);
    for (const c of r.items) stats.set(c.id, c);
  }
}

// --- emit -------------------------------------------------------------------
// Chrome blocks the s900 avatar variant with ERR_BLOCKED_BY_ORB; s176 loads fine and is 1/25th the bytes.
const avatar = u => u.replace(/=s\d+/, '=s176');

const channels = order.flatMap((name, i) => {
  const hit = cache.channels[name];
  if (!hit) { console.error(`  ! unresolved: ${name}`); return []; }
  const c = stats.get(hit.id);
  const t = c?.snippet.thumbnails;
  return [{
    name: c?.snippet.title || hit.title || name,
    url: c ? `https://www.youtube.com/channel/${hit.id}` : hit.url,
    icon: avatar(t?.high?.url || t?.default?.url || hit.icon || ''),
    videos: +(c?.statistics.videoCount ?? videos.get(name).size),
    views: c ? +c.statistics.viewCount : [...videos.get(name)].reduce((a, id) => a + (cache.views[id] || 0), 0),
    subs: c ? +c.statistics.subscriberCount : (hit.subs ?? 0),
    // Channel age when the API knows it; otherwise position in videos.txt.
    added: c?.snippet.publishedAt || i,
  }];
});

await writeFile(new URL('./channels.js', import.meta.url), `window.CHANNELS = ${JSON.stringify(channels, null, 1)};\n`);
console.error(`${channels.length} channels -> channels.js`);
}
