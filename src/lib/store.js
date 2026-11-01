// Saves the game on this device (localStorage). Nothing leaves the phone.
import { useEffect, useState } from 'react';

const GAME_KEY = 'spades-game';
const SETUP_KEY = 'spades-last-setup';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or full storage: keep going in memory */ }
}

export function useGame() {
  const [game, setGame] = useState(() => read(GAME_KEY));
  useEffect(() => write(GAME_KEY, game), [game]);

  return {
    game,
    lastSetup: read(SETUP_KEY),
    start(next) {
      write(SETUP_KEY, { teams: next.teams, target: next.target, rules: next.rules });
      setGame(next);
    },
    endGame: () => setGame(null),
    /** Add the hand, or replace it if it's already in the game. */
    saveHand(hand) {
      setGame((g) => {
        const i = g.hands.findIndex((h) => h.id === hand.id);
        const hands = [...g.hands];
        if (i >= 0) hands[i] = hand;
        else hands.push(hand);
        return { ...g, hands };
      });
    },
    deleteHand: (id) => setGame((g) => ({ ...g, hands: g.hands.filter((h) => h.id !== id) })),
    updateSettings: (rules, target) => setGame((g) => ({ ...g, rules, target })),
  };
}
