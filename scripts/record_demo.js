const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: 'assets/raw-video', size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div'); c.style.cssText = 'position:fixed;z-index:9999;width:22px;height:22px;border-radius:50%;background:rgba(34,211,238,.4);border:2px solid #fff;pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s;left:-100px;top:-100px;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    document.body.appendChild(c); document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
    document.addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.7)'; }); document.addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%) scale(1)'; }); }); });
  await page.goto('http://127.0.0.1:8000/index.html'); await page.evaluate(() => localStorage.clear()); await page.reload(); await sleep(1200);
  async function glideClick(sel, pause = 450) { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 }); await sleep(pause); await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  async function clickCell(i, pause = 500) { const b = await page.locator('#board').boundingBox(); const x = b.x + b.width * ((i % 3) + 0.5) / 3, y = b.y + b.height * (Math.floor(i / 3) + 0.5) / 3; await page.mouse.move(x, y, { steps: 16 }); await sleep(pause); await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  // game 1 vs hard: play well (centre, then follow the labels) → draw
  await clickCell(4); await sleep(1300);
  for (let i = 0; i < 4; i++) {
    const over = await page.evaluate(() => window.TTT.terminal(window.__ttt.board())); if (over) break;
    const best = await page.evaluate(() => window.TTT.bestMove(window.__ttt.board()).move);
    await clickCell(best, 700); await sleep(1300);
  }
  await sleep(1800);
  // game 2: deliberately blunder to show grading, then undo
  await glideClick('#btnAgain', 300); await sleep(600);
  await clickCell(0); await sleep(1300);
  const bad = await page.evaluate(() => { const b = window.__ttt.board(); const r = window.TTT.search(b, {alphaBeta:true}); const p = window.TTT.player(b); let worst=null, wv=Infinity; for (const k in r.evals){ const v=r.evals[k]*(p==="O"?-1:1); if(v<wv){wv=v;worst=Number(k);} } return worst; });
  await clickCell(bad, 700); await sleep(2200);
  await glideClick('#btnUndo', 400); await sleep(900);
  await glideClick('#btnHint', 400); await sleep(1500);
  // tree explorer
  await glideClick('.tab[data-tab="tree"]', 400); await sleep(900);
  await glideClick('.child', 500); await sleep(900);
  await glideClick('.child', 500); await sleep(900);
  await page.evaluate(() => document.getElementById('btnCount').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(700);
  await glideClick('#btnCount', 400); await sleep(2200);
  // watch mode
  await glideClick('.tab[data-tab="play"]', 300); await page.selectOption('#mode', 'watch'); await sleep(6500);
  await ctx.close(); await browser.close(); console.log('recorded');
})();
