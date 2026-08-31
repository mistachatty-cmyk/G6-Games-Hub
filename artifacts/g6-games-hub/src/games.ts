export type Game = {
  slug: string;
  title: string;
  number: string;
  category: string;
  description: string;
  long: string;
  url: string;
  signal: string;
  accent: string;
};

export const GAMES_DIRECTORY_PATH = '/games';
export const GAME_DETAIL_ROUTE = `${GAMES_DIRECTORY_PATH}/:slug`;

export const games: Game[] = [
  {
    slug: '616-survivor',
    title: '616 Survivor',
    number: '01',
    category: 'Narrative / Atmosphere',
    description: 'The block turned after dark. You have a basement bar, a crew worth saving, and one night at a time.',
    long: 'A story about staying open when the lights go out. Make the call, keep the people close, and see what the neighborhood remembers.',
    url: 'https://survivor-616.vercel.app/',
    signal: 'NIGHT SHIFT',
    accent: 'survivor',
  },
  {
    slug: 'lokbook',
    title: 'LokBook',
    number: '02',
    category: 'Ink / Interface',
    description: 'An ink-and-interface experiment for keeping the strange things somewhere.',
    long: 'A tactile notebook for collecting thoughts, signs, and small discoveries. Nothing here is quite as still as it looks.',
    url: 'https://lok-book.vercel.app/',
    signal: 'FIELD NOTES',
    accent: 'lokbook',
  },
  {
    slug: 'loklingu',
    title: 'LokLingu',
    number: '03',
    category: 'Language / Arcade',
    description: 'A playful language arcade. Collect words. Miss a few. Come back sharper.',
    long: 'Words move fast here. Test your instincts, chase a cleaner streak, and leave with a new phrase stuck in your head.',
    url: 'https://loklingu-eta.vercel.app/',
    signal: 'WORD PLAY',
    accent: 'loklingu',
  },
  {
    slug: 'rune-diary',
    title: 'Rune Diary',
    number: '04',
    category: 'Utility / Companion',
    description: 'A dense, glowing companion for players who prefer their maps annotated.',
    long: 'Track your runs, decode the useful bits, and build a private reference that knows where you have already been.',
    url: 'https://rune-diary.vercel.app/',
    signal: 'PLAYER TOOL',
    accent: 'runes',
  },
  {
    slug: 'kinetic-souls-classic',
    title: 'Kinetic Souls Classic',
    number: '05',
    category: 'Action / Arcade',
    description: 'A kinetic arena built around movement, timing, and the rush of finding your next opening.',
    long: 'Keep moving, read the room, and let momentum do the talking. Kinetic Souls Classic is a compact action signal made for quick runs and repeat visits.',
    url: 'https://kinetic-souls-classic.vercel.app/',
    signal: 'MOTION STUDY',
    accent: 'kinetic',
  },
  {
    slug: 'kinetic-souls-2-alpha',
    title: 'Kinetic Souls 2 Alpha',
    number: '06',
    category: 'Action / Soulslike',
    description: 'A kinetic descent into sharp edges, strange rooms, and the next fight waiting around the corner.',
    long: 'A playable alpha built for momentum. Read the room, trust your timing, and keep moving through a world that wants you to stop.',
    url: 'https://ksouls2.vercel.app/',
    signal: 'ALPHA DESCENT',
    accent: 'kinetic',
  },
];

export function gameDetailPath(slug: string) {
  return `${GAMES_DIRECTORY_PATH}/${slug}`;
}

export function getGameBySlug(slug: string | undefined) {
  return games.find((game) => game.slug === slug);
}

export function getGameForPath(pathname: string) {
  const match = pathname.match(/^\/games\/([^/]+)$/);
  return getGameBySlug(match?.[1]);
}