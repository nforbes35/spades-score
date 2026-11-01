// Saves the game on this device (localStorage) and keeps an undo history of every change.
import { useCallback, useEffect, useRef, useState } from 'react';

const GAME_KEY = 'spades-game';
const SETUP_KEY = 'spades-last-setup';
const UNDO_LIMIT = 100;
// Repeated taps of the same kind (e.g. + + + on one bid) undo together.
const MERGE_MS = 1500;

export function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or full storage: keep going in memory */ }
}

export function useGame() {
  const [state, setState] = useState(() => ({ game: read(GAME_KEY), past: [] }));
  useEffect(() => write(GAME_KEY, state.game), [state.game]);
  const last = useRef({ label: null, at: 0 });

  /** Change the game, remembering the previous version under `label` so it can be undone. */
  const commit = useCallback((label, update) => {
    const now = Date.now();
    const merge = last.current.label === label && now - last.current.at < MERGE_MS;
    last.current = { label, at: now };
    setState(({ game, past }) => {
      const next = update(game);
      if (next === game) return { game, past };
      const keep = merge && past.length ? past : [...past.slice(-(UNDO_LIMIT - 1)), { game, label }];
      return { game: next, past: keep };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { label: null, at: 0 };
    setState(({ game, past }) => (past.length ? { game: past[past.length - 1].game, past: past.slice(0, -1) } : { game, past }));
  }, []);

  const updateHand = useCallback((id, label, fn) => commit(label, (g) => {
    const i = g.hands.findIndex((h) => h.id === id);
    if (i < 0) return g;
    const next = fn(g.hands[i]);
    if (next === g.hands[i]) return g;
    const hands = [...g.hands];
    hands[i] = next;
    return { ...g, hands };
  }), [commit]);

  return {
    game: state.game,
    undoLabel: state.past.length ? state.past[state.past.length - 1].label : null,
    undo,
    commit,
    updateHand,
    lastSetup: read(SETUP_KEY),
    start(next) {
      write(SETUP_KEY, { teams: next.teams, target: next.target, rules: next.rules });
      commit('New game', () => next);
    },
    addHand: (hand) => commit('New hand', (g) => ({ ...g, hands: [...g.hands, hand] })),
    /** Replace a hand with an edited copy. */
    saveHand: (hand) => commit('Edit hand', (g) => ({ ...g, hands: g.hands.map((h) => (h.id === hand.id ? hand : h)) })),
    deleteHand: (id) => commit('Delete hand', (g) => ({ ...g, hands: g.hands.filter((h) => h.id !== id) })),
    updateSettings: (rules, target) => commit('Scoring rules', (g) => ({ ...g, rules, target })),
    setRemote: (remote) => commit(remote ? 'Remote player' : 'Stop remote play', (g) => ({ ...g, remote })),
  };
}
