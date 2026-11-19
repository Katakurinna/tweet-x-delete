// delete-by-search.js — Reach your OLD posts that the profile no longer shows.
//
// X only serves roughly your latest ~3,200 posts on the profile timeline. Older ones
// can still be found with search, week by week: `from:<you> since:YYYY-MM-DD until:YYYY-MM-DD`.
// A plain `from:<you>` search often returns nothing, and a single `until:` search stops
// paginating after a few days, so this script walks week-sized windows backwards.
//
// Usage: open https://x.com/search?q=from%3A<your_user>%20until%3A2030-01-01&f=live
// (any search page works: the script types the queries into the search box itself),
// open DevTools (F12) → Console, set FROM/TO below, paste the file and press Enter.
// Keep the tab visible in the foreground.
//
// Progress: window.__xStats   ·   Stop: window.__xStop = true
(async () => {
  const FROM = '2022-01-01';   // oldest date to cover (e.g. the month you joined)
  const TO = '2026-12-31';     // newest date to cover
  const WINDOW_DAYS = 7;
  const SWEEPS = 2;            // second sweep picks up what X refused with 429
  const WAIT_MINUTES = 15;

  const USER = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')
    ?.getAttribute('href')?.split('/')[1]?.toLowerCase();
  if (!USER) { console.error('[delete-by-search] could not detect your username'); return; }

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

  // Run a search without reloading the page (a reload would kill this script).
  const search = async (q) => {
    const input = document.querySelector('input[data-testid="SearchBox_Search_Input"]');
    if (!input) return false;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setValue.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(5000);
    window.scrollTo(0, 0);
    return true;
  };

  const day = 864e5;
  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  const windows = [];
  for (let end = Date.parse(TO) + day; end > Date.parse(FROM); end -= WINDOW_DAYS * day) {
    windows.push([fmt(end - WINDOW_DAYS * day), fmt(end)]);
  }

  window.__xStop = false;
  const S = (window.__xStats = { user: USER, deleted: 0, unreposted: 0, rateLimited: 0, resumeAt: null, sweep: 0, window: '', windowIdx: 0, windows: windows.length, running: true });

  for (let sweep = 1; sweep <= SWEEPS && !window.__xStop; sweep++) {
    S.sweep = sweep;
    for (let wi = 0; wi < windows.length && !window.__xStop; wi++) {
      const [since, until] = windows[wi];
      S.window = `${since}..${until}`; S.windowIdx = wi + 1;
      await search(`from:${USER} since:${since} until:${until}`);
      const skip = new Set();
      let idle = 0;
      while (!window.__xStop) {
        const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
        all.filter((x) => authorOf(x) !== USER && !x.querySelector('[data-testid="unretweet"]'))
          .forEach((x) => { const i = idOf(x); if (i) skip.add(i); });
        const a = all.find((x) => !skip.has(idOf(x) || x));
        if (!a) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(3000);
          if (++idle >= 6) break; // window done
          continue;
        }
        idle = 0;
        skip.add(idOf(a) || a);
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
          const until2 = Date.now() + WAIT_MINUTES * 60000;
          S.resumeAt = new Date(until2).toLocaleTimeString();
          while (Date.now() < until2 && !window.__xStop) await sleep(5000);
          S.resumeAt = null;
        }
        await sleep(800);
      }
    }
  }
  S.running = false;
  console.log('[delete-by-search] finished', JSON.stringify(S));
})();
