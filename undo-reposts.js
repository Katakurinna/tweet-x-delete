// undo-reposts.js — Undo all your reposts (retweets) on X.
//
// Usage: open https://x.com/<your_user>/reposts, open DevTools (F12) → Console,
// paste this whole file and press Enter.
//
// Undoing reposts is NOT rate limited like deleting posts, so it runs non-stop.
// X only renders a batch of reposts per page load: when the script finishes a batch
// it stops (window.__xStats.done === true). Reload the page and paste it again.
//
// Progress: window.__xStats   ·   Stop: window.__xStop = true
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const el = fn(); if (el) return el; await sleep(100); }
    return null;
  };
  const esc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));

  // Read the real server response (the UI removes the item even when X rejects it).
  if (!window.__xHooked) {
    window.__xHooked = true;
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) {
      if (/Delete(Tweet|Retweet)/.test(u)) this.addEventListener('loadend', () => { window.__xLast = this.status; });
      return open.apply(this, arguments);
    };
    const fetch0 = window.fetch;
    window.fetch = async (...args) => {
      const r = await fetch0(...args);
      if (/Delete(Tweet|Retweet)/.test(String(args[0]?.url || args[0]))) window.__xLast = r.status;
      return r;
    };
  }

  window.__xStop = false;
  const S = (window.__xStats = { unreposted: 0, failed: 0, rateLimited: 0, done: false });
  let idle = 0;

  while (!window.__xStop) {
    const btn = document.querySelector('article [data-testid="unretweet"]');
    if (!btn) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2500);
      if (++idle >= 8) break; // nothing more in this batch
      continue;
    }
    idle = 0;
    btn.scrollIntoView({ block: 'center' });
    await sleep(150);
    window.__xLast = null;
    btn.click();
    const confirm = await waitFor(() => document.querySelector('[data-testid="unretweetConfirm"]'));
    if (!confirm) { esc(); S.failed++; await sleep(500); continue; }
    confirm.click();
    const status = await waitFor(() => window.__xLast, 8000);
    if (status === 200) S.unreposted++;
    else if (status === 429) { S.rateLimited++; await sleep(60000); }
    else S.failed++;
    await sleep(400);
  }
  S.done = true;
  console.log('[undo-reposts] batch finished', JSON.stringify(S), '— reload the page and run again if reposts remain.');
})();
