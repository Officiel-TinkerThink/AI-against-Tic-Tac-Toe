/* Tic-Tac-Toe vs Minimax — UI controller. Depends on ttt.js */
(function () {
  "use strict";
  const T = window.TTT;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "ttt-minimax-v1";
  const NS = "http://www.w3.org/2000/svg";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (v) => Number(v).toLocaleString("en-US");

  // ------------------------------------------------------------ sound
  const Sound = (() => {
    let ctx = null, enabled = true;
    function tone(f, dur, type, gain, when) {
      if (!enabled) return;
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || "sine"; o.frequency.value = f;
        const t = ctx.currentTime + (when || 0);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
      } catch (e) { /* no audio */ }
    }
    return {
      set enabled(v) { enabled = v; },
      x() { tone(660, 0.08, "triangle", 0.07); }, o() { tone(440, 0.1, "sine", 0.08); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.09, i * 0.08)); },
      lose() { tone(220, 0.25, "sawtooth", 0.05); tone(150, 0.4, "sawtooth", 0.04, 0.12); },
      draw() { tone(392, 0.15, "sine", 0.06); tone(392, 0.15, "sine", 0.06, 0.2); },
      click() { tone(900, 0.03, "square", 0.03); }, blunder() { tone(200, 0.12, "square", 0.04); },
    };
  })();

  // ------------------------------------------------------------ state
  const ACHIEVEMENTS = [
    { id: "drawhard", emoji: "🛡️", title: "Unbreakable", desc: "Draw against Hard — the best anyone can do." },
    { id: "flawless", emoji: "💎", title: "Flawless", desc: "Play a whole game vs Hard with every move rated best." },
    { id: "drawaso", emoji: "🥈", title: "Second is fine", desc: "Draw against Hard while playing O." },
    { id: "beatmedium", emoji: "🍴", title: "Fork master", desc: "Beat Medium — it can't see forks coming." },
    { id: "easy3", emoji: "🔥", title: "Warm-up", desc: "Win 3 games in a row against Easy." },
    { id: "spectator", emoji: "🍿", title: "Spectator", desc: "Watch an AI vs AI game to the end." },
    { id: "cartographer", emoji: "🗺️", title: "Cartographer", desc: "Count the whole game tree." },
  ];
  function freshState() {
    return { mode: "ai", side: "X", level: "hard", eval: true, feedback: true, sound: true,
      scores: { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } },
      games: 0, easyStreak: 0, bestRated: 0, totalRated: 0, achievements: {} };
  }
  let S = load();
  function load() { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return Object.assign(freshState(), JSON.parse(r)); } catch (e) { /* ignore */ } return freshState(); }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------ board drawing (shared)
  function el(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  const cx = (i) => 50 + (i % 3) * 100, cy = (i) => 50 + Math.floor(i / 3) * 100;

  /**
   * Draw a board into an svg. opts: { onClick(i), evals: {i: value}, perspective: "X"|"O", winLine, animate: Set of indices, hint: i, dimAll }
   */
  function drawBoard(svg, board, opts) {
    opts = opts || {};
    svg.innerHTML = "";
    [100, 200].forEach((p) => { el("line", { x1: p, y1: 12, x2: p, y2: 288, class: "grid-line" }, svg); el("line", { x1: 12, y1: p, x2: 288, y2: p, class: "grid-line" }, svg); });
    for (let i = 0; i < 9; i++) {
      const x = cx(i), y = cy(i);
      if (board[i] === null) {
        const cell = el("rect", { x: x - 48, y: y - 48, width: 96, height: 96, rx: 10, class: "cell" + (opts.hint === i ? " hintcell" : "") }, svg);
        if (opts.onClick) cell.addEventListener("click", () => opts.onClick(i));
        if (opts.evals && opts.evals[i] !== undefined) {
          const v = opts.evals[i] * (opts.perspective === "O" ? -1 : 1);
          const t = el("text", { x, y: y + 30, class: "eval " + (v > 0 ? "w" : v < 0 ? "l" : "d") }, svg);
          t.textContent = v > 0 ? "win" : v < 0 ? "loss" : "draw";
        }
      } else {
        const anim = opts.animate && opts.animate.has(i) ? " draw-in" : "";
        const dim = opts.dimAll ? " dim" : "";
        if (board[i] === "X") {
          el("path", { d: `M${x - 26},${y - 26} L${x + 26},${y + 26} M${x + 26},${y - 26} L${x - 26},${y + 26}`, class: "mark x" + anim + dim }, svg);
        } else {
          el("circle", { cx: x, cy: y, r: 27, class: "mark o" + anim + dim }, svg);
        }
      }
    }
    if (opts.winLine) {
      const [a, , c] = opts.winLine;
      el("line", { x1: cx(a), y1: cy(a), x2: cx(c), y2: cy(c), class: "winline" }, svg);
    }
  }

  // ------------------------------------------------------------ game
  let board = T.initialState(), history = [], busy = false, watching = false, watchStop = false, allBest = true, hintCell = null, lastAnim = new Set();
  const boardSvg = $("board");

  const humanTurn = () => S.mode === "two" || (S.mode === "ai" && T.player(board) === S.side);

  async function newGame() {
    watchStop = true;
    await sleep(0);
    board = T.initialState(); history = []; allBest = true; hintCell = null; lastAnim = new Set();
    $("banner").hidden = true;
    $("moves").innerHTML = "";
    $("think").innerHTML = S.mode === "two" ? "Two-player mode — the evaluation overlay still shows the minimax value of each move." : "Make a move and the AI will show what it searched.";
    $("evals").innerHTML = "";
    render();
    if (S.mode === "watch") watchGame();
    else if (S.mode === "ai" && !humanTurn()) aiMove();
  }

  function place(i, who) {
    const before = board;
    board = T.result(board, i);
    history.push({ before, action: i, by: who });
    lastAnim = new Set([i]);
    if (T.player(before) === "X") Sound.x(); else Sound.o();
  }

  function onCell(i) {
    if (busy || T.terminal(board) || !humanTurn() || board[i] !== null) return;
    const before = board;
    place(i, "human");
    hintCell = null;
    if (S.feedback && S.mode === "ai") grade(before, i);
    render();
    if (T.terminal(board)) return finish();
    if (S.mode === "ai") aiMove();
  }

  function grade(before, action) {
    const r = T.rateMove(before, action);
    const n = history.length;
    const chip = document.createElement("span");
    chip.className = r.rating;
    const label = { best: "best", mistake: "mistake", blunder: "blunder" }[r.rating];
    chip.textContent = `#${n} ${label}`;
    chip.title = r.rating === "best" ? "This was one of the best moves." : `This move turns a ${valWord(r.best, T.player(before))} into a ${valWord(r.played, T.player(before))}.`;
    $("moves").appendChild(chip);
    S.totalRated++; if (r.rating === "best") S.bestRated++; else allBest = false;
    if (r.rating === "blunder") { Sound.blunder(); toast("Blunder — that move loses against perfect play. Undo to try again."); }
    else if (r.rating === "mistake") toast("Mistake — you had a winning line and gave it up.");
    save();
  }
  function valWord(v, p) { const m = v * (p === "O" ? -1 : 1); return m > 0 ? "win" : m < 0 ? "loss" : "draw"; }

  async function aiMove() {
    if (T.terminal(board)) return;
    busy = true; render();
    await sleep(S.mode === "watch" ? 500 : 420);
    const t0 = performance.now();
    const lvl = T.LEVELS[S.level];
    const r = lvl.pick(board);
    const ms = performance.now() - t0;
    // node counts for the panel (full minimax vs alpha-beta on this position)
    let think = "";
    if (S.level === "hard") {
      const ab = T.search(board, { alphaBeta: true }), full = T.search(board, { alphaBeta: false });
      think = `<b>Hard</b> searched <b>${num(ab.nodes)}</b> nodes with alpha-beta — <b>${num(full.nodes)}</b> without pruning <span class="cut">(${(full.nodes / Math.max(1, ab.nodes)).toFixed(1)}× fewer)</span> — in ${ms.toFixed(1)} ms. Position value: <b>${valWord(ab.value, T.player(board))}</b> for ${T.player(board)}.`;
      renderEvals(r.evals, r.move, T.player(board));
    } else if (S.level === "medium") {
      think = `<b>Medium</b> looked 2 moves ahead (${num(r.nodes)} nodes). Positions that aren't finished by then count as "unknown" — so it takes wins and blocks threats, but can't see a fork forming.`;
      renderEvals(r.evals, r.move, T.player(board));
    } else think = `<b>Easy</b> picked a random empty cell. No search at all.`;
    $("think").innerHTML = think;
    place(r.move, "ai");
    busy = false;
    render();
    if (T.terminal(board)) finish();
  }

  function renderEvals(evals, chosen, mover) {
    const cells = [];
    for (let i = 0; i < 9; i++) {
      if (evals[i] === undefined) { cells.push(`<div style="opacity:.25">${board[i] || "·"}</div>`); continue; }
      const v = evals[i] * (mover === "O" ? -1 : 1);
      cells.push(`<div class="${v > 0 ? "w" : v < 0 ? "l" : "d"}${i === chosen ? " chosen" : ""}"><b>${v > 0 ? "win" : v < 0 ? "loss" : "draw"}</b>cell ${i + 1}</div>`);
    }
    $("evals").innerHTML = cells.join("");
  }

  async function watchGame() {
    watching = true; watchStop = false;
    while (!T.terminal(board) && !watchStop) await aiMove();
    watching = false;
    if (!watchStop && T.terminal(board)) unlock("spectator");
  }

  function finish() {
    const w = T.winner(board);
    const banner = $("banner");
    banner.hidden = false;
    let title, cls, why;
    if (S.mode === "ai") {
      const won = w === S.side, lost = w && w !== S.side;
      const sc = S.scores[S.level];
      S.games++;
      if (won) { sc.w++; Sound.win(); title = "You win! 🎉"; cls = S.side.toLowerCase(); why = S.level === "hard" ? "…that shouldn't be possible." : `The ${S.level} AI missed it.`; }
      else if (lost) { sc.l++; Sound.lose(); title = "AI wins"; cls = w.toLowerCase(); why = "Check your move grades — a blunder is where it slipped away."; }
      else { sc.d++; Sound.draw(); title = "Draw"; cls = "draw"; why = S.level === "hard" ? "Against perfect play, a draw is a perfect result." : "Nobody blinked."; }
      if (S.level === "easy") S.easyStreak = won ? S.easyStreak + 1 : 0;
      if (!lost && S.level === "hard") { unlock("drawhard"); if (S.side === "O") unlock("drawaso"); if (allBest && history.some((h) => h.by === "human")) unlock("flawless"); }
      if (won && S.level === "medium") unlock("beatmedium");
      if (S.easyStreak >= 3) unlock("easy3");
    } else {
      title = w ? `${w} wins` : "Draw"; cls = w ? w.toLowerCase() : "draw"; why = w ? "" : "As minimax predicts — perfect play always draws.";
      if (w) Sound.win(); else Sound.draw();
    }
    banner.innerHTML = `<div><div class="big ${cls}">${title}</div><p>${why}</p><button class="btn btn-primary" id="btnAgain">Play again</button></div>`;
    $("btnAgain").addEventListener("click", newGame);
    save(); render(); renderStats();
  }

  function undo() {
    if (busy || watching || !history.length) return;
    if (S.mode === "ai") {
      // back to the last position where it was the human's turn
      let h = history.pop();
      while (h && h.by === "ai" && history.length) h = history.pop();
      board = h.before;
      const chips = $("moves"); if (chips.lastChild) chips.removeChild(chips.lastChild);
      allBest = false;
    } else board = history.pop().before;
    $("banner").hidden = true; hintCell = null; lastAnim = new Set();
    render();
    if (S.mode === "ai" && !humanTurn() && !T.terminal(board)) aiMove();
  }

  function hint() {
    if (busy || T.terminal(board) || !humanTurn()) return;
    const r = T.bestMove(board);
    hintCell = r.move; allBest = false;
    render();
    toast(`Best move: cell ${r.move + 1} — ${valWord(r.value, T.player(board))} with perfect play.`);
  }

  function render() {
    const over = T.terminal(board);
    const p = T.player(board);
    let evals = null;
    if (S.eval && !over && (S.mode === "two" || humanTurn())) evals = T.search(board, { alphaBeta: true }).evals;
    drawBoard(boardSvg, board, {
      onClick: onCell, evals, perspective: p, winLine: T.winningLine(board), animate: lastAnim, hint: hintCell,
    });
    boardSvg.classList.toggle("locked", over || busy || !humanTurn());
    const st = $("status");
    if (over) { const w = T.winner(board); st.textContent = w ? `${w} wins` : "Draw"; st.className = "status " + (w ? w.toLowerCase() : ""); }
    else if (S.mode === "watch") { st.textContent = `${p} to move (AI)`; st.className = "status " + p.toLowerCase(); }
    else if (busy) { st.textContent = "AI is thinking…"; st.className = "status " + p.toLowerCase(); }
    else if (S.mode === "two") { st.textContent = `${p} to move`; st.className = "status " + p.toLowerCase(); }
    else { st.textContent = humanTurn() ? `Your move (${S.side})` : "AI's move"; st.className = "status " + p.toLowerCase(); }
    const sc = S.scores[S.level];
    $("score").innerHTML = `<div class="sx"><b>${S.mode === "ai" ? sc.w : "–"}</b><span>you</span></div><div><b>${S.mode === "ai" ? sc.d : "–"}</b><span>draws</span></div><div class="so"><b>${S.mode === "ai" ? sc.l : "–"}</b><span>AI (${S.level})</span></div>`;
    $("btnUndo").disabled = !history.length || busy || watching || S.mode === "watch";
    $("btnHint").disabled = over || busy || !humanTurn() || S.mode === "watch";
  }

  function renderStats() {
    const tile = (l, v, sub) => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ""}</div>`;
    const tot = (k) => Object.values(S.scores).reduce((a, s) => a + s[k], 0);
    $("stats").innerHTML =
      tile("Games vs AI", S.games) + tile("Wins", tot("w")) + tile("Draws", tot("d")) + tile("Losses", tot("l")) +
      tile("vs Hard", `${S.scores.hard.w}–${S.scores.hard.d}–${S.scores.hard.l}`, "win–draw–loss") +
      tile("Move accuracy", S.totalRated ? Math.round((S.bestRated / S.totalRated) * 100) + "%" : "—", `${S.bestRated} of ${S.totalRated} moves rated best`);
    $("achievements").innerHTML = ACHIEVEMENTS.map((a) => `<li class="${S.achievements[a.id] ? "done" : ""}"><span class="emoji">${a.emoji}</span><div>${a.title}<small>${a.desc}</small></div></li>`).join("");
  }
  function unlock(id) {
    if (S.achievements[id]) return;
    S.achievements[id] = Date.now(); save();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    toast(`${a.emoji} Achievement — <b>${a.title}</b>: ${a.desc}`, 4500);
    renderStats();
  }

  // ------------------------------------------------------------ tree explorer
  let path = [];
  function pathBoard(p) { let b = T.initialState(); for (const a of p) b = T.result(b, a); return b; }
  function renderTree() {
    const b = pathBoard(path);
    const p = T.player(b), over = T.terminal(b);
    drawBoard($("treeBoard"), b, { winLine: T.winningLine(b) });
    const crumbs = $("crumbs");
    crumbs.innerHTML = "";
    const mk = (label, depth) => { const btn = document.createElement("button"); btn.textContent = label; if (depth === path.length) btn.className = "cur"; btn.addEventListener("click", () => { path = path.slice(0, depth); renderTree(); }); return btn; };
    crumbs.appendChild(mk("empty board", 0));
    path.forEach((a, i) => { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; crumbs.appendChild(s); crumbs.appendChild(mk(`${i % 2 ? "O" : "X"} → ${a + 1}`, i + 1)); });
    let info;
    if (over) {
      const w = T.winner(b);
      info = `<b>Terminal position.</b> ${w ? w + " has won." : "It's a draw."} Utility ${T.utility(b)}.`;
    } else {
      const ab = T.search(b, { alphaBeta: true }), full = T.search(b, { alphaBeta: false });
      const st = path.length ? T.treeStats(b) : null;
      info = `<b>${p} to move</b> · value <b>${valWord(ab.value, p)}</b> for ${p} (utility ${ab.value}).<br>Full minimax visits <b>${num(full.nodes)}</b> nodes here; alpha-beta <b>${num(ab.nodes)}</b>.` +
        (st ? `<br>Subtree: <b>${num(st.games)}</b> possible games — X wins ${num(st.xWins)}, O wins ${num(st.oWins)}, draws ${num(st.draws)}; ${num(st.positions)} distinct positions.` : "");
    }
    $("treeInfo").innerHTML = info;
    const ch = $("treeChildren");
    ch.innerHTML = "";
    if (over) return;
    for (const a of T.actions(b)) {
      const nb = T.result(b, a);
      const ab = T.search(nb, { alphaBeta: true }), full = T.search(nb, { alphaBeta: false });
      const v = T.terminal(nb) ? T.utility(nb) : ab.value;
      const m = v * (p === "O" ? -1 : 1);
      const d = document.createElement("div");
      d.className = "child " + (m > 0 ? "w" : m < 0 ? "l" : "d");
      const svg = el("svg", { viewBox: "0 0 300 300", class: "board" });
      drawBoard(svg, nb, { winLine: T.winningLine(nb) });
      d.appendChild(svg);
      d.insertAdjacentHTML("beforeend", `<div class="val">${p} → ${a + 1}: ${m > 0 ? "win" : m < 0 ? "loss" : "draw"}</div><div class="nodes">${T.terminal(nb) ? "terminal" : num(ab.nodes) + " / " + num(full.nodes) + " nodes"}</div>`);
      d.addEventListener("click", () => { path = path.concat([a]); Sound.click(); renderTree(); });
      ch.appendChild(d);
    }
  }
  function countTree() {
    const tile = (l, v, sub) => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ""}</div>`;
    $("treeStats").innerHTML = tile("Counting…", "⏳");
    setTimeout(() => {
      const t0 = performance.now(); const s = T.treeStats(T.initialState()); const ms = performance.now() - t0;
      $("treeStats").innerHTML =
        tile("Tree nodes", num(s.nodes), "including the empty board") + tile("Possible games", num(s.games), "sequences to a finish") +
        tile("X wins", num(s.xWins), (s.xWins / s.games * 100).toFixed(1) + "% of games") + tile("O wins", num(s.oWins), (s.oWins / s.games * 100).toFixed(1) + "%") +
        tile("Draws", num(s.draws), (s.draws / s.games * 100).toFixed(1) + "%") + tile("Distinct positions", num(s.positions), "reachable boards") +
        tile("Counted in", ms.toFixed(0) + " ms", "in your browser");
      unlock("cartographer");
    }, 30);
  }

  // ------------------------------------------------------------ misc
  function toast(html, ms) { const t = document.createElement("div"); t.className = "toast"; t.innerHTML = html; $("toasts").appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms || 3200); }
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-body").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "tree") renderTree();
  }
  function syncControls() {
    $("mode").value = S.mode; $("side").value = S.side; $("level").value = S.level;
    $("chkEval").checked = S.eval; $("chkFeedback").checked = S.feedback;
    $("sideField").hidden = S.mode !== "ai"; $("levelField").hidden = S.mode === "two";
    $("levelHint").textContent = { easy: "Beatable by anyone. Good for learning the board.", medium: "Blocks and takes immediate wins, but a fork beats it.", hard: "Cannot be beaten. Aim for a draw — and a flawless one." }[S.level];
    $("btnSound").setAttribute("aria-pressed", S.sound); $("btnSound").textContent = S.sound ? "🔊" : "🔇"; Sound.enabled = S.sound;
  }

  ["mode", "side", "level"].forEach((id) => $(id).addEventListener("change", (e) => { S[id] = e.target.value; save(); syncControls(); newGame(); }));
  $("chkEval").addEventListener("change", (e) => { S.eval = e.target.checked; save(); render(); });
  $("chkFeedback").addEventListener("change", (e) => { S.feedback = e.target.checked; save(); });
  $("btnNew").addEventListener("click", newGame);
  $("btnUndo").addEventListener("click", undo);
  $("btnHint").addEventListener("click", hint);
  $("btnCount").addEventListener("click", countTree);
  $("btnSound").addEventListener("click", () => { S.sound = !S.sound; save(); syncControls(); Sound.click(); });
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { switchTab(t.dataset.tab); Sound.click(); }));
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "n") newGame(); else if (k === "z") undo(); else if (k === "h") hint();
    else if (k >= "1" && k <= "9") onCell(Number(k) - 1);
  });

  syncControls(); renderStats(); newGame();
  if (!S.games) setTimeout(() => toast("Click a cell (or press 1–9). The labels show what each move leads to with perfect play.", 5500), 600);
  window.__ttt = { state: () => S, board: () => board, onCell, newGame, undo, hint, countTree };
})();
