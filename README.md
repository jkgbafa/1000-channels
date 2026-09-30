# 1000 Channels

A dashboard for every YouTube channel in the network — searchable tiles showing each channel's
icon, name, subscribers, videos and views, with totals across the whole network at the top.

Open `index.html`. No build step, no server, no dependencies.

## Adding channels

Paste new lines into `data/videos.txt` (the same format you already send), then:

```sh
node build.mjs
```

It resolves anything new, writes `channels.js`, and the dashboard picks it up on reload.

Any line with a YouTube link works — `youtu.be/…`, `/shorts/…` and `watch?v=…` are all recognised,
schedule times in brackets are stripped, and lines without links are ignored:

```
Spirit Led Living (12:10, 17:10): https://youtu.be/S8eLgKXTO0E, Short https://youtube.com/shorts/1tBwn2v2GiI
```

Videos that aren't public yet can't be resolved — the build prints them by name and skips them.
Run it again once they premiere.

### Refreshing the numbers

Everything fetched is cached in `.cache.json`, so a normal build only touches channels it hasn't
seen. Subscriber and view counts move, so to pull fresh numbers for everything:

```sh
node build.mjs --refresh
```

That re-reads every channel page and every video page (~45s for 137 channels), so it's worth
running on a schedule rather than on every edit.

## Where the numbers come from

Without an API key the build scrapes what YouTube publishes: oEmbed identifies each channel, the
channel page gives the avatar and subscriber count, and each video's watch page gives its view
count. **Views are therefore the sum of the videos listed in `data/videos.txt`**, not the channel's
lifetime total — YouTube only publishes lifetime channel views through its API.

With a [YouTube Data API key](https://console.cloud.google.com/apis/credentials):

```sh
YT_API_KEY=… node build.mjs
```

views, subscribers and video counts all become the channel's true lifetime totals, the **Newest**
sort uses real channel creation dates, and it's much faster — about 2 quota units per 50 channels,
so all 1000 channels sits well inside the free daily quota.

## Publishing

The dashboard is a static site, so GitHub Pages serves it straight from the repo — every push to
`main` redeploys it. Enable it once under **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)`**, or:

```sh
gh api repos/jkgbafa/1000-channels/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
```

GitHub Pages needs the repo to be **public** on a free account. The published page is then readable
by anyone with the link — no accounts, no invites.

### Giving someone access

Sharing the *link* needs nothing. To let someone edit the repo (add channels, run the build):

```sh
gh api repos/jkgbafa/1000-channels/collaborators/THEIR_GITHUB_USERNAME -X PUT -f permission=push
```

or **Settings → Collaborators → Add people**. They get an email invite; `permission=pull` makes it
read-only instead.

## Checking it still works

```sh
node check.mjs
```

Asserts the parser and count formatting against the awkward real-world shapes, and validates every
generated tile.
