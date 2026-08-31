import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, ExternalLink, Menu, Plus, Share2, Trash2, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type Game = {
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

type InstallPlatform = 'apple' | 'android';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function detectInstallPlatform(): InstallPlatform {
  return /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent) && ('ontouchend' in document || navigator.maxTouchPoints > 1)
    ? 'apple'
    : 'android';
}

const games: Game[] = [
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
];

function Brand() {
  return <Link href="/" className="brand-lockup"><span className="brand-mark" aria-hidden="true" /><span><span className="brand-text">GSix</span><span className="brand-sub"> / DISCOVER WHAT'S GRAND</span></span></Link>;
}

function Navigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState(false);
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} onClick={() => setOpen(false)}>GSix home</Link>
          <Link href="/games" className={`nav-link ${location.startsWith('/games') ? 'active' : ''}`} onClick={() => setOpen(false)}>GSix games</Link>
          <Link href="/hire" className={`nav-link ${location === '/hire' ? 'active' : ''}`} onClick={() => setOpen(false)}>Build with us</Link>
        </nav>
        <div className="nav-actions">
          <div className="site-switcher">
            <button className="switcher-button" aria-expanded={sites} onClick={() => setSites(!sites)}>Sites <ChevronDown size={13} /></button>
            {sites && <div className="switcher-menu">
              <p>Choose a signal</p>
              <Link href="/" onClick={() => setSites(false)}>GSix Games Hub <span className="text-aqua">● live</span></Link>
              <a href="#future" onClick={() => setSites(false)}>GSix / Chapter 01 <span className="text-dim">soon</span></a>
              <a href="#future" onClick={() => setSites(false)}>Add a site <Plus size={13} style={{ verticalAlign: 'middle' }} /></a>
            </div>}
          </div>
          <Link href="/admin" className="nav-admin">Control room</Link>
          <button className="mobile-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return <footer className="footer"><div className="container-g6 footer-inner"><span>GSIX NETWORK / CHAPTER 0</span><span>DISCOVER WHAT'S GRAND <span className="text-aqua">·</span> LOCAL:200</span></div></footer>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const currentGame = games.find((game) => `/games/${game.slug}` === location);
    document.title = currentGame
      ? `${currentGame.title} — GSix Games`
      : location === '/games'
        ? "GSix Games — Discover What's Grand"
        : location === '/hire'
          ? "Build with GSix — Discover What's Grand"
          : location === '/admin'
            ? "GSix Control Room — Discover What's Grand"
            : "GSix — Discover What's Grand";
  }, [location]);
  return <div className="g6-app"><Navigation />{children}<Footer /></div>;
}

function SignalStrip() {
  return <div className="signal-strip"><span>GSix Games Hub</span> five playable signals <span>◆</span> built for the curious <span>◆</span> share something grand <span>◆</span> chapter 0 / connect local:200</div>;
}

function Home() {
  return <Shell>
    <main>
      <section className="hero container-g6">
        <div className="hero-grid">
          <div>
            <div className="hero-index reveal">Chapter 0 / Connect Local:200</div>
            <h1 className="reveal delay-1">DISCOVER<br /><span>WHAT'S</span><br />GRAND.</h1>
            <p className="hero-copy reveal delay-2">A growing network of games, websites, and useful little obsessions. Enter through the arcade. Leave with a new tab to send your friends.</p>
            <div className="hero-ctas reveal delay-3"><Link href="/games" className="button-primary">Enter the arcade <ArrowUpRight size={15} /></Link><Link href="#network" className="button-secondary">Read the signal</Link></div>
          </div>
          <div className="orbit reveal delay-2" aria-label="GSix Chapter 0">
            <div className="orbit-core"><div className="g6-sculpture">GSIX</div></div>
            <div className="orbit-label"><strong>Chapter 0</strong>connect local:200</div>
          </div>
        </div>
        <div className="scroll-cue"><i /> scroll to explore</div>
      </section>
      <SignalStrip />
      <section className="section container-g6" id="network">
        <div className="section-head"><div><span className="eyebrow">The first signal</span><h2 className="section-title">Start with<br />a story.</h2></div><p className="section-intro">Not a feed. Not a shelf. A selection of places made to be entered, kept open, and passed around.</p></div>
        <div className="featured-game">
          <div className="feature-visual"><span className="feature-kicker">Featured transmission / 01</span><h3>616<br />SURVIVOR</h3><p>The block turned after dark. The lights are on somewhere. Enter the hideout.</p></div>
          <div className="feature-side"><div><div className="meta-row"><span>Genre</span><strong>Atmospheric narrative</strong></div><div className="meta-row"><span>Session</span><strong>10 — 20 minutes</strong></div><div className="meta-row"><span>Status</span><strong className="text-aqua">Playable now</strong></div></div><Link href="/games/616-survivor" className="button-primary">Enter the hideout <ChevronRight size={15} /></Link></div>
        </div>
      </section>
      <section className="manifesto"><h2>Small doors.<br />Big worlds.</h2><p>GSix is a place for experiments with enough polish to become rituals. We make the kind of internet you want to return to.</p></section>
      <section className="section container-g6">
        <div className="section-head"><div><span className="eyebrow">Network map</span><h2 className="section-title">Five ways<br />in.</h2></div><p className="section-intro">Every room has its own weather. Pick the one that sounds like your kind of night.</p></div>
        <div className="network-grid">
          {games.map((game) => <Link href={`/games/${game.slug}`} className={`network-card ${game.accent}`} key={game.slug}><div><span className="card-no">{game.number} / {game.signal}</span><h3>{game.title}</h3><p>{game.description}</p></div><span className="card-arrow">↗</span></Link>)}
        </div>
      </section>
      <section className="container-g6 quote-line"><p>“The best things online still feel like you found them by accident.”</p><small>GSix / internal note 000</small></section>
      <section className="section container-g6" id="future"><div className="section-head"><div><span className="eyebrow">Next transmission</span><h2 className="section-title">More rooms<br />are coming.</h2></div><p className="section-intro">Have a world that needs a door? <Link href="/hire" className="text-aqua">Tell us about it →</Link></p></div></section>
    </main>
  </Shell>;
}

