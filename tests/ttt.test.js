// Run with:  node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../docs/js/ttt.js");
const B = (s) => s.split("").map((c) => (c === "-" ? null : c));

test("player alternates starting with X", () => {
  assert.equal(T.player(T.initialState()), "X");
  assert.equal(T.player(B("X--------")), "O");
  assert.equal(T.player(B("XO-------")), "X");
});
test("actions lists empty cells; result does not mutate", () => {
  const b = B("XO-------");
  assert.deepEqual(T.actions(b), [2, 3, 4, 5, 6, 7, 8]);
  const n = T.result(b, 4);
  assert.equal(n[4], "X"); assert.equal(b[4], null);
  assert.throws(() => T.result(b, 0));
});
test("winner detects rows, columns, diagonals", () => {
  assert.equal(T.winner(B("XXX-OO---")), "X");
  assert.equal(T.winner(B("XO-XO-X--")), "X");
  assert.equal(T.winner(B("O-X-OX--O")), "O");
  assert.equal(T.winner(B("XOXXOOOXX")), null);
  assert.deepEqual(T.winningLine(B("--O-O-O--")), [2, 4, 6]);
});
test("terminal and utility", () => {
  assert.equal(T.terminal(B("XOXXOOOXX")), true);
  assert.equal(T.utility(B("XOXXOOOXX")), 0);
  assert.equal(T.utility(B("OOOXX----")), -1);
  assert.equal(T.terminal(T.initialState()), false);
});
test("empty board is a draw with perfect play; node counts match the textbook", () => {
  const full = T.search(T.initialState(), { alphaBeta: false });
  const ab = T.search(T.initialState(), { alphaBeta: true });
  assert.equal(full.value, 0); assert.equal(ab.value, 0);
  assert.equal(full.nodes, 549945);
  assert.ok(ab.nodes < full.nodes / 5);
});
test("minimax takes an immediate win and blocks an immediate loss", () => {
  assert.equal(T.bestMove(B("XX-OO----")).move, 2);       // X to move: wins now
  assert.equal(T.bestMove(B("X-X-O----")).move, 1);       // O to move: must block the top row
});
test("depth-limited search misses a fork the full search sees", () => {
  // X in two opposite corners, O in centre: O to move must play an edge; corner loses to a fork
  const b = B("X---O---X");
  const full = T.search(b, { alphaBeta: true });
  assert.equal(full.evals[1], 0, "edge holds the draw");
  assert.equal(full.evals[2], 1, "corner loses for O (X forks)");
  const shallow = T.search(b, { alphaBeta: true, depth: 2 });
  assert.equal(shallow.evals[2], 0, "2-ply search cannot see the fork");
});
test("perfect vs perfect always draws; perfect never loses to random", () => {
  for (let g = 0; g < 10; g++) { let b = T.initialState(); while (!T.terminal(b)) b = T.result(b, T.bestMove(b).move); assert.equal(T.winner(b), null); }
  let seed = 5; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let g = 0; g < 100; g++) {
    let b = T.initialState(); const ai = g % 2 ? "X" : "O";
    while (!T.terminal(b)) b = T.result(b, T.player(b) === ai ? T.bestMove(b, {}, rng).move : T.LEVELS.easy.pick(b, rng).move);
    assert.notEqual(T.winner(b), ai === "X" ? "O" : "X");
  }
});
test("rateMove grades best / mistake / blunder", () => {
  assert.equal(T.rateMove(B("XX-OO----"), 2).rating, "best");
  assert.equal(T.rateMove(B("XX-OO----"), 5).rating, "mistake");   // X blocks instead of winning → draw
  assert.equal(T.rateMove(B("XX-OO----"), 8).rating, "blunder");   // X ignores both → O wins
});
test("treeStats counts 255,168 games and 5,478 positions", () => {
  const s = T.treeStats(T.initialState());
  assert.equal(s.games, 255168); assert.equal(s.positions, 5478);
  assert.equal(s.xWins, 131184); assert.equal(s.oWins, 77904); assert.equal(s.draws, 46080);
});
