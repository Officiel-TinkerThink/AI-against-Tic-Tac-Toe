/*
 * Tic-Tac-Toe engine — port of tictactoe.py plus alpha-beta pruning,
 * depth-limited search, per-move evaluations and game-tree statistics.
 * Board: array of 9 cells, each "X", "O" or null. No DOM.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TTT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const X = "X", O = "O";
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  const initialState = () => new Array(9).fill(null);
  function player(b) { let x = 0, o = 0; for (const c of b) { if (c === X) x++; else if (c === O) o++; } return x === o ? X : O; }
  function actions(b) { const out = []; for (let i = 0; i < 9; i++) if (b[i] === null) out.push(i); return out; }
  function result(b, a) { if (b[a] !== null) throw new Error("Invalid action " + a); const n = b.slice(); n[a] = player(b); return n; }
  function winningLine(b) { for (const l of LINES) if (b[l[0]] !== null && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return l; return null; }
  function winner(b) { const l = winningLine(b); return l ? b[l[0]] : null; }
  function terminal(b) { return winner(b) !== null || actions(b).length === 0; }
  function utility(b) { const w = winner(b); return w === X ? 1 : w === O ? -1 : 0; }

  /**
   * Minimax with optional alpha-beta pruning and depth limit.
   * Returns { move, value, nodes, evals: {action: value} } — values from X's perspective (+1 X wins).
   * Depth-limited search scores unfinished positions 0 ("unknown").
   * Values are depth-adjusted (a faster win scores slightly higher) so the AI finishes games quickly
   * and delays losses; evals are rounded back to −1/0/1 for display.
   */
  function search(b, opts) {
    const o = Object.assign({ alphaBeta: true, depth: Infinity }, opts);
    let nodes = 0;
    function value(board, depth, alpha, beta) {
      nodes++;
      if (terminal(board)) { const u = utility(board); return u * (1 + (10 - depth) / 100); }
      if (depth >= o.depth) return 0;
      const p = player(board);
      let best = p === X ? -Infinity : Infinity;
      for (const a of actions(board)) {
        const v = value(result(board, a), depth + 1, alpha, beta);
        if (p === X) { if (v > best) best = v; if (o.alphaBeta) { if (best > alpha) alpha = best; if (alpha >= beta) break; } }
        else { if (v < best) best = v; if (o.alphaBeta) { if (best < beta) beta = best; if (alpha >= beta) break; } }
      }
      return best;
    }
    if (terminal(b)) return { move: null, value: utility(b), nodes: 0, evals: {} };
    const p = player(b);
    const evals = {};
    let move = null, best = p === X ? -Infinity : Infinity;
    // root: evaluate every move fully (no pruning between siblings) so evals are exact for display
    for (const a of actions(b)) {
      const v = value(result(b, a), 1, -Infinity, Infinity);
      evals[a] = v;
      if ((p === X && v > best) || (p === O && v < best)) { best = v; move = a; }
    }
    const round = (v) => (v > 0.5 ? 1 : v < -0.5 ? -1 : 0);
    const rounded = {}; for (const k in evals) rounded[k] = round(evals[k]);
    return { move, value: round(best), nodes, evals: rounded, raw: evals };
  }

  /** Same as search() but picks randomly among equally good moves. */
  function bestMove(b, opts, rng) {
    const r = search(b, opts);
    if (r.move === null) return r;
    const p = player(b);
    const ties = Object.keys(r.evals).map(Number).filter((a) => r.evals[a] === r.value);
    // prefer the fastest win / slowest loss among ties using raw values
    const raw = r.raw;
    let bestRaw = p === X ? Math.max(...ties.map((a) => raw[a])) : Math.min(...ties.map((a) => raw[a]));
    const top = ties.filter((a) => raw[a] === bestRaw);
    r.move = top[Math.floor((rng || Math.random)() * top.length)];
    return r;
  }

  const minimax = (b) => search(b, { alphaBeta: false }).move;

  const LEVELS = {
    easy:   { label: "Easy — random moves", pick: (b, rng) => { const a = actions(b); return { move: a[Math.floor((rng || Math.random)() * a.length)], nodes: 0, evals: {} }; } },
    medium: { label: "Medium — looks 2 moves ahead", pick: (b, rng) => bestMove(b, { alphaBeta: true, depth: 2 }, rng) },
    hard:   { label: "Hard — perfect minimax", pick: (b, rng) => bestMove(b, { alphaBeta: true }, rng) },
  };

  /** Rate a move the human just played: "best" | "ok" | "blunder". */
  function rateMove(before, action) {
    const r = search(before, { alphaBeta: true });
    const p = player(before);
    const played = r.evals[action];
    const best = r.value;
    const better = (a, b) => (p === X ? a > b : a < b);
    if (played === best) return { rating: "best", played, best, evals: r.evals };
    // lost a win → blunder; turned a draw into a loss → blunder; turned a win into a draw → mistake
    if (better(best, played) && (played === (p === X ? -1 : 1))) return { rating: "blunder", played, best, evals: r.evals };
    return { rating: "mistake", played, best, evals: r.evals };
  }

  /** Statistics of the full game tree from a board. */
  function treeStats(b) {
    const s = { nodes: 0, games: 0, xWins: 0, oWins: 0, draws: 0, positions: new Set() };
    (function rec(board) {
      s.nodes++;
      s.positions.add(board.map((c) => c || "-").join(""));
      if (terminal(board)) { s.games++; const w = winner(board); if (w === X) s.xWins++; else if (w === O) s.oWins++; else s.draws++; return; }
      for (const a of actions(board)) rec(result(board, a));
    })(b);
    return { nodes: s.nodes, games: s.games, xWins: s.xWins, oWins: s.oWins, draws: s.draws, positions: s.positions.size };
  }

  return { X, O, LINES, initialState, player, actions, result, winner, winningLine, terminal, utility, search, bestMove, minimax, LEVELS, rateMove, treeStats };
});