function Games() {
  const [filter, setFilter] = useState('All signals');
  const [search, setSearch] = useState('');
  const filters = ['All signals', 'Narrative', 'Interface', 'Language', 'Utility'];
  const visible = games.filter((g) => (filter === 'All signals' || g.category.toLowerCase().includes(filter.toLowerCase())) && `${g.title} ${g.description}`.toLowerCase().includes(search.toLowerCase()));
  return <Shell><main><section className="page-top container-g6"><span className="eyebrow">GSix Games / Directory</span><h1>CHOOSE<br /><span className="text-aqua">YOUR</span><br />DOOR.</h1><p>Five small worlds, each with a different frequency. Open one. Keep it open.</p></section><section className="container-g6"><div className="directory-toolbar"><div className="filter-row">{filters.map((f) => <button className={`filter-button ${filter === f ? 'active' : ''}`} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div><input className="search-input" type="search" placeholder="Search the network" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="games-list">{visible.map((game) => <GameTile game={game} key={game.slug} />)}</div>{visible.length === 0 && <div className="info-panel" style={{ marginBottom: 100 }}><h3>No signal found.</h3><p>Try a different frequency. The network is small, but it is particular.</p></div>}</section></main></Shell>;
}

function GameTile({ game }: { game: Game }) {
  return <Link href={`/games/${game.slug}`} className={`game-tile ${game.accent}`}><div className="tile-top"><span>{game.number} / {game.signal}</span><span>{game.category.split(' / ')[0]}</span></div><div><h2>{game.title}</h2><p>{game.description}</p></div><div className="tile-bottom"><span className="tile-cta">Open transmission <ArrowUpRight size={14} style={{ verticalAlign: 'middle' }} /></span><span className="text-dim font-mono" style={{ fontSize: 11 }}>g6.games</span></div></Link>;
}

function GameDetail() {
  const params = useParams<{ slug: string }>();
  const game = games.find((item) => item.slug === params.slug);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setIsFocused(document.fullscreenElement === stageRef.current);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstallPrompt(null);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-game-focused', isFocused);
    return () => document.body.classList.remove('is-game-focused');
  }, [isFocused]);

  const toggleFocus = async () => {
    if (document.fullscreenElement === stageRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    if (stageRef.current?.requestFullscreen) {
      try {
        await stageRef.current.requestFullscreen();
        return;
      } catch {
        // Fall back to the fixed focus layout when fullscreen is blocked.
      }
    }
    setIsFocused((current) => !current);
  };

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setShowGuide(true);
  };

  if (!game) return <NotFound />;

  const share = async () => {
    const data = { title: `${game.title} / GSix Games`, text: game.description, url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href);
  };
  return <Shell><main><section className={`detail-hero ${game.accent}`}><div className="container-g6 detail-layout"><div><span className="eyebrow">{game.number} / {game.signal}</span><h1>{game.title.split(' ')[0]}<br /><em>{game.title.split(' ').slice(1).join(' ')}</em></h1><p className="detail-summary">{game.long}</p><div className="hero-ctas"><a href="#launch" className="button-primary">Launch game <ExternalLink size={14} /></a><button className="button-secondary" onClick={share}><Share2 size={14} /> Share this door</button></div></div><div className="detail-meta"><div><span>Type</span><strong>{game.category}</strong></div><div><span>Signal</span><strong className="text-aqua">Online / open</strong></div><div><span>Best with</span><strong>Headphones optional</strong></div></div></div></section><section className="container-g6" id="launch"><div className="ad-slot">Ad placement / top rail / 970 × 90</div><div className="play-tools" aria-label="Game controls"><button className="button-secondary" onClick={toggleFocus}>{isFocused ? 'Exit focus mode' : 'Focus play'} <ExternalLink size={14} /></button><button className="button-secondary" onClick={install}>Add to Home Screen <Plus size={14} /></button><button className="text-button" onClick={() => setShowGuide((current) => !current)} aria-expanded={showGuide}>{showGuide ? 'Hide play notes' : 'Play notes'} <ChevronDown size={13} /></button></div>{showGuide && <div className="play-guide"><div><span className="eyebrow">Quick tutorial</span><h2>Keep the door open.</h2><p>Focus play expands the game without reloading it. When you are done, use the exit control or your browser’s back-to-window gesture.</p></div><div className="install-help"><div className="install-tabs" role="tablist" aria-label="Home screen instructions"><button className={installPlatform === 'apple' ? 'active' : ''} onClick={() => setInstallPlatform('apple')} role="tab" aria-selected={installPlatform === 'apple'}>iPhone / iPad</button><button className={installPlatform === 'android' ? 'active' : ''} onClick={() => setInstallPlatform('android')} role="tab" aria-selected={installPlatform === 'android'}>Android</button></div>{installPlatform === 'apple' ? <p><strong>1.</strong> Tap Share in Safari. <strong>2.</strong> Choose <em>Add to Home Screen</em>. <strong>3.</strong> Tap Add, then open GSix from the new icon.</p> : <p><strong>1.</strong> Open your browser menu. <strong>2.</strong> Choose <em>Install app</em> or <em>Add to Home screen</em>. <strong>3.</strong> Confirm, then return here from the GSix icon.</p>}</div></div>}<div ref={stageRef} className={`launch-stage ${isFocused ? 'focused' : ''}`}><div className="launch-header"><span><i className="live-dot" /> {game.title} / live transmission</span><div className="launch-actions"><button className="stage-control" onClick={toggleFocus}>{isFocused ? 'Exit focus' : 'Focus play'} <ExternalLink size={12} /></button><a href={game.url} target="_blank" rel="noreferrer" className="text-aqua">Open in new tab <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a></div></div><iframe className="game-frame" src={game.url} title={`${game.title} playable game`} allow="fullscreen; autoplay; gamepad" /></div><div className="detail-lower"><div className="info-panel"><h3>Before you enter</h3><p>Give it a minute. These are short-form worlds built around atmosphere, surprise, and a little patience.</p></div><div className="info-panel"><h3>Keep the signal alive</h3><p>Found something worth sharing? Send this door to somebody who likes finding the good stuff first.</p></div></div></section></main></Shell>;
}

