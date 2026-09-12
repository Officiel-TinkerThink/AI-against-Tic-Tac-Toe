"""Tests for the Python minimax player.  Run with:  python -m unittest discover tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import tictactoe as ttt  # noqa: E402

X, O, E = ttt.X, ttt.O, ttt.EMPTY


def board(s):
    cells = [None if c == "-" else c for c in s]
    return [cells[0:3], cells[3:6], cells[6:9]]


class Rules(unittest.TestCase):
    def test_player(self):
        self.assertEqual(ttt.player(ttt.initial_state()), X)
        self.assertEqual(ttt.player(board("X--------")), O)

    def test_actions_and_result(self):
        b = board("XO-------")
        self.assertEqual(ttt.actions(b), {(0, 2), (1, 0), (1, 1), (1, 2), (2, 0), (2, 1), (2, 2)})
        n = ttt.result(b, (1, 1))
        self.assertEqual(n[1][1], X)
        self.assertIsNone(b[1][1])
        with self.assertRaises(Exception):
            ttt.result(b, (0, 0))

    def test_winner_terminal_utility(self):
        self.assertEqual(ttt.winner(board("XXX-OO---")), X)
        self.assertEqual(ttt.winner(board("O-X-OX--O")), O)
        self.assertIsNone(ttt.winner(board("XOXXOOOXX")))
        self.assertTrue(ttt.terminal(board("XOXXOOOXX")))
        self.assertFalse(ttt.terminal(ttt.initial_state()))
        self.assertEqual(ttt.utility(board("OOOXX----")), -1)
        self.assertEqual(ttt.utility(board("XOXXOOOXX")), 0)


class Minimax(unittest.TestCase):
    def test_takes_immediate_win(self):
        self.assertEqual(ttt.minimax(board("XX-OO----")), (0, 2))

    def test_blocks_immediate_loss(self):
        self.assertEqual(ttt.minimax(board("X-X-O----")), (0, 1))

    def test_terminal_returns_none(self):
        self.assertIsNone(ttt.minimax(board("XXX-OO---")))

    def test_perfect_play_draws(self):
        b = ttt.initial_state()
        while not ttt.terminal(b):
            b = ttt.result(b, ttt.minimax(b))
        self.assertIsNone(ttt.winner(b))

    def test_never_loses_to_every_first_move(self):
        for move in ttt.actions(ttt.initial_state()):
            b = ttt.result(ttt.initial_state(), move)
            while not ttt.terminal(b):
                b = ttt.result(b, ttt.minimax(b))
            self.assertNotEqual(ttt.winner(b), X)


if __name__ == "__main__":
    unittest.main()
