import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, ExternalLink, Flag, Lock, Menu, Pin, Plus, Save, Share2, Trash2, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetForumThreadDetailQueryKey, getGetGameFeedbackQueryKey, getGetGameSocialStatsQueryKey, getGetLeaderboardQueryKey, getGetMemberRolesQueryKey, getGetMyMemberProfileQueryKey, getListForumModerationReportsQueryKey, useCreateForumReply, useCreateForumReport, useCreateForumThread, useDeleteForumReply, useDeleteForumThread, useGetAuthProviders, useGetForumCategories, useGetForumThreadDetail, useGetGameFeedback, useGetGameSocialStats, useGetLeaderboard, useGetLeaderboardDiagnostics, useGetMemberBadges, useGetMemberRoles, useGetMyMemberProfile, useListForumCategoryThreads, useListForumModerationReports, useModerateForumThread, useRecordLeaderboardActivity, useResolveForumReport, useReviewGameFeedback, useSubmitGameFeedback, useToggleGameStar, useUpdateForumReply, useUpdateForumThread, useUpdateMemberRole, useUpdateMyMemberProfile, type AuthProvider, type ForumReply, type ForumThread, type GameSocialStats, type MemberProfileInput, type MemberRoleInputRole } from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { GAME_DETAIL_ROUTE, GAMES_DIRECTORY_PATH, gameDetailPath, games, getGameBySlug, getGameForPath, type Game } from '@/games';

const queryClient = new QueryClient();
type InstallPlatform = 'apple' | 'android';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

function detectInstallPlatform(): InstallPlatform {
  return /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent) && ('ontouchend' in document || navigator.maxTouchPoints > 1)
    ? 'apple'
    : 'android';
}

const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const adsenseSlots = {
  top: import.meta.env.VITE_ADSENSE_SLOT_TOP as string | undefined,
  rail: import.meta.env.VITE_ADSENSE_SLOT_RAIL as string | undefined,
  bottom: import.meta.env.VITE_ADSENSE_SLOT_BOTTOM as string | undefined,
};

const VOTER_ID_KEY = 'g6-voter-id';

function getVoterId() {
  const existing = localStorage.getItem(VOTER_ID_KEY);
  if (existing) return existing;
  const generated = globalThis.crypto?.randomUUID?.() ?? `g6-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(VOTER_ID_KEY, generated);
  return generated;
}

function useGameSocial() {
  const [voterId] = useState(getVoterId);
  const statsQuery = useGetGameSocialStats({ voterId });
  const starMutation = useToggleGameStar({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGameSocialStatsQueryKey({ voterId }) }),
    },
  });
  return {
    ...statsQuery,
    voterId,
    starMutation,
    getStat: (slug: string) => statsQuery.data?.find((item) => item.gameSlug === slug),
    toggleStar: (slug: string, starred: boolean) => starMutation.mutate({ slug, data: { voterId, starred } }),
  };
}

function StarButton({ stat, onToggle, pending = false }: { stat?: GameSocialStats; onToggle: () => void; pending?: boolean }) {
  return <button
    type="button"
    className={`star-button ${stat?.starred ? 'starred' : ''}`}
    aria-label={stat?.starred ? 'Remove your star' : 'Star this game'}
    aria-pressed={stat?.starred ?? false}
    disabled={pending}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}
  >
    <span aria-hidden="true">★</span>
    <span>{stat ? stat.starCount : '—'}</span>
  </button>;
}

function AdSlot({ label, slot, className = '' }: { label: string; slot?: string; className?: string }) {
  const live = Boolean(adsenseClient && slot);

  useEffect(() => {
    if (!live) return;
    const pushAd = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // AdSense can reject a slot while it is still being reviewed.
      }
    };
    let script = document.querySelector<HTMLScriptElement>('#adsense-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'adsense-script';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`;
      script.addEventListener('load', pushAd, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', pushAd, { once: true });
      if (window.adsbygoogle) pushAd();
    }
    return () => script?.removeEventListener('load', pushAd);
  }, [live, slot]);

  return <div className={`ad-slot ${live ? 'ad-slot-live' : 'ad-slot-placeholder'} ${className}`} aria-label={`Advertisement ${label}`}>
    {live ? <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client={adsenseClient} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" /> : <><span>AdSense / {label}</span><small>Connect publisher and slot IDs to serve ads</small></>}
  </div>;
}

function Brand() {
  return <Link href="/" className="brand-lockup"><span className="brand-mark" aria-hidden="true" /><span><span className="brand-text">GSix</span><span className="brand-sub"> / DISCOVER WHAT'S GRAND</span></span></Link>;
}

function Navigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState(false);
  const auth = useAuth();
  const navRef = useRef<HTMLElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sites) setSites(false);
      if (open) closeMenu(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sites && !switcherRef.current?.contains(target)) setSites(false);
      if (open && !navRef.current?.contains(target)) closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, sites]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => firstNavLinkRef.current?.focus());
  }, [open]);

  return (
    <header className="site-nav" ref={navRef}>
      <div className="nav-inner">
        <Brand />
        <nav id="primary-navigation" className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          <Link ref={firstNavLinkRef} href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} aria-current={location === '/' ? 'page' : undefined} onClick={() => closeMenu()}>GSix home</Link>
          <Link href="/games" className={`nav-link ${location.startsWith('/games') ? 'active' : ''}`} aria-current={location.startsWith('/games') ? 'page' : undefined} onClick={() => closeMenu()}>GSix games</Link>
           <Link href="/forum" className={`nav-link ${location.startsWith('/forum') ? 'active' : ''}`} aria-current={location.startsWith('/forum') ? 'page' : undefined} onClick={() => closeMenu()}>Community forum</Link>
           <Link href="/leaderboard" className={`nav-link ${location.startsWith('/leaderboard') ? 'active' : ''}`} aria-current={location.startsWith('/leaderboard') ? 'page' : undefined} onClick={() => closeMenu()}>Leaderboard</Link>
          <Link href="/hire" className={`nav-link ${location === '/hire' ? 'active' : ''}`} aria-current={location === '/hire' ? 'page' : undefined} onClick={() => closeMenu()}>Build with us</Link>
          <Link href="/profile" className={`nav-link ${location === '/profile' ? 'active' : ''}`} aria-current={location === '/profile' ? 'page' : undefined} onClick={() => closeMenu()}>{auth.isAuthenticated ? 'Member profile' : 'Join G6'}</Link>
        </nav>
        <div className="nav-actions">
          <div className="site-switcher" ref={switcherRef}>
            <button type="button" className="switcher-button" aria-expanded={sites} aria-controls="site-switcher-menu" onClick={() => setSites(!sites)}>Sites <ChevronDown size={13} aria-hidden="true" /></button>
            {sites && <div id="site-switcher-menu" className="switcher-menu" aria-label="GSix sites">
              <p>Choose a signal</p>
              <Link href="/" onClick={() => setSites(false)}>GSix Games Hub <span className="text-aqua">● live</span></Link>
              <a href="#future" onClick={() => setSites(false)}>GSix / Chapter 01 <span className="text-dim">soon</span></a>
              <a href="#future" onClick={() => setSites(false)}>Add a site <Plus size={13} style={{ verticalAlign: 'middle' }} /></a>
            </div>}
          </div>
          <Link href="/admin" className="nav-admin">Control room</Link>
          <button ref={menuButtonRef} type="button" className="mobile-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="primary-navigation" onClick={() => open ? closeMenu() : setOpen(true)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
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
    const currentGame = getGameForPath(location);
    document.title = currentGame
      ? `${currentGame.title} — GSix Games`
        : location === GAMES_DIRECTORY_PATH
        ? "GSix Games — Discover What's Grand"
        : location === '/hire'
          ? "Build with GSix — Discover What's Grand"
          : location === '/admin'
            ? "GSix Control Room — Discover What's Grand"
            : location === '/forum' || location.startsWith('/forum/')
              ? "GSix Community Forum — Discover What's Grand"
            : location === '/leaderboard'
              ? "GSix Community Leaderboard — Discover What's Grand"
            : location === '/profile'
              ? "GSix Member Profile — Discover What's Grand"
            : "GSix — Discover What's Grand";
  }, [location]);
  return <div className="g6-app"><a className="skip-link" href="#main-content">Skip to main content</a><Navigation />{children}<Footer /></div>;
}

function SignalStrip() {
  return <div className="signal-strip"><span>GSix Games Hub</span> {games.length} playable signals <span>◆</span> built for the curious <span>◆</span> share something grand <span>◆</span> chapter 0 / connect local:200</div>;
}