function Hire() {
  const [sent, setSent] = useState(false);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inquiry = Object.fromEntries(form.entries());
    localStorage.setItem('g6-last-inquiry', JSON.stringify({ ...inquiry, at: new Date().toISOString() }));
    setSent(true);
  };
  return <Shell><main className="form-shell container-g6"><div className="form-grid"><aside><span className="eyebrow">GSix Studio / Open brief</span><h1>MAKE A<br /><span className="text-aqua">DOOR.</span></h1><p className="aside-copy">We build websites with a point of view: memorable, useful, and a little hard to explain at first.</p><p className="aside-copy text-amber" style={{ marginTop: 28 }}>No decks required.<br />Tell us what you are trying to make.</p></aside><div>{sent ? <div className="success-block"><span className="eyebrow">Transmission received</span><h2>We found your note.</h2><p className="text-dim">Someone from the studio will open it soon. Until then, keep exploring.</p><Link className="button-secondary" href="/games" style={{ marginTop: 18 }}>Return to the arcade</Link></div> : <form className="project-form" onSubmit={submit}><div className="field"><label htmlFor="name">01 / Your name</label><input id="name" name="name" required placeholder="What should we call you?" /></div><div className="field"><label htmlFor="email">02 / Contact frequency</label><input id="email" name="email" type="email" required placeholder="you@somewhere.good" /></div><div className="field"><label htmlFor="project">03 / What are we making?</label><select id="project" name="project" defaultValue="A website with a pulse"><option>A website with a pulse</option><option>A game or playable experiment</option><option>A new room for the GSix network</option><option>Something difficult to categorize</option></select></div><div className="field"><label htmlFor="brief">04 / The transmission</label><textarea id="brief" name="brief" required placeholder="A few lines about the idea, the feeling, and what should happen next." /></div><div className="form-submit"><span className="form-note">We usually reply within 2–3 working days.</span><button className="button-primary" type="submit">Send the brief <ArrowUpRight size={15} /></button></div></form>}</div></div></main></Shell>;
}

