---
name: x-delete
description: Delete all of the user's own posts on X (Twitter) and undo all their reposts/retweets by running browser-console scripts in their logged-in Chrome tab. Use when the user asks to wipe, bulk-delete or clean their X/Twitter account, delete tweets, or undo retweets. Requires a browser automation tool that can navigate tabs and run JavaScript in the page (e.g. Claude in Chrome).
---

# Bulk-delete posts and reposts on X

The scripts live in this repository (`delete-posts.js`, `undo-reposts.js`, `delete-by-search.js`). They click the same buttons a person would ("⋯" → Delete → confirm, or "Undo repost"), read X's real server response for each action, and back off on rate limits.

## Before starting

- Deleting is **irreversible**. Confirm with the user that they want everything gone, and suggest they download their X data archive first (Settings → Your account → Download an archive of your data).
- Work in the user's own logged-in browser. Never ask for or type their password. If they are not logged in, ask them to log in themselves.
- Check that the logged-in account is the one they named: the profile page shows "Edit profile".
- Note the starting count ("N posts" under the profile name) so you can report real progress.

## Order of work

1. **Undo reposts** — open `https://x.com/<user>/reposts` and run `undo-reposts.js`. X does **not** rate limit this (~40–50/min). Each page load only renders a batch. When `window.__xStats.done === true`, reload the page and run it again. Repeat until a batch undoes 0.
2. **Delete posts** — open `https://x.com/<user>` (Posts tab) and run `delete-posts.js`. When the Posts tab is empty, do the same on `https://x.com/<user>/with_replies`.
3. **Old posts** — X's profile only serves roughly the latest ~3,200 posts. For older ones, open any X search page and run `delete-by-search.js` after setting `FROM` (month the account was created) and `TO`.

## Running a script

Inject the file's full contents with the page-JavaScript tool. The scripts start an async loop and return immediately. Progress is in `window.__xStats`, and `window.__xStop = true` stops a script. Poll `window.__xStats` and the profile counter. Don't trust the script's own counters alone: verify with the counter after a reload.

A full page reload kills the running script. Re-inject after every reload.

## Limits and traps (measured Nov 2026)

| Thing | Behaviour |
|---|---|
| Deleting posts | ~200 deletes, then **HTTP 429** for ~15 min. ≈400/hour overall. |
| Undoing reposts | No practical limit. |
| Fake success | On 429 the UI still removes the post and says "Your post was deleted", but it is NOT deleted. The scripts hook the XHR/fetch response and only count HTTP 200. |
| Background tab | X only renders new timeline items while the tab is **visible**. Ask the user to keep the X window in front and uncovered. Polling from the agent also keeps it moving. |
| Timer throttling | Background tabs throttle `setTimeout`. The long-running scripts use Web Worker timers. |
| Machine sleep | Sleep stops everything. On macOS run `caffeinate -di` in the background while it works. |
| Timeline stalls | After a few dozen items the timeline stops loading. Reload the page and re-inject. |
| Search | `from:<user>` with no dates often returns nothing. Use `since:`/`until:` windows (the script does this). |
| Internal API | GraphQL calls need an anti-bot header (`x-client-transaction-id`) and return 404 without it. Do not try to forge it: that is bypassing bot detection. Stick to clicking the UI. |

## Reporting

Report the real counter before and after, what remains, and which phase is next. Expect hours, not minutes, for thousands of posts. Give the user an honest estimate: `remaining_posts / 400` hours for deletes, plus minutes for reposts.
