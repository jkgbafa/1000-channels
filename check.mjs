// Runnable check: node check.mjs   (no framework, exits non-zero on failure)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVideos, count } from './build.mjs';

const { order, videos } = parseVideos(`
Playing now:
Dag Heward-Mills 1999: https://youtu.be/rvfFeguXSB0, Short https://youtube.com/shorts/BOqeD-wVtv4
Spirit Led Living (12:10, 17:10): https://youtu.be/S8eLgKXTO0E
Global Buzz: Short https://youtube.com/shorts/oUAAJhORkQQ
Dag Heward-Mills 1999: https://youtu.be/rvfFeguXSB0
Dag Heward-Mills 1999: https://www.youtube.com/watch?v=QVjfBXZKblk&t=3
287 videos from 28 and 29 Sep are playing right now
`);

assert.deepEqual(order, ['Dag Heward-Mills 1999', 'Spirit Led Living', 'Global Buzz'], 'first-seen order, noise lines dropped');
assert.deepEqual([...videos.get('Dag Heward-Mills 1999')], ['rvfFeguXSB0', 'BOqeD-wVtv4', 'QVjfBXZKblk'], 'youtu.be + shorts + watch?v, deduped');
assert.deepEqual([...videos.get('Spirit Led Living')], ['S8eLgKXTO0E'], 'schedule times stripped from name');
assert.deepEqual([...videos.get('Global Buzz')], ['oUAAJhORkQQ'], 'short-only line');

// Rounded counts as YouTube renders them.
assert.equal(count('18 subscribers'), 18);
assert.equal(count('1.2K subscribers'), 1200);
assert.equal(count('3.4M subscribers'), 3_400_000);
assert.equal(count('1,234 subscribers'), 1234);
assert.equal(count('12345'), 12345, 'bare API/watch-page integers');
assert.equal(count(undefined), 0, 'absent means zero, not NaN');

// The generated payload the dashboard actually reads.
const src = await readFile(new URL('./channels.js', import.meta.url), 'utf8');
const chs = new Function('window', `${src}; return window.CHANNELS;`)({});
assert.ok(chs.length > 100, 'channels present');
for (const c of chs) {
  assert.ok(c.name && !/[(:]|^Short\b/.test(c.name), `clean name: ${c.name}`);
  assert.match(c.url, /^https:\/\/www\.youtube\.com\/(@|channel\/)/, `channel url, not a video url: ${c.url}`);
  assert.ok(c.icon.startsWith('https://'), `icon: ${c.name}`);
  assert.ok(c.videos > 0, `video count: ${c.name}`);
  for (const k of ['views', 'subs']) assert.ok(Number.isInteger(c[k]) && c[k] >= 0, `${k}: ${c.name}`);
}
assert.ok(chs.some(c => c.views > 0), 'view counts resolved');
assert.ok(chs.some(c => c.subs > 0), 'subscriber counts resolved');
assert.equal(new Set(chs.map(c => c.url)).size, chs.length, 'no duplicate channels');
console.log(`ok — parser + ${chs.length} channels`);