type Track = { id: number; title: string; artist: string; url: string };
const starterTracks: Track[] = [{ id: 1, title: 'After the lights', artist: 'GSix / field recording', url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_9465c2c9c2.mp3' }, { id: 2, title: 'Local:200', artist: 'GSix / chapter zero', url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a734c7.mp3' }];

function Admin() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('g6-admin-unlocked') === 'yes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tracks, setTracks] = useState<Track[]>(() => { try { return JSON.parse(localStorage.getItem('g6-tracks') || 'null') || starterTracks; } catch { return starterTracks; } });
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', url: '' });
  useEffect(() => { localStorage.setItem('g6-tracks', JSON.stringify(tracks)); }, [tracks]);
  const unlock = (event: React.FormEvent) => { event.preventDefault(); if (pin === '14141414') { setUnlocked(true); localStorage.setItem('g6-admin-unlocked', 'yes'); } else setError('That code did not open the room.'); };
  const addTrack = (event: React.FormEvent) => { event.preventDefault(); if (!newTrack.title || !newTrack.url) return; setTracks([...tracks, { ...newTrack, id: Date.now() }]); setNewTrack({ title: '', artist: '', url: '' }); };
  if (!unlocked) return <Shell><main className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room</span><h1>PRIVATE<br />SIGNAL.</h1></div><span className="text-dim font-mono" style={{ fontSize: 10 }}>ACCESS REQUIRED</span></div><form className="pin-card" onSubmit={unlock}><div className="brand-mark" style={{ margin: '0 auto' }} /><h2>Identify yourself.</h2><p className="locked-note">This room manages the soundtrack carried through the network.</p><input className="pin-input" type="password" inputMode="numeric" maxLength={8} placeholder="••••••••" aria-label="Control room PIN" value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }} /><div className="pin-error">{error}</div><button className="button-primary" style={{ width: '100%' }} type="submit">Unlock room <ChevronRight size={15} /></button></form></main></Shell>;
  return <Shell><main className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room / authenticated</span><h1>SOUNDTRACK<br /><span className="text-aqua">MANAGEMENT.</span></h1></div><button className="button-secondary" onClick={() => { setUnlocked(false); localStorage.removeItem('g6-admin-unlocked'); }}>Lock room</button></div><div className="admin-panel"><form className="admin-box" onSubmit={addTrack}><h2>Add a track.</h2><p className="locked-note">Tracks persist in this browser and can be used by the next transmission.</p><div className="field"><label htmlFor="track-title">Title</label><input id="track-title" required value={newTrack.title} onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })} placeholder="Track title" /></div><div className="field"><label htmlFor="track-artist">Artist / source</label><input id="track-artist" value={newTrack.artist} onChange={(e) => setNewTrack({ ...newTrack, artist: e.target.value })} placeholder="Who made the noise?" /></div><div className="field"><label htmlFor="track-url">Audio URL</label><input id="track-url" type="url" required value={newTrack.url} onChange={(e) => setNewTrack({ ...newTrack, url: e.target.value })} placeholder="https://..." /></div><button className="button-primary" type="submit"><Plus size={15} /> Add to rotation</button></form><section className="admin-box"><h2>Current rotation <span className="text-aqua" style={{ font: '11px var(--app-font-mono)' }}>/{tracks.length}</span></h2><div className="track-list">{tracks.map((track) => <div className="track-row" key={track.id}><div><strong>{track.title}</strong><small>{track.artist || 'Uncredited'} / {track.url}</small></div><button className="delete-btn" aria-label={`Remove ${track.title}`} onClick={() => setTracks(tracks.filter((item) => item.id !== track.id))}><Trash2 size={15} /> remove</button></div>)}</div></section></div></main></Shell>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/games" component={Games} /><Route path="/games/:slug" component={GameDetail} /><Route path="/hire" component={Hire} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;