import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GAME_DETAIL_ROUTE,
  GAMES_DIRECTORY_PATH,
  gameDetailPath,
  games,
  getGameForPath,
} from './games';

const expectedGames = [
  { slug: '616-survivor', title: '616 Survivor', signal: 'NIGHT SHIFT', url: 'https://survivor-616.vercel.app/' },
  { slug: 'lokbook', title: 'LokBook', signal: 'FIELD NOTES', url: 'https://lok-book.vercel.app/' },
  { slug: 'loklingu', title: 'LokLingu', signal: 'WORD PLAY', url: 'https://loklingu-eta.vercel.app/' },
  { slug: 'rune-diary', title: 'Rune Diary', signal: 'PLAYER TOOL', url: 'https://rune-diary.vercel.app/' },
  { slug: 'kinetic-souls-classic', title: 'Kinetic Souls Classic', signal: 'MOTION STUDY', url: 'https://kinetic-souls-classic.vercel.app/' },
  { slug: 'kinetic-souls-2-alpha', title: 'Kinetic Souls 2 Alpha', signal: 'ALPHA DESCENT', url: 'https://ksouls2.vercel.app/' },
  { slug: 'spend-it-all', title: 'Spend It All', signal: 'WEALTH LAB', url: 'https://spend-ut-all.vercel.app/' },
  { slug: 'lok-coding-practice', title: 'Lok Coding Practice', signal: 'CODE LAB', url: 'https://LokCodingPractice.replit.app/' },
] as const;

test('the games directory and detail route are registered', () => {
  assert.equal(GAMES_DIRECTORY_PATH, '/games', 'Games directory route must remain /games');
  assert.equal(GAME_DETAIL_ROUTE, '/games/:slug', 'Game detail route must remain /games/:slug');
  assert.equal(games.length, expectedGames.length, 'Every registered game must have a smoke-test contract');
});

test('every registered game has a working discovery contract', async (t) => {
  for (const expected of expectedGames) {
    await t.test(`${expected.title} is reachable from ${gameDetailPath(expected.slug)}`, () => {
      const game = games.find((entry) => entry.slug === expected.slug);
      assert.ok(game, `Missing game metadata for detail route ${gameDetailPath(expected.slug)}`);
      assert.equal(game.title, expected.title, `${expected.slug} exposes the wrong title`);
      assert.equal(game.signal, expected.signal, `${expected.slug} exposes the wrong signal`);
      assert.equal(game.url, expected.url, `${expected.slug} is missing its expected playable URL`);
      assert.match(game.url, /^https?:\/\/.+/, `${expected.slug} must expose an absolute playable URL`);
      assert.equal(getGameForPath(gameDetailPath(expected.slug)), game, `Detail route ${gameDetailPath(expected.slug)} does not resolve to its game`);
    });
  }
});