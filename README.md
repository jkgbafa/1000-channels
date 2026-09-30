# 1000 Channels

A dashboard for every YouTube channel in the network. Open `index.html` — no build step, no server, no dependencies.

## Adding channels

Paste new lines into `data/videos.txt` (the same format you already send), then:

```sh
node build.mjs
```

It resolves each channel, writes `channels.js`, and the dashboard picks it up on reload. Already-resolved
channels are cached in `.cache.json`, so a rebuild only costs network time for the new ones.

Any line with a YouTube link works — `youtu.be/…`, `/shorts/…` and `watch?v=…` are all recognised, schedule
times in brackets are stripped, and lines without links are ignored:

```
Spirit Led Living (12:10, 17:10): https://youtu.be/S8eLgKXTO0E, Short https://youtube.com/shorts/1tBwn2v2GiI
```

Videos that aren't public yet can't be resolved — the build prints them by name and skips them. Run it
again once they premiere.

## View counts

Lifetime view totals are not published anywhere public, so without a key the dashboard shows channels and
video counts only. With a [YouTube Data API key](https://console.cloud.google.com/apis/credentials):

```sh
YT_API_KEY=… node build.mjs
```

you also get lifetime views per channel, the channel's true video count (not just what's in `videos.txt`),
and true channel-creation dates behind the **Newest** sort. It costs ~2 API units per 50 channels, so all
1000 channels is well inside the free daily quota.

## Checking it still works

```sh
node check.mjs
```

Asserts the parser against the awkward line shapes and validates every generated tile.