function Home() {
  return <Shell>
    <main id="main-content">
      <section className="hero container-g6">
        <div className="hero-grid">
          <div>
            <div className="hero-index reveal">Chapter 0 / Connect Local:200</div>
            <h1 className="reveal delay-1">DISCOVER<br /><span>WHAT'S</span><br />GRAND.</h1>
            <p className="hero-copy reveal delay-2">A growing network of games, websites, and useful little obsessions. Enter through the arcade. Leave with a new tab to send your friends.</p>
            <div className="hero-ctas reveal delay-3"><Link href={GAMES_DIRECTORY_PATH} className="button-primary">Enter the arcade <ArrowUpRight size={15} /></Link><Link href="#network" className="button-secondary">Read the signal</Link></div>
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
          <div className="feature-side"><div><div className="meta-row"><span>Genre</span><strong>Atmospheric narrative</strong></div><div className="meta-row"><span>Session</span><strong>10 — 20 minutes</strong></div><div className="meta-row"><span>Status</span><strong className="text-aqua">Playable now</strong></div></div><Link href={gameDetailPath('616-survivor')} className="button-primary">Enter the hideout <ChevronRight size={15} /></Link></div>
        </div>
      </section>
      <section className="manifesto"><h2>Small doors.<br />Big worlds.</h2><p>GSix is a place for experiments with enough polish to become rituals. We make the kind of internet you want to return to.</p></section>
      <section className="section container-g6">
        <div className="section-head"><div><span className="eyebrow">Network map</span><h2 className="section-title">{games.length} ways<br />in.</h2></div><p className="section-intro">Every room has its own weather. Pick the one that sounds like your kind of night.</p></div>
        <div className="network-grid">
          {games.map((game) => <Link href={gameDetailPath(game.slug)} className={`network-card ${game.accent}`} key={game.slug}><div><span className="card-no">{game.number} / {game.signal}</span><h3>{game.title}</h3><p>{game.description}</p></div><span className="card-arrow">↗</span></Link>)}
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
  const filters = ['All signals', 'Narrative', 'Interface', 'Language', 'Utility', 'Action', 'Economy', 'Learning'];
  const visible = games.filter((g) => (filter === 'All signals' || g.category.toLowerCase().includes(filter.toLowerCase())) && `${g.title} ${g.description}`.toLowerCase().includes(search.toLowerCase()));
  const social = useGameSocial();
  return <Shell><main id="main-content"><section className="page-top container-g6"><span className="eyebrow">GSix Games / Directory</span><h1>CHOOSE<br /><span className="text-aqua">YOUR</span><br />DOOR.</h1><p>{games.length} small worlds, each with a different frequency. Open one. Keep it open.</p></section><section className="container-g6"><div className="directory-toolbar"><div className="filter-row">{filters.map((f) => <button type="button" className={`filter-button ${filter === f ? 'active' : ''}`} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div><input className="search-input" type="search" placeholder="Search the network" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search games" /></div>{social.isError && <p className="social-status error" role="status">Community signals are offline. You can still enter every door.</p>}<div className="games-list">{visible.map((game) => <GameTile game={game} stat={social.getStat(game.slug)} pending={social.starMutation.isPending} onToggle={() => social.toggleStar(game.slug, !social.getStat(game.slug)?.starred)} key={game.slug} />)}</div>{visible.length === 0 && <div className="info-panel" style={{ marginBottom: 100 }}><h3>No signal found.</h3><p>Try a different frequency. The network is small, but it is particular.</p></div>}</section></main></Shell>;
}

function GameTile({ game, stat, onToggle, pending }: { game: Game; stat?: GameSocialStats; onToggle: () => void; pending: boolean }) {
  return <article className={`game-tile ${game.accent}`}><Link href={gameDetailPath(game.slug)} className="tile-link" aria-label={`Open ${game.title}`}><div className="tile-top"><span>{game.number} / {game.signal}</span><span>{game.category.split(' / ')[0]}</span></div><div><h2>{game.title}</h2><p>{game.description}</p></div></Link><div className="tile-bottom"><Link href={gameDetailPath(game.slug)} className="tile-cta">Open transmission <ArrowUpRight size={14} aria-hidden="true" /></Link><span className="tile-actions"><StarButton stat={stat} onToggle={onToggle} pending={pending} /><span className="text-dim font-mono" style={{ fontSize: 11 }}>g6.games</span></span></div></article>;
}

function GameHero({ game, onShare, stat, onToggleStar, pending }: { game: Game; onShare: () => void; stat?: GameSocialStats; onToggleStar: () => void; pending: boolean }) {
  return <section className={`detail-hero ${game.accent}`}><div className="container-g6 detail-layout"><div><span className="eyebrow">{game.number} / {game.signal}</span><h1>{game.title.split(' ')[0]}<br /><em>{game.title.split(' ').slice(1).join(' ')}</em></h1><p className="detail-summary">{game.long}</p><div className="hero-ctas"><a href="#launch" className="button-primary">Launch game <ExternalLink size={14} /></a><button className="button-secondary" onClick={onShare}><Share2 size={14} /> Share this door</button><StarButton stat={stat} onToggle={onToggleStar} pending={pending} /></div><p className="social-caption">One star per browser. Feedback stays private.</p></div><div className="detail-meta"><div><span>Type</span><strong>{game.category}</strong></div><div><span>Signal</span><strong className="text-aqua">Online / open</strong></div><div><span>Best with</span><strong>Headphones optional</strong></div></div></div></section>;
}

function GameAdLayout({ game, stageRef, isFocused, toggleFocus, install, showGuide, setShowGuide, installPlatform, setInstallPlatform }: {
  game: Game;
  stageRef: React.RefObject<HTMLDivElement | null>;
  isFocused: boolean;
  toggleFocus: () => void;
  install: () => void;
  showGuide: boolean;
  setShowGuide: React.Dispatch<React.SetStateAction<boolean>>;
  installPlatform: InstallPlatform;
  setInstallPlatform: React.Dispatch<React.SetStateAction<InstallPlatform>>;
}) {
  return (
    <section className="container-g6" id="launch">
      <AdSlot label="top rail" slot={adsenseSlots.top} className="top-ad-slot" />
      <div className="game-play-layout">
        <aside className="ad-rail" aria-label="Sidebar advertisement">
          <AdSlot label="desktop rail" slot={adsenseSlots.rail} className="rail-ad" />
        </aside>
        <div className="game-play-column">
          <div className="play-tools" aria-label="Game controls">
            <button className="button-secondary" onClick={toggleFocus}>{isFocused ? 'Exit focus mode' : 'Focus play'} <ExternalLink size={14} /></button>
            <button className="button-secondary" onClick={install}>Add to Home Screen <Plus size={14} /></button>
            <button className="text-button" onClick={() => setShowGuide((current) => !current)} aria-expanded={showGuide}>{showGuide ? 'Hide play notes' : 'Play notes'} <ChevronDown size={13} /></button>
          </div>
          {showGuide && <div className="play-guide">
            <div>
              <span className="eyebrow">Quick tutorial</span>
              <h2>Keep the door open.</h2>
              <p>Focus play expands the game without reloading it. When you are done, use the exit control or your browser’s back-to-window gesture.</p>
            </div>
            <div className="install-help">
              <div className="install-tabs" role="tablist" aria-label="Home screen instructions">
                <button className={installPlatform === 'apple' ? 'active' : ''} onClick={() => setInstallPlatform('apple')} role="tab" aria-selected={installPlatform === 'apple'}>iPhone / iPad</button>
                <button className={installPlatform === 'android' ? 'active' : ''} onClick={() => setInstallPlatform('android')} role="tab" aria-selected={installPlatform === 'android'}>Android</button>
              </div>
              {installPlatform === 'apple'
                ? <p><strong>1.</strong> Tap Share in Safari. <strong>2.</strong> Choose <em>Add to Home Screen</em>. <strong>3.</strong> Tap Add, then open GSix from the new icon.</p>
                : <p><strong>1.</strong> Open your browser menu. <strong>2.</strong> Choose <em>Install app</em> or <em>Add to Home screen</em>. <strong>3.</strong> Confirm, then return here from the GSix icon.</p>}
            </div>
          </div>}
          <div ref={stageRef} className={`launch-stage ${isFocused ? 'focused' : ''}`}>
            <div className="launch-header">
              <span><i className="live-dot" /> {game.title} / live transmission</span>
              <div className="launch-actions">
                <button className="stage-control" onClick={toggleFocus}>{isFocused ? 'Exit focus' : 'Focus play'} <ExternalLink size={12} /></button>
                <a href={game.url} target="_blank" rel="noreferrer" className="text-aqua">Open in new tab <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a>
              </div>
            </div>
            <iframe className="game-frame" src={game.url} title={`${game.title} playable game`} allow="fullscreen; autoplay; gamepad" />
          </div>
          <AdSlot label="below game" slot={adsenseSlots.bottom} className="bottom-ad-slot" />
        </div>
      </div>
      <div className="detail-lower">
        <div className="info-panel"><h3>Before you enter</h3><p>Give it a minute. These are short-form worlds built around atmosphere, surprise, and a little patience.</p></div>
        <div className="info-panel"><h3>Keep the signal alive</h3><p>Found something worth sharing? Send this door to somebody who likes finding the good stuff first.</p></div>
      </div>
    </section>
  );
}

function GameDetail() {
  const params = useParams<{ slug: string }>();
  const game = getGameBySlug(params.slug);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [showGuide, setShowGuide] = useState(false);
  const social = useGameSocial();

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
  return <Shell><main id="main-content"><GameHero game={game} onShare={share} stat={social.getStat(game.slug)} onToggleStar={() => social.toggleStar(game.slug, !social.getStat(game.slug)?.starred)} pending={social.starMutation.isPending} /><GameAdLayout game={game} stageRef={stageRef} isFocused={isFocused} toggleFocus={toggleFocus} install={install} showGuide={showGuide} setShowGuide={setShowGuide} installPlatform={installPlatform} setInstallPlatform={setInstallPlatform} /><FeedbackPanel game={game} /></main></Shell>;
  /*
  return <Shell><main><section className={`detail-hero ${game.accent}`}><div className="container-g6 detail-layout"><div><span className="eyebrow">{game.number} / {game.signal}</span><h1>{game.title.split(' ')[0]}<br /><em>{game.title.split(' ').slice(1).join(' ')}</em></h1><p className="detail-summary">{game.long}</p><div className="hero-ctas"><a href="#launch" className="button-primary">Launch game <ExternalLink size={14} /></a><button className="button-secondary" onClick={share}><Share2 size={14} /> Share this door</button></div></div><div className="detail-meta"><div><span>Type</span><strong>{game.category}</strong></div><div><span>Signal</span><strong className="text-aqua">Online / open</strong></div><div><span>Best with</span><strong>Headphones optional</strong></div></div></div></section><section className="container-g6" id="launch"><div className="ad-slot">Ad placement / top rail / 970 × 90</div><div className="play-tools" aria-label="Game controls"><button className="button-secondary" onClick={toggleFocus}>{isFocused ? 'Exit focus mode' : 'Focus play'} <ExternalLink size={14} /></button><button className="button-secondary" onClick={install}>Add to Home Screen <Plus size={14} /></button><button className="text-button" onClick={() => setShowGuide((current) => !current)} aria-expanded={showGuide}>{showGuide ? 'Hide play notes' : 'Play notes'} <ChevronDown size={13} /></button></div>{showGuide && <div className="play-guide"><div><span className="eyebrow">Quick tutorial</span><h2>Keep the door open.</h2><p>Focus play expands the game without reloading it. When you are done, use the exit control or your browser’s back-to-window gesture.</p></div><div className="install-help"><div className="install-tabs" role="tablist" aria-label="Home screen instructions"><button className={installPlatform === 'apple' ? 'active' : ''} onClick={() => setInstallPlatform('apple')} role="tab" aria-selected={installPlatform === 'apple'}>iPhone / iPad</button><button className={installPlatform === 'android' ? 'active' : ''} onClick={() => setInstallPlatform('android')} role="tab" aria-selected={installPlatform === 'android'}>Android</button></div>{installPlatform === 'apple' ? <p><strong>1.</strong> Tap Share in Safari. <strong>2.</strong> Choose <em>Add to Home Screen</em>. <strong>3.</strong> Tap Add, then open GSix from the new icon.</p> : <p><strong>1.</strong> Open your browser menu. <strong>2.</strong> Choose <em>Install app</em> or <em>Add to Home screen</em>. <strong>3.</strong> Confirm, then return here from the GSix icon.</p>}</div></div>}<div ref={stageRef} className={`launch-stage ${isFocused ? 'focused' : ''}`}><div className="launch-header"><span><i className="live-dot" /> {game.title} / live transmission</span><div className="launch-actions"><button className="stage-control" onClick={toggleFocus}>{isFocused ? 'Exit focus' : 'Focus play'} <ExternalLink size={12} /></button><a href={game.url} target="_blank" rel="noreferrer" className="text-aqua">Open in new tab <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a></div></div><iframe className="game-frame" src={game.url} title={`${game.title} playable game`} allow="fullscreen; autoplay; gamepad" /></div><div className="detail-lower"><div className="info-panel"><h3>Before you enter</h3><p>Give it a minute. These are short-form worlds built around atmosphere, surprise, and a little patience.</p></div><div className="info-panel"><h3>Keep the signal alive</h3><p>Found something worth sharing? Send this door to somebody who likes finding the good stuff first.</p></div></div></section></main></Shell>;
*/
}

function FeedbackPanel({ game }: { game: Game }) {
  const auth = useAuth();
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const feedback = useSubmitGameFeedback();
  const errorMessage = feedback.error instanceof Error ? feedback.error.message : 'The note could not be sent. Try again.';

  if (auth.isLoading) {
    return <section className="container-g6 feedback-section"><div className="feedback-panel"><span className="eyebrow">Private channel</span><p className="social-status">Checking access to the feedback channel…</p></div></section>;
  }

  if (!auth.isAuthenticated) {
    return <section className="container-g6 feedback-section"><div className="feedback-panel"><div><span className="eyebrow">Private channel</span><h2>Leave a note for GSix.</h2><p>Tell us what landed, what broke, or what you want to see next. Notes are attached to your account and only visible to the GSix team.</p></div><button className="button-secondary" onClick={() => auth.login()}>Sign in to send feedback <ArrowUpRight size={14} /></button></div></section>;
  }

  if (sent) {
    return <section className="container-g6 feedback-section"><div className="feedback-panel success"><div><span className="eyebrow">Transmission received</span><h2>Your note is in the queue.</h2><p>Thanks for helping us tune the signal. This feedback is private to the GSix team.</p></div><button className="text-button" onClick={() => { setSent(false); setContent(''); }}>Send another note</button></div></section>;
  }

  return <section className="container-g6 feedback-section"><div className="feedback-panel"><div><span className="eyebrow">Private channel / signed in</span><h2>Leave a note for GSix.</h2><p>Share a reaction to {game.title}. Your note will go to the owner review queue, not a public comment feed.</p></div><form className="feedback-form" onSubmit={(event) => { event.preventDefault(); feedback.mutate({ slug: game.slug, data: { content: content.trim() } }, { onSuccess: () => setSent(true) }); }}><textarea value={content} onChange={(event) => setContent(event.target.value)} minLength={4} maxLength={2000} required placeholder="What did you notice?" aria-label="Private feedback" /><div className="feedback-submit"><span>{content.length} / 2000</span><button className="button-primary" disabled={feedback.isPending}>{feedback.isPending ? 'Sending…' : 'Send private note'} <ArrowUpRight size={14} /></button></div>{feedback.isError && <p className="social-status error" role="alert">{errorMessage}</p>}</form></div></section>;
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
  return <Shell><main id="main-content" className="form-shell container-g6"><div className="form-grid"><aside><span className="eyebrow">GSix Studio / Open brief</span><h1>MAKE A<br /><span className="text-aqua">DOOR.</span></h1><p className="aside-copy">We build websites with a point of view: memorable, useful, and a little hard to explain at first.</p><p className="aside-copy text-amber" style={{ marginTop: 28 }}>No decks required.<br />Tell us what you are trying to make.</p></aside><div>{sent ? <div className="success-block"><span className="eyebrow">Transmission received</span><h2>We found your note.</h2><p className="text-dim">Someone from the studio will open it soon. Until then, keep exploring.</p><Link className="button-secondary" href="/games" style={{ marginTop: 18 }}>Return to the arcade</Link></div> : <form className="project-form" onSubmit={submit}><div className="field"><label htmlFor="name">01 / Your name</label><input id="name" name="name" required placeholder="What should we call you?" /></div><div className="field"><label htmlFor="email">02 / Contact frequency</label><input id="email" name="email" type="email" required placeholder="you@somewhere.good" /></div><div className="field"><label htmlFor="project">03 / What are we making?</label><select id="project" name="project" defaultValue="A website with a pulse"><option>A website with a pulse</option><option>A game or playable experiment</option><option>A new room for the GSix network</option><option>Something difficult to categorize</option></select></div><div className="field"><label htmlFor="brief">04 / The transmission</label><textarea id="brief" name="brief" required placeholder="A few lines about the idea, the feeling, and what should happen next." /></div><div className="form-submit"><span className="form-note">We usually reply within 2–3 working days.</span><button className="button-primary" type="submit">Send the brief <ArrowUpRight size={15} /></button></div></form>}</div></div></main></Shell>;
}

function ProviderButtons({ providers, auth }: { providers: { id: AuthProvider; label: string; enabled: boolean }[]; auth: ReturnType<typeof useAuth> }) {
  return <div className="provider-list">
    {providers.filter((provider) => provider.enabled).map((provider) => <button className="button-secondary provider-button" type="button" key={provider.id} onClick={() => auth.login(provider.id)}><span className={`provider-dot provider-${provider.id}`} aria-hidden="true" /> Continue with {provider.label} <ArrowUpRight size={14} /></button>)}
    {providers.every((provider) => !provider.enabled) && <p className="social-status error">No sign-in provider is configured yet.</p>}
  </div>;
}

function Profile() {
  const auth = useAuth();
  const providers = useGetAuthProviders();
  const profile = useGetMyMemberProfile({ query: { enabled: auth.isAuthenticated, queryKey: getGetMyMemberProfileQueryKey() } });
  const badges = useGetMemberBadges();
  const update = useUpdateMyMemberProfile({
    mutation: {
      onSuccess: () => {
        setSaved(true);
        queryClient.invalidateQueries({ queryKey: getGetMyMemberProfileQueryKey() });
      },
    },
  });
  const [displayName, setDisplayName] = useState('');
  const [badgeSlug, setBadgeSlug] = useState<NonNullable<MemberProfileInput['badgeSlug']>>('lok-clone');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.displayName);
    setBadgeSlug(profile.data.badge.slug as NonNullable<MemberProfileInput['badgeSlug']>);
  }, [profile.data]);

  const providerOptions = providers.data?.providers ?? [
    { id: 'replit' as AuthProvider, label: 'GSix account', enabled: true },
  ];

  if (auth.isLoading) return <Shell><main id="main-content" className="profile-shell container-g6"><div className="profile-loading"><span className="eyebrow">Member signal</span><span className="skeleton-line" /><span className="skeleton-line short" /></div></main></Shell>;

  if (!auth.isAuthenticated) return <Shell><main id="main-content" className="profile-shell container-g6"><div className="profile-heading"><span className="eyebrow">GSix / Member signal</span><h1>FIND YOUR<br /><span className="text-aqua">FREQUENCY.</span></h1><p>Keep your identity across the network, choose your badge, and make your signal recognizable when the community rooms open.</p></div><section className="auth-state-card profile-auth-card"><div className="brand-mark" style={{ margin: '0 auto' }} /><span className="eyebrow">Member channel</span><h2>Join the network.</h2><p className="locked-note">Your private account details stay server-side. Public community surfaces only show the display name and badge you choose.</p><ProviderButtons providers={providerOptions} auth={auth} /></section></main></Shell>;

  if (profile.isLoading) return <Shell><main id="main-content" className="profile-shell container-g6"><div className="profile-heading"><span className="eyebrow">Member signal / signed in</span><h1>LOADING<br /><span className="text-aqua">PROFILE.</span></h1></div><div className="profile-loading"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line short" /></div></main></Shell>;

  if (profile.isError || !profile.data) return <Shell><main id="main-content" className="profile-shell container-g6"><div className="auth-state-card denied"><span className="eyebrow">Member channel</span><h2>The profile signal is quiet.</h2><p className="locked-note">We could not load your member profile. Refresh the page and try again.</p><button className="button-secondary" type="button" onClick={() => profile.refetch()}>Retry connection <ChevronRight size={14} /></button></div></main></Shell>;

  return <Shell><main id="main-content" className="profile-shell container-g6">
    <div className="profile-heading"><div><span className="eyebrow">GSix / Member signal</span><h1>YOUR<br /><span className="text-aqua">FREQUENCY.</span></h1><p>Shape the small piece of the network that follows you from room to room.</p></div><div className="profile-role status-pill status-reviewed">{auth.role} access</div></div>
    <div className="profile-grid">
      <section className="profile-card profile-card-featured">
        <span className="eyebrow">Current badge</span>
        <div className="badge-glyph" aria-hidden="true">{profile.data.badge.name.split(' ').map((word) => word[0]).join('')}</div>
        <h2>{profile.data.badge.name}</h2>
        <p>{profile.data.badge.description}</p>
        <span className="badge-slug">{profile.data.badge.slug} / public signal</span>
      </section>
      <section className="profile-card">
        <div className="profile-card-heading"><div><span className="eyebrow">Public identity</span><h2>Make it yours.</h2></div><span className="status-pill status-reviewed">Private account</span></div>
        <form className="profile-form" onSubmit={(event) => { event.preventDefault(); setSaved(false); update.mutate({ data: { displayName: displayName.trim(), badgeSlug } }); }}>
          <div className="field"><label htmlFor="member-display-name">Display name</label><input id="member-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9 _-]{1,23}" required /><small>2–24 letters, numbers, spaces, hyphens, or underscores.</small></div>
          <div className="field"><label htmlFor="member-badge">Select your badge</label><select id="member-badge" value={badgeSlug} onChange={(event) => setBadgeSlug(event.target.value as NonNullable<MemberProfileInput['badgeSlug']>)}>{(badges.data ?? []).filter((badge) => badge.isSelectable).map((badge) => <option value={badge.slug} key={badge.slug}>{badge.name} — {badge.description}</option>)}</select></div>
          <div className="profile-form-footer"><span className="form-note">{saved ? 'Signal saved.' : update.isError ? 'That update could not be saved.' : 'Your email stays private.'}</span><button className="button-primary" type="submit" disabled={update.isPending}><Save size={14} /> {update.isPending ? 'Saving…' : 'Save signal'}</button></div>
        </form>
      </section>
    </div>
  </main></Shell>;
}

function forumDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function forumError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function BadgeChip({ author }: { author: { displayName: string; badge: { name: string } } }) {
  return <span className="forum-author"><span className="mini-badge" aria-hidden="true">{author.badge.name.split(' ').map((word) => word[0]).join('')}</span><span><strong>{author.displayName}</strong><small>{author.badge.name}</small></span></span>;
}

function ReportForm({ targetType, targetId }: { targetType: 'thread' | 'reply'; targetId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const report = useCreateForumReport();
  if (!open) return <button type="button" className="text-button forum-report-trigger" onClick={() => setOpen(true)}><Flag size={13} /> Report</button>;
  return <form className="forum-report-form" onSubmit={(event) => {
    event.preventDefault();
    report.mutate({ data: { targetType, targetId, reason: reason.trim() } }, {
      onSuccess: () => { setReason(''); setOpen(false); },
    });
  }}>
    <label htmlFor={`report-${targetType}-${targetId}`}>Why should a moderator review this?</label>
    <textarea id={`report-${targetType}-${targetId}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} required placeholder="At least 10 characters" />
    <div className="forum-inline-actions"><button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button-secondary" disabled={report.isPending}>{report.isPending ? 'Sending…' : 'Send report'}</button></div>
    {report.isError && <p className="social-status error" role="alert">{forumError(report.error, 'The report could not be sent.')}</p>}
  </form>;
}

function ReplyCard({ reply, threadId, onChanged }: { reply: ForumReply; threadId: number; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(reply.content);
  const update = useUpdateForumReply({ mutation: { onSuccess: () => { setEditing(false); onChanged(); } } });
  const remove = useDeleteForumReply({ mutation: { onSuccess: onChanged } });
  return <article className="forum-reply">
    <div className="forum-post-meta"><BadgeChip author={reply.author} /><time dateTime={reply.createdAt}>{forumDate(reply.createdAt)}</time></div>
    {editing ? <form className="forum-edit-form" onSubmit={(event) => { event.preventDefault(); update.mutate({ id: reply.id, data: { content: content.trim() } }); }}><textarea value={content} onChange={(event) => setContent(event.target.value)} minLength={2} maxLength={3000} required /><div className="forum-inline-actions"><button type="button" className="text-button" onClick={() => { setEditing(false); setContent(reply.content); }}>Cancel</button><button className="button-secondary" type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save reply'}</button></div>{update.isError && <p className="social-status error" role="alert">The reply could not be saved.</p>}</form> : <p className="forum-post-content">{reply.content}</p>}
    <div className="forum-post-footer">{reply.canEdit && <button type="button" className="text-button" onClick={() => setEditing(true)}>Edit</button>}{reply.canRemove && <button type="button" className="text-button danger-link" disabled={remove.isPending} onClick={() => { if (window.confirm('Remove this reply?')) remove.mutate({ id: reply.id }); }}>Remove</button>}<ReportForm targetType="reply" targetId={reply.id} /></div>
  </article>;
}

function ThreadComposer({ categorySlug, onCreated }: { categorySlug: string; onCreated: (id: number) => void }) {
  const auth = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const create = useCreateForumThread({ mutation: { onSuccess: (data) => { setTitle(''); setContent(''); onCreated(data.thread.id); } } });
  if (!auth.isAuthenticated) return <section className="forum-composer forum-sign-in"><div><span className="eyebrow">Member channel</span><h2>Have a signal to add?</h2><p>Sign in to start a thread with your public display name and selected Lok badge.</p></div><button className="button-secondary" type="button" onClick={() => auth.login()}>Sign in to post <ArrowUpRight size={14} /></button></section>;
  return <section className="forum-composer"><div><span className="eyebrow">Open a new signal</span><h2>Start a thread.</h2><p>Keep it useful, kind, and specific. Posts are public once sent.</p></div><form className="forum-compose-form" onSubmit={(event) => { event.preventDefault(); create.mutate({ data: { categorySlug, title: title.trim(), content: content.trim() } }); }}><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={4} maxLength={120} required placeholder="Thread title" aria-label="Thread title" /><textarea value={content} onChange={(event) => setContent(event.target.value)} minLength={10} maxLength={5000} required placeholder="What do you want to put into the room?" aria-label="Thread content" /><div className="forum-compose-footer"><span>{content.length} / 5000</span><button className="button-primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Posting…' : 'Publish thread'} <ArrowUpRight size={14} /></button></div>{create.isError && <p className="social-status error" role="alert">{forumError(create.error, 'The thread could not be published.')}</p>}</form></section>;
}

function ForumModerationPanel({ threadId, isLocked, isPinned, onChanged }: { threadId: number; isLocked: boolean; isPinned: boolean; onChanged: () => void }) {
  const auth = useAuth();
  const allowed = auth.role === 'moderator' || auth.role === 'admin' || auth.role === 'owner';
  const moderate = useModerateForumThread({ mutation: { onSuccess: onChanged } });
  if (!allowed) return null;
  const act = (action: 'hide' | 'remove' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin') => moderate.mutate({ id: threadId, data: { action } });
  return <div className="forum-moderation-tools"><span className="eyebrow">Moderator tools</span><div className="forum-inline-actions"><button className="button-secondary" type="button" disabled={moderate.isPending} onClick={() => act(isLocked ? 'unlock' : 'lock')}><Lock size={13} /> {isLocked ? 'Unlock' : 'Lock'}</button><button className="button-secondary" type="button" disabled={moderate.isPending} onClick={() => act(isPinned ? 'unpin' : 'pin')}><Pin size={13} /> {isPinned ? 'Unpin' : 'Pin'}</button><button className="button-secondary danger-button" type="button" disabled={moderate.isPending} onClick={() => act('hide')}>Hide thread</button><button className="button-secondary danger-button" type="button" disabled={moderate.isPending} onClick={() => act('remove')}>Remove thread</button></div>{moderate.isError && <p className="social-status error" role="alert">That moderation action could not be saved.</p>}</div>;
}

function ForumModerationQueue() {
  const auth = useAuth();
  const allowed = auth.role === 'moderator' || auth.role === 'admin' || auth.role === 'owner';
  const reports = useListForumModerationReports({ page: 1, pageSize: 20 }, { query: { enabled: allowed, queryKey: getListForumModerationReportsQueryKey({ page: 1, pageSize: 20 }) } });
  const resolve = useResolveForumReport({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListForumModerationReportsQueryKey({ page: 1, pageSize: 20 }) }) } });
  if (!allowed) return null;
  if (reports.isLoading) return <section className="forum-moderation-queue info-panel"><span className="eyebrow">Moderator queue</span><h2>Loading reports…</h2></section>;
  if (reports.isError) return <section className="forum-moderation-queue info-panel" role="alert"><span className="eyebrow">Moderator queue</span><h2>Queue unavailable.</h2><p>Reports could not be loaded.</p><button type="button" className="button-secondary" onClick={() => reports.refetch()}>Retry queue</button></section>;
  const items = reports.data?.items ?? [];
  return <section className="forum-moderation-queue info-panel"><div className="forum-section-heading"><div><span className="eyebrow">Moderator queue</span><h2>Keep the room clear.</h2></div><span className="status-pill status-reviewed">{items.filter((item) => item.status === 'pending').length} pending</span></div>{items.length === 0 ? <p className="locked-note">No reports waiting. The room is quiet.</p> : <div className="forum-report-list">{items.map((item) => <div className="forum-report-row" key={item.id}><div><strong>{item.targetType} #{item.targetId}</strong><p>{item.reason}</p><small>Reported by {item.reporter.displayName} · {forumDate(item.createdAt)}</small></div>{item.status === 'pending' ? <div className="forum-inline-actions"><button type="button" className="text-button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: item.id, data: { status: 'resolved' } })}>Resolve</button><button type="button" className="text-button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: item.id, data: { status: 'dismissed' } })}>Dismiss</button></div> : <span className="status-pill status-locked">{item.status}</span>}</div>)}</div>}</section>;
}

function Forum() {
  const [, setLocation] = useLocation();
  const [categorySlug, setCategorySlug] = useState('game-room');
  const [page, setPage] = useState(1);
  const categories = useGetForumCategories();
  const categoryList = categories.data ?? [];
  const threads = useListForumCategoryThreads(categorySlug, { page, pageSize: 12 });
  useEffect(() => { if (categoryList[0] && !categoryList.some((category) => category.slug === categorySlug)) setCategorySlug(categoryList[0].slug); }, [categoryList, categorySlug]);
  const selectedCategory = categoryList.find((category) => category.slug === categorySlug);
  const chooseCategory = (slug: string) => { setCategorySlug(slug); setPage(1); };
  return <Shell><main id="main-content" className="forum-shell container-g6">
    <section className="forum-heading"><div><span className="eyebrow">GSix / Community signal</span><h1>THE<br /><span className="text-aqua">FORUM.</span></h1><p>A public room for game talk, field notes, and the good kind of internet rabbit hole. Browse freely; sign in when you want to add your voice.</p></div><div className="forum-heading-mark" aria-hidden="true">/ /<br />OPEN<br />CHANNEL</div></section>
    {categories.isLoading ? <div className="forum-loading"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line short" /></div> : categories.isError ? <div className="auth-state-card denied forum-state-card" role="alert"><span className="eyebrow">Community signal</span><h2>Categories are offline.</h2><p className="locked-note">The forum could not connect. Try again in a moment.</p><button type="button" className="button-secondary" onClick={() => categories.refetch()}>Retry connection</button></div> : <><div className="forum-categories" role="tablist" aria-label="Forum categories">{categoryList.map((category) => <button type="button" role="tab" aria-selected={category.slug === categorySlug} className={`forum-category ${category.slug === categorySlug ? 'active' : ''}`} onClick={() => chooseCategory(category.slug)} key={category.slug}><strong>{category.name}</strong><span>{category.threadCount} {category.threadCount === 1 ? 'thread' : 'threads'}</span><small>{category.description}</small></button>)}</div><section className="forum-thread-section"><div className="forum-section-heading"><div><span className="eyebrow">{selectedCategory?.name ?? 'Open channel'}</span><h2>Recent transmissions.</h2></div><span className="locked-note">{threads.data?.pagination.total ?? 0} public threads</span></div>{threads.isLoading ? <div className="forum-thread-list"><div className="forum-thread-skeleton" /><div className="forum-thread-skeleton" /><div className="forum-thread-skeleton" /></div> : threads.isError ? <div className="forum-empty" role="alert"><strong>That channel went quiet.</strong><p>We could not load its threads.</p><button type="button" className="button-secondary" onClick={() => threads.refetch()}>Retry channel</button></div> : !threads.data?.items.length ? <div className="forum-empty"><span className="empty-mark" aria-hidden="true">—</span><strong>No threads here yet.</strong><p>Be the first person to put a signal into this room.</p></div> : <div className="forum-thread-list">{threads.data.items.map((thread) => <Link href={`/forum/thread/${thread.id}`} className="forum-thread-row" key={thread.id}><div className="forum-thread-row-main"><div className="forum-thread-flags">{thread.isPinned && <span className="status-pill status-reviewed"><Pin size={11} /> Pinned</span>}{thread.isLocked && <span className="status-pill status-locked"><Lock size={11} /> Locked</span>}</div><h3>{thread.title}</h3><p>{thread.excerpt}</p><BadgeChip author={thread.author} /></div><div className="forum-thread-stats"><strong>{thread.replyCount}</strong><span>replies</span><small>{forumDate(thread.lastActivityAt)}</small><ChevronRight size={16} aria-hidden="true" /></div></Link>)}</div>}{threads.data && threads.data.pagination.totalPages > 1 && <div className="forum-pagination"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} / {threads.data.pagination.totalPages}</span><button className="button-secondary" type="button" disabled={page >= threads.data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>}</section><ThreadComposer categorySlug={categorySlug} onCreated={(id) => setLocation(`/forum/thread/${id}`)} /><ForumModerationQueue /></>}
  </main></Shell>;
}

function ForumThreadPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const threadId = Number(params.id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const query = useGetForumThreadDetail(threadId, { replyPage: 1, pageSize: 20 });
  const reply = useCreateForumReply({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetForumThreadDetailQueryKey(threadId, { replyPage: 1, pageSize: 20 }) }) } });
  const update = useUpdateForumThread({ mutation: { onSuccess: () => { setEditing(false); queryClient.invalidateQueries({ queryKey: getGetForumThreadDetailQueryKey(threadId, { replyPage: 1, pageSize: 20 }) }); } } });
  const remove = useDeleteForumThread({ mutation: { onSuccess: () => setLocation('/forum') } });
  const [replyContent, setReplyContent] = useState('');
  if (query.isLoading) return <Shell><main id="main-content" className="forum-shell container-g6"><div className="forum-loading"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line short" /></div></main></Shell>;
  if (query.isError || !query.data) return <Shell><main id="main-content" className="forum-shell container-g6"><div className="auth-state-card denied forum-state-card" role="alert"><span className="eyebrow">Community signal</span><h2>Thread not found.</h2><p className="locked-note">This thread may have been removed or the address may be mistyped.</p><Link className="button-secondary" href="/forum">Return to the forum <ArrowUpRight size={14} /></Link></div></main></Shell>;
  const thread = query.data.thread;
  const submitReply = (event: React.FormEvent) => { event.preventDefault(); reply.mutate({ id: thread.id, data: { content: replyContent.trim() } }, { onSuccess: () => setReplyContent('') }); };
  return <Shell><main id="main-content" className="forum-shell container-g6"><Link href="/forum" className="forum-back">← Back to community</Link><article className="forum-thread-detail"><div className="forum-detail-heading"><div><span className="eyebrow">{thread.categorySlug} / {thread.isPinned ? 'pinned' : 'transmission'}</span>{editing ? <input className="forum-edit-title" value={title || thread.title} onChange={(event) => setTitle(event.target.value)} minLength={4} maxLength={120} /> : <h1>{thread.title}</h1>}<div className="forum-post-meta"><BadgeChip author={thread.author} /><time dateTime={thread.createdAt}>{forumDate(thread.createdAt)}</time></div></div><div className="forum-thread-flags">{thread.isLocked && <span className="status-pill status-locked"><Lock size={11} /> Locked</span>}</div></div>{editing ? <form className="forum-edit-form forum-thread-editor" onSubmit={(event) => { event.preventDefault(); update.mutate({ id: thread.id, data: { title: (title || thread.title).trim(), content: (content || thread.content).trim() } }); }}><textarea value={content || thread.content} onChange={(event) => setContent(event.target.value)} minLength={10} maxLength={5000} required /><div className="forum-inline-actions"><button type="button" className="text-button" onClick={() => { setEditing(false); setTitle(''); setContent(''); }}>Cancel</button><button type="submit" className="button-primary" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save thread'}</button></div></form> : <p className="forum-thread-content">{thread.content}</p>}<div className="forum-post-footer">{thread.canEdit && <button type="button" className="text-button" onClick={() => { setEditing(true); setTitle(thread.title); setContent(thread.content); }}>Edit</button>}{thread.canRemove && <button type="button" className="text-button danger-link" disabled={remove.isPending} onClick={() => { if (window.confirm('Remove this thread?')) remove.mutate({ id: thread.id }); }}>Remove</button>}<ReportForm targetType="thread" targetId={thread.id} /></div></article><ForumModerationPanel threadId={thread.id} isLocked={thread.isLocked} isPinned={thread.isPinned} onChanged={() => queryClient.invalidateQueries({ queryKey: getGetForumThreadDetailQueryKey(threadId, { replyPage: 1, pageSize: 20 }) })} /><section className="forum-replies-section"><div className="forum-section-heading"><div><span className="eyebrow">Community responses</span><h2>{query.data.pagination.total} replies.</h2></div></div>{query.data.replies.map((item) => <ReplyCard reply={item} threadId={thread.id} onChanged={() => queryClient.invalidateQueries({ queryKey: getGetForumThreadDetailQueryKey(threadId, { replyPage: 1, pageSize: 20 }) })} key={item.id} />)}{!query.data.replies.length && <div className="forum-empty small"><strong>No replies yet.</strong><p>The first response opens the thread.</p></div>}</section>{auth.isAuthenticated ? thread.isLocked ? <div className="forum-sign-in forum-locked-reply"><Lock size={16} /><p>This thread is locked by moderation.</p></div> : <form className="forum-reply-form" onSubmit={submitReply}><span className="eyebrow">Add your signal</span><textarea value={replyContent} onChange={(event) => setReplyContent(event.target.value)} minLength={2} maxLength={3000} required placeholder="Write a public reply…" aria-label="Public reply" /><div className="forum-compose-footer"><span>{replyContent.length} / 3000</span><button className="button-primary" type="submit" disabled={reply.isPending}>{reply.isPending ? 'Sending…' : 'Send reply'} <ArrowUpRight size={14} /></button></div>{reply.isError && <p className="social-status error" role="alert">{forumError(reply.error, 'The reply could not be sent.')}</p>}</form> : <div className="forum-sign-in forum-reply-sign-in"><p>Sign in to reply with your public badge.</p><button className="button-secondary" type="button" onClick={() => auth.login()}>Sign in to reply <ArrowUpRight size={14} /></button></div>}</main></Shell>;
}

const LEADERBOARD_RANGES = [
  { value: 'weekly', label: 'This week', shortLabel: '7 days' },
  { value: 'monthly', label: 'This month', shortLabel: '30 days' },
  { value: 'all-time', label: 'All time', shortLabel: 'All signal' },
] as const;

function LeaderboardActivityPulse() {
  const auth = useAuth();
  const pulse = useRecordLeaderboardActivity();
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    let lastInteraction = Date.now();
    const markEngaged = () => { lastInteraction = Date.now(); };
    const sendPulse = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInteraction > 5 * 60 * 1000 || pulse.isPending) return;
      pulse.mutate({ data: { engagedMinutes: 5 } });
    };
    window.addEventListener('pointerdown', markEngaged, { passive: true });
    window.addEventListener('keydown', markEngaged, { passive: true });
    document.addEventListener('visibilitychange', markEngaged);
    const interval = window.setInterval(sendPulse, 5 * 60 * 1000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', markEngaged);
      window.removeEventListener('keydown', markEngaged);
      document.removeEventListener('visibilitychange', markEngaged);
    };
  }, [auth.isAuthenticated]);
  return null;
}

function LeaderboardDiagnostics() {
  const auth = useAuth();
  const allowed = auth.role === 'moderator' || auth.role === 'admin' || auth.role === 'owner';
  const diagnostics = useGetLeaderboardDiagnostics({ query: { enabled: allowed, queryKey: ['/api/leaderboard/moderation/diagnostics'] } });
  if (!allowed || diagnostics.isLoading || diagnostics.isError || !diagnostics.data) return null;
  return <section className="leaderboard-diagnostics info-panel"><div className="forum-section-heading"><div><span className="eyebrow">Moderator view</span><h2>Aggregate health.</h2></div><span className="status-pill status-reviewed">No raw timelines</span></div><div className="leaderboard-diagnostic-grid"><div><strong>{diagnostics.data.rankedMembers}</strong><span>ranked members</span></div><div><strong>{diagnostics.data.cappedDailyMinutes}</strong><span>capped minutes stored</span></div><div><strong>{diagnostics.data.cachedWindows.length}</strong><span>cached windows</span></div></div><div className="leaderboard-anomalies"><span className="eyebrow">Anomaly summary</span>{diagnostics.data.anomalies.map((anomaly) => <p key={anomaly}>{anomaly}</p>)}</div><p className="locked-note">Only counters and cache health are shown here. Future event sources are reserved, not fabricated.</p></section>;
}

function Leaderboard() {
  const auth = useAuth();
  const [range, setRange] = useState<(typeof LEADERBOARD_RANGES)[number]['value']>('weekly');
  const leaderboard = useGetLeaderboard({ window: range }, { query: { refetchInterval: 60_000, staleTime: 30_000, queryKey: getGetLeaderboardQueryKey({ window: range }) } });
  const data = leaderboard.data;
  return <Shell><main id="main-content" className="leaderboard-shell container-g6">
    <section className="leaderboard-heading"><div><span className="eyebrow">GSix / Community signal</span><h1>WHO'S<br /><span className="text-aqua">GRAND?</span></h1><p>A transparent celebration of showing up. Scores use approved community participation and coarse, capped signals—not private timelines.</p></div><div className="leaderboard-heading-mark">LOW<br />FREQUENCY<br />/ FAIR PLAY</div></section>
    <section className="leaderboard-toolbar" aria-label="Leaderboard time range"><div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard time range">{LEADERBOARD_RANGES.map((item) => <button key={item.value} type="button" role="tab" aria-selected={range === item.value} className={range === item.value ? 'active' : ''} onClick={() => setRange(item.value)}>{item.label}<small>{item.shortLabel}</small></button>)}</div><div className="leaderboard-refresh" aria-live="polite">{data ? <>{leaderboard.isFetching ? 'Refreshing' : 'Cached'} · Updated {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(data.generatedAt))} · refreshes every {data.refreshAfterSeconds}s</> : 'Ranking signal loading…'}</div></section>
    {leaderboard.isLoading ? <div className="leaderboard-loading"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line short" /></div> : leaderboard.isError ? <div className="auth-state-card denied leaderboard-state-card" role="alert"><span className="eyebrow">Ranking signal</span><h2>Leaderboard offline.</h2><p className="locked-note">We could not load the current ranking. No private activity was exposed.</p><button type="button" className="button-secondary" onClick={() => leaderboard.refetch()}>Retry ranking</button></div> : data && data.entries.length === 0 ? <div className="forum-empty leaderboard-empty"><span className="empty-mark" aria-hidden="true">/ /</span><strong>The first signal is yours.</strong><p>Join the forum, star a game while signed in, or simply return another day to appear here.</p><Link className="button-primary" href="/forum">Enter the forum <ArrowUpRight size={14} /></Link></div> : data && <><div className="leaderboard-context"><div><span className="eyebrow">{data.window === 'all-time' ? 'All signal' : data.window === 'monthly' ? 'Last 30 days' : 'Last 7 days'}</span><h2>Participation, not surveillance.</h2></div>{auth.isAuthenticated && <span className="leaderboard-viewer-rank">{data.viewerRank ? <>Your rank <strong>#{data.viewerRank}</strong></> : 'Your rank appears after you participate'}</span>}</div><div className="leaderboard-list" aria-live="polite">{data.entries.map((entry) => <article className={`leaderboard-entry ${entry.rank <= 3 ? 'podium-entry' : ''}`} key={entry.userId} aria-label={`${entry.displayName}, rank ${entry.rank}, ${entry.score} points`}><div className="leaderboard-rank"><span>#{entry.rank}</span>{entry.rank === 1 && <small>TOP SIGNAL</small>}</div><div className="leaderboard-member"><span className="leaderboard-badge">{entry.badge.name.split(' ').map((word) => word[0]).join('')}</span><div><h3>{entry.displayName}</h3><span>{entry.badge.name}</span></div></div><div className="leaderboard-metrics">{entry.metrics.filter((metric) => metric.enabled && metric.value > 0).slice(0, 3).map((metric) => <span key={metric.key}><strong>{metric.value}</strong> {metric.label}</span>)}{!entry.metrics.some((metric) => metric.enabled && metric.value > 0) && <span>First signal</span>}</div><div className="leaderboard-score"><strong>{entry.score}</strong><span>points</span></div></article>)}</div></>}
    {data && <section className="leaderboard-explainer"><div><span className="eyebrow">How the signal is earned</span><h2>Useful beats noisy.</h2><p>Moderated or removed content never scores. Ties share a rank and then resolve alphabetically so nobody wins through hidden precision.</p></div><div className="leaderboard-rules">{data.scoring.map((rule) => <div className={`leaderboard-rule ${rule.enabled ? '' : 'disabled'}`} key={rule.key}><div><strong>{rule.label}</strong><span>{rule.description}</span></div><b>{rule.enabled ? `${rule.points} pt` : 'reserved'}</b></div>)}</div></section>}
    <LeaderboardDiagnostics />
  </main></Shell>;
}

type Track = { id: number; title: string; artist: string; url: string };
const starterTracks: Track[] = [{ id: 1, title: 'After the lights', artist: 'GSix / field recording', url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_9465c2c9c2.mp3' }, { id: 2, title: 'Local:200', artist: 'GSix / chapter zero', url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a734c7.mp3' }];

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function feedbackAuthorName(author: { firstName: string | null; lastName: string | null; email: string | null }) {
  const name = [author.firstName, author.lastName].filter(Boolean).join(' ');
  return name || author.email || 'Unknown player';
}

function FeedbackInbox({ isOwner }: { isOwner: boolean }) {
  const feedback = useGetGameFeedback({
    query: {
      enabled: isOwner,
      queryKey: getGetGameFeedbackQueryKey(),
    },
  });
  const review = useReviewGameFeedback({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGameFeedbackQueryKey() }),
    },
  });

  if (feedback.isLoading) {
    return <section className="admin-box feedback-inbox" data-testid="feedback-inbox-loading" aria-label="Loading private feedback"><div className="inbox-heading"><div><span className="eyebrow">Private player signals</span><h2>Feedback inbox</h2></div><span className="skeleton-line" /></div><div className="feedback-skeleton-list"><div className="feedback-skeleton" /><div className="feedback-skeleton" /><div className="feedback-skeleton" /></div></section>;
  }

  if (feedback.isError) {
    return <section className="admin-box feedback-inbox" data-testid="feedback-inbox-error" role="alert"><div className="inbox-heading"><div><span className="eyebrow">Private player signals</span><h2>Feedback inbox</h2></div><span className="status-pill status-error">Connection error</span></div><div className="feedback-empty"><strong>The signal could not be read.</strong><p>GSix could not load the private review queue. Check the connection and try again.</p><button type="button" className="button-secondary" data-testid="button-retry-feedback" onClick={() => feedback.refetch()}>Retry connection</button></div></section>;
  }

  const groups = feedback.data ?? [];
  const noteCount = groups.reduce((total, group) => total + group.notes.length, 0);
  const pendingCount = groups.reduce((total, group) => total + group.notes.filter((note) => note.status === 'pending').length, 0);

  return <section className="admin-box feedback-inbox" data-testid="feedback-inbox">
    <div className="inbox-heading">
      <div><span className="eyebrow">Private player signals</span><h2>Feedback inbox</h2><p className="locked-note">Notes from players, grouped by the door they came through. Nothing here is public.</p></div>
      <div className="inbox-counts" aria-label="Feedback totals"><span data-testid="feedback-total-count"><strong>{noteCount}</strong> total</span><span className={pendingCount ? 'count-pending' : ''} data-testid="feedback-pending-count"><strong>{pendingCount}</strong> pending</span></div>
    </div>
    {groups.length === 0 ? <div className="feedback-empty" data-testid="feedback-empty-state"><span className="empty-mark" aria-hidden="true">—</span><strong>No private notes yet.</strong><p>When a player leaves a note, it will arrive here under its game signal.</p></div> : <div className="feedback-groups">{groups.map((group) => {
      const game = getGameBySlug(group.gameSlug);
      return <section className="feedback-group" key={group.gameSlug} data-testid={`feedback-group-${group.gameSlug}`}>
        <div className="feedback-group-heading"><div><span className="feedback-game-index">{game?.number ?? '—'} / {game?.signal ?? 'signal'}</span><h3 data-testid={`feedback-game-${group.gameSlug}`}>{game?.title ?? group.gameSlug}</h3></div><span className="feedback-group-count">{group.notes.length} {group.notes.length === 1 ? 'note' : 'notes'}</span></div>
        <div className="feedback-notes">{group.notes.map((note) => <article className={`feedback-note ${note.status}`} key={note.id} data-testid={`feedback-note-${note.id}`}>
          <div className="feedback-note-meta"><span className="feedback-author" data-testid={`feedback-author-${note.id}`}>{feedbackAuthorName(note.author)}</span><span className="feedback-date" data-testid={`feedback-timestamp-${note.id}`}>{formatFeedbackDate(note.createdAt)}</span></div>
          <p className="feedback-note-content" data-testid={`feedback-content-${note.id}`}>{note.content}</p>
          <div className="feedback-note-footer"><span className={`status-pill status-${note.status}`} data-testid={`feedback-status-${note.id}`}>{note.status === 'pending' ? 'Needs review' : 'Reviewed'}</span>{note.status === 'pending' && <button type="button" className="review-button" data-testid={`button-review-feedback-${note.id}`} disabled={review.isPending} onClick={() => review.mutate({ id: note.id, data: { status: 'reviewed' } })}>{review.isPending ? 'Saving…' : 'Mark reviewed'} <ChevronRight size={13} /></button>}</div>
        </article>)}</div>
      </section>;
    })}</div>}
    {review.isError && <p className="social-status error feedback-mutation-error" role="alert" data-testid="feedback-review-error">That note could not be marked reviewed. Try again.</p>}
  </section>;
}

function RoleManager() {
  const roles = useGetMemberRoles();
  const update = useUpdateMemberRole({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMemberRolesQueryKey() }),
    },
  });
  const assignableRoles: MemberRoleInputRole[] = ['member', 'moderator', 'admin'];
  const memberRows = Array.isArray(roles.data) ? roles.data : [];

  if (roles.isLoading) return <section className="admin-box role-manager"><div className="inbox-heading"><div><span className="eyebrow">Access map</span><h2>Member roles</h2></div><span className="status-pill status-loading">Loading</span></div></section>;
  if (roles.isError || !Array.isArray(roles.data)) return <section className="admin-box role-manager" role="alert"><div className="inbox-heading"><div><span className="eyebrow">Access map</span><h2>Member roles</h2></div><span className="status-pill status-error">Unavailable</span></div><p className="locked-note">Role assignments could not be loaded.</p><button type="button" className="button-secondary" onClick={() => roles.refetch()}>Retry connection</button></section>;

  return <section className="admin-box role-manager">
    <div className="inbox-heading"><div><span className="eyebrow">Access map</span><h2>Member roles</h2><p className="locked-note">Only the owner can grant or revoke admin and moderator access. Every change is recorded.</p></div><span className="status-pill status-reviewed">Owner only</span></div>
    <div className="role-list">{memberRows.map((member) => <div className="role-row" key={member.userId}><div className="role-member"><span className="mini-badge">{member.badge.name.split(' ').map((word) => word[0]).join('')}</span><div><strong>{member.displayName}</strong><small>{member.badge.name} / {member.role} access</small></div></div>{member.role === 'owner' ? <span className="status-pill status-reviewed">Owner</span> : <select aria-label={`Role for ${member.displayName}`} value={member.role} disabled={update.isPending} onChange={(event) => update.mutate({ userId: member.userId, data: { role: event.target.value as MemberRoleInputRole } })}>{assignableRoles.map((role) => <option value={role} key={role}>{role}</option>)}</select>}</div>)}</div>
    {update.isError && <p className="social-status error" role="alert">That role change could not be saved.</p>}
  </section>;
}

function Admin() {
  const auth = useAuth();
  const [tracks, setTracks] = useState<Track[]>(() => { try { return JSON.parse(localStorage.getItem('g6-tracks') || 'null') || starterTracks; } catch { return starterTracks; } });
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', url: '' });
  useEffect(() => { localStorage.setItem('g6-tracks', JSON.stringify(tracks)); }, [tracks]);
  const addTrack = (event: React.FormEvent) => { event.preventDefault(); if (!newTrack.title || !newTrack.url) return; setTracks([...tracks, { ...newTrack, id: Date.now() }]); setNewTrack({ title: '', artist: '', url: '' }); };
  if (auth.isLoading) return <Shell><main id="main-content" className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room</span><h1>PRIVATE<br />SIGNAL.</h1></div><span className="status-pill status-loading" data-testid="admin-auth-loading">Checking identity</span></div><div className="admin-auth-skeleton" data-testid="admin-auth-skeleton"><span /><span /><span /></div></main></Shell>;
  if (!auth.isAuthenticated) return <Shell><main id="main-content" className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room</span><h1>PRIVATE<br />SIGNAL.</h1></div><span className="status-pill status-locked">Sign-in required</span></div><div className="auth-state-card" data-testid="admin-sign-in-state"><div className="brand-mark" style={{ margin: '0 auto' }} /><span className="eyebrow">Owner channel</span><h2>Identify yourself.</h2><p className="locked-note">Sign in with your GSix account to open the private review room. Player notes and studio controls stay behind server-authenticated access.</p><button className="button-primary" data-testid="button-admin-sign-in" type="button" onClick={() => auth.login()}>Sign in to control room <ChevronRight size={15} /></button></div></main></Shell>;
  if (!auth.isOwner) return <Shell><main id="main-content" className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room</span><h1>PRIVATE<br />SIGNAL.</h1></div><span className="status-pill status-error">Access denied</span></div><div className="auth-state-card denied" data-testid="admin-access-denied-state"><div className="brand-mark" style={{ margin: '0 auto' }} /><span className="eyebrow">Restricted channel</span><h2>This door is not yours.</h2><p className="locked-note">Your account is signed in, but the control room is reserved for the GSix owner. No private feedback was loaded.</p><Link className="button-secondary" data-testid="link-return-from-admin-denied" href="/games">Return to the arcade <ArrowUpRight size={14} /></Link></div></main></Shell>;
  return <Shell><main id="main-content" className="admin-shell container-g6"><div className="admin-heading"><div><span className="eyebrow">GSix / Control room / owner access</span><h1>PRIVATE<br /><span className="text-aqua">SIGNALS.</span></h1><p className="admin-heading-copy">A quiet room for the notes players leave behind.</p></div><button className="button-secondary" data-testid="button-admin-sign-out" type="button" onClick={auth.logout}>Sign out</button></div><FeedbackInbox isOwner={auth.isOwner} /><RoleManager /><div className="admin-panel"><form className="admin-box" onSubmit={addTrack}><h2>Add a track.</h2><p className="locked-note">Tracks persist in this browser and can be used by the next transmission.</p><div className="field"><label htmlFor="track-title">Title</label><input id="track-title" data-testid="input-track-title" required value={newTrack.title} onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })} placeholder="Track title" /></div><div className="field"><label htmlFor="track-artist">Artist / source</label><input id="track-artist" data-testid="input-track-artist" value={newTrack.artist} onChange={(e) => setNewTrack({ ...newTrack, artist: e.target.value })} placeholder="Who made the noise?" /></div><div className="field"><label htmlFor="track-url">Audio URL</label><input id="track-url" data-testid="input-track-url" type="url" required value={newTrack.url} onChange={(e) => setNewTrack({ ...newTrack, url: e.target.value })} placeholder="https://..." /></div><button className="button-primary" data-testid="button-add-track" type="submit"><Plus size={15} /> Add to rotation</button></form><section className="admin-box"><h2>Current rotation <span className="text-aqua" style={{ font: '11px var(--app-font-mono)' }}>/{tracks.length}</span></h2><div className="track-list">{tracks.map((track) => <div className="track-row" key={track.id} data-testid={`track-row-${track.id}`}><div><strong data-testid={`track-title-${track.id}`}>{track.title}</strong><small>{track.artist || 'Uncredited'} / {track.url}</small></div><button className="delete-btn" aria-label={`Remove ${track.title}`} data-testid={`button-remove-track-${track.id}`} onClick={() => setTracks(tracks.filter((item) => item.id !== track.id))}><Trash2 size={15} aria-hidden="true" /> remove</button></div>)}</div></section></div></main></Shell>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route path={GAMES_DIRECTORY_PATH} component={Games} /><Route path={GAME_DETAIL_ROUTE} component={GameDetail} /><Route path="/forum" component={Forum} /><Route path="/forum/thread/:id" component={ForumThreadPage} /><Route path="/leaderboard" component={Leaderboard} /><Route path="/hire" component={Hire} /><Route path="/profile" component={Profile} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><LeaderboardActivityPulse /><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
