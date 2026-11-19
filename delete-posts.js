// delete-posts.js — Delete your own posts (and undo reposts) from your X profile.
//
// Usage: open https://x.com/<your_user> (Posts tab) or https://x.com/<your_user>/with_replies
// (Replies tab), open DevTools (F12) → Console, paste this whole file and press Enter.
// Keep the tab VISIBLE in the foreground while it runs (see README: background tabs stall).
//
// What it does:
//   - Deletes every post written by you that appears in the timeline.
//   - Undoes reposts it finds on the way.
//   - Skips other people's posts shown as reply context, without wasting time on them.
//   - Reads X's real response to each delete. On HTTP 429 (rate limit) it waits
//     WAIT_MINUTES and goes on by itself.
//
// Progress: window.__xStats   ·   Stop: window.__xStop = true
(async () => {
  const WAIT_MINUTES = 15;        // pause after a 429 from X
  const DELAY_BETWEEN_MS = 800;   // pause between deletes

  const USER = (document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')
    || location.pathname).split('/')[1].toLowerCase();

  // Timers from a Web Worker: Chrome throttles page timers hard in background tabs, not worker ones.
  const worker = new Worker(URL.createObjectURL(new Blob(
    ['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const pending = new Map(); let seq = 0;
  worker.onmessage = (e) => { pending.get(e.data)?.(); pending.delete(e.data); };
  const sleep = (ms) => new Promise((r) => { const id = ++seq; pending.set(id, r); worker.postMessage({ id, ms }); });

  const waitFor = async (fn, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const el = fn(); if (el) return el; await sleep(100); }
    return null;
  };
  const esc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  const idOf = (a) => [...a.querySelectorAll('a[href*="/status/"]')]
    .map((x) => x.getAttribute('href').match(/status\/(\d+)/)?.[1]).find(Boolean) || null;
  const authorOf = (a) => a.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute('href')?.slice(1).toLowerCase();

  // X removes the post from the screen even when the server answers 429 and keeps it.
  // Hook the real response so we know what actually happened.
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
  const result = () => waitFor(() => window.__xLast, 8000);

  window.__xStop = false;
  const S = (window.__xStats = { user: USER, deleted: 0, unreposted: 0, skippedOthers: 0, rateLimited: 0, resumeAt: null, idle: 0, running: true });
  const skip = new Set();
  let idle = 0;

  while (!window.__xStop) {
    const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
    // Other people's posts (reply context): mark them all at once.
    all.filter((x) => authorOf(x) !== USER && !x.querySelector('[data-testid="unretweet"]'))
      .forEach((x) => { const i = idOf(x); if (i && !skip.has(i)) { skip.add(i); S.skippedOthers++; } });
    const a = all.find((x) => !skip.has(idOf(x) || x));

    if (!a) {
      // Nothing to do on screen: X loads the timeline in bursts. Scroll, and now and then
      // go back to the top and retry what is still visible.
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(3000);
      S.idle = ++idle;
      if (idle % 10 === 0) { skip.clear(); window.scrollTo(0, 0); await sleep(3000); }
      if (idle >= 60) break; // ~4 min with nothing new: reload the page and run again
      continue;
    }
    idle = 0; S.idle = 0;
    const id = idOf(a) || a;
    skip.add(id);
    a.scrollIntoView({ block: 'center' });
    await sleep(200);

    let status = null;
    window.__xLast = null;
    const unrt = a.querySelector('[data-testid="unretweet"]');
    if (unrt && authorOf(a) !== USER) {
      unrt.click();
      const c = await waitFor(() => document.querySelector('[data-testid="unretweetConfirm"]'));
      if (!c) { esc(); continue; }
      c.click();
      status = await result();
      if (status === 200) S.unreposted++;
    } else {
      const caret = a.querySelector('[data-testid="caret"]');
      if (!caret) continue;
      caret.click();
      const del = await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')]
        .find((m) => /^(Eliminar|Delete|Excluir|Supprimer|Löschen|Elimina)$/i.test(m.innerText.trim())));
      if (!del) { esc(); continue; }
      del.click();
      const ok = await waitFor(() => document.querySelector('[data-testid="confirmationSheetConfirm"]'));
      if (!ok) { esc(); continue; }
      ok.click();
      status = await result();
      if (status === 200) S.deleted++;
    }

    if (status === 429) {
      S.rateLimited++;
      const until = Date.now() + WAIT_MINUTES * 60000;
      S.resumeAt = new Date(until).toLocaleTimeString();
      console.log('[delete-posts] 429 from X, waiting until', S.resumeAt);
      while (Date.now() < until && !window.__xStop) await sleep(5000);
      S.resumeAt = null;
    }
    await sleep(DELAY_BETWEEN_MS);
  }
  S.running = false;
  console.log('[delete-posts] stopped', JSON.stringify(S));
})();
