'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type User = { id: string; username: string; role: 'PLAYER' | 'ADMIN'; displayName: string };
type Game = { id: number; slug: string; name: string; genre: string };
type PlayerRow = {
  user_id: string; username: string; display_name: string; region: string; game_name: string;
  rating: number; peak_rating: number; games_played: number; wins: number; losses: number;
  win_rate_pct: number | null; rank_position: number;
};
type MatchRow = {
  id: string; game_id: number; game_name: string; season_name: string;
  player_a_id: string; player_a_username: string; player_a_name: string;
  player_b_id: string; player_b_username: string; player_b_name: string;
  winner_id?: string | null; winner_username?: string | null; winner_name?: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  player_a_rating_before?: number | null; player_b_rating_before?: number | null;
  player_a_rating_after?: number | null; player_b_rating_after?: number | null;
  created_at: string; completed_at?: string | null;
};
type Dashboard = {
  user: User; games: Game[]; activeSeason: { id: string; name: string } | null;
  selectedGameId: number; stats: { rating: number; peak_rating: number; games_played: number; wins: number; losses: number; win_rate_pct: number | null } | null;
  leaderboard: PlayerRow[]; matches: MatchRow[]; queue: { id: string; game_id: number; game_name: string; season_name: string; rating_snapshot: number; joined_at: string } | null;
  queueCount: number; pendingMatches: MatchRow[]; recentAuditEvents: Array<{ action: string; entityType: string; actorUsername?: string; createdAt: string; details?: Record<string, unknown> }>;
};

type ViewName = 'overview' | 'leaderboard' | 'matchmaking' | 'matches' | 'admin';

const NAV: Array<{ id: ViewName; label: string; icon: string; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '↗' },
  { id: 'matchmaking', label: 'Matchmaking', icon: '⌘' },
  { id: 'matches', label: 'Match history', icon: '◷' },
  { id: 'admin', label: 'Admin console', icon: '⚙', adminOnly: true }
];

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function compactDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'AR';
}

function StatusPill({ status }: { status: MatchRow['status'] }) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span className="status-dot" />{status}</span>;
}

function PlayerIdentity({ name, username, region, compact = false }: { name: string; username: string; region?: string; compact?: boolean }) {
  return <div className={`player-identity ${compact ? 'compact' : ''}`}>
    <span className="avatar">{initials(name)}</span>
    <span className="player-label"><strong>{name}</strong><small>@{username}{region ? ` · ${region}` : ''}</small></span>
  </div>;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewName>('overview');
  const [gameId, setGameId] = useState(0);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('player1@esports.local');
  const [password, setPassword] = useState('Player123!');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [search, setSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }, []);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!user) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api(`/api/dashboard?gameId=${gameId}`);
      setDashboard(result as Dashboard);
      if (result.games?.length && !result.games.some((game: Game) => Number(game.id) === gameId)) setGameId(Number(result.games[0].id));
      setLastUpdated(new Date());
    } catch (error) {
      if (!silent) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load dashboard.' });
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [api, gameId, user]);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const result = await api('/api/auth/me');
        if (!cancelled && result.user) {
          setUser(result.user);
          setEmail(result.user.role === 'ADMIN' ? 'admin@esports.local' : 'player1@esports.local');
        }
      } catch {
        // The login screen is the expected unauthenticated state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void checkSession();
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (user) void loadDashboard();
  }, [user, loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => void loadDashboard(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard, user]);

  useEffect(() => {
    if (!user || view !== 'leaderboard') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ q: search, gameId: String(gameId) });
        const result = await api(`/api/players?${query.toString()}`);
        if (!cancelled) setPlayerResults(result.players || []);
      } catch {
        if (!cancelled) setPlayerResults([]);
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, gameId, search, user, view]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const route = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' ? { email, password } : { email, password, username, displayName };
      const result = await api(route, { method: 'POST', body: JSON.stringify(body) });
      setUser(result.user);
      setView('overview');
      setNotice({ kind: 'success', text: authMode === 'login' ? `Welcome back, ${result.user.displayName}.` : 'Account created. You are signed in.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Authentication failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* clear local view regardless */ }
    setUser(null);
    setDashboard(null);
    setView('overview');
    setNotice(null);
    setPassword('');
  }

  async function joinQueue() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await api('/api/queue/join', { method: 'POST', body: JSON.stringify({ gameId }) });
      setNotice({ kind: 'success', text: result.message });
      await loadDashboard();
      if (result.status === 'MATCH_FOUND') setView('matches');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not join matchmaking.' });
    } finally { setBusy(false); }
  }

  async function leaveQueue() {
    setBusy(true);
    try {
      const result = await api('/api/queue/leave', { method: 'POST', body: '{}' });
      setNotice({ kind: 'success', text: result.message });
      await loadDashboard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not leave queue.' });
    } finally { setBusy(false); }
  }

  async function recordResult(matchId: string, winnerId: string, winnerName: string) {
    setBusy(true);
    try {
      const result = await api(`/api/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify({ winnerId }) });
      const calc = result.calculation;
      setNotice({ kind: 'success', text: `Result saved. New ratings: ${calc.player_a_new_rating} and ${calc.player_b_new_rating}. Winner: ${winnerName}.` });
      await loadDashboard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the result.' });
    } finally { setBusy(false); }
  }

  function openAuth(mode: 'login' | 'register') {
    setAuthMode(mode);
    setNotice(null);
    window.setTimeout(() => document.getElementById('landing-auth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  const activeGame = useMemo(() => dashboard?.games.find((game) => Number(game.id) === gameId) || dashboard?.games[0], [dashboard?.games, gameId]);
  const leaderboardRows = useMemo(() => search ? playerResults : (dashboard?.leaderboard || []), [dashboard?.leaderboard, playerResults, search]);
  const completedMatches = (dashboard?.matches || []).filter((match) => match.status === 'COMPLETED');
  const queueAge = dashboard?.queue ? formatDuration(Math.max(0, now - new Date(dashboard.queue.joined_at).getTime())) : null;

  if (!user) {
    return <main className="auth-shell landing-shell">
      <div className="auth-backdrop-grid" />
      <header className="landing-nav">
        <div className="brand-lockup"><span className="brand-symbol">A<span>+</span></span><span><strong>ARENA<span>RANK</span></strong><small>COMPETITIVE INTELLIGENCE</small></span></div>
        <nav className="landing-links" aria-label="Public navigation">
          <button type="button" onClick={() => openAuth('register')}>TOURNAMENTS</button>
          <button type="button" onClick={() => openAuth('register')}>GALLERY</button>
          <button type="button" onClick={() => openAuth('login')}>ABOUT US</button>
          <button type="button" onClick={() => openAuth('login')}>CONTACT US</button>
        </nav>
        <button className="landing-join" type="button" onClick={() => openAuth('register')}>JOIN NOW <span>↗</span></button>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-kicker"><i /> SEASON 01 / LIVE COMPETITION</span>
          <h1>PLAY HARD.<br /><em>RANK HIGH.</em></h1>
          <p>Skill-based matchmaking, transparent Elo ratings, and a competitive arena built for players who want every match to matter.</p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={() => openAuth('register')}>REGISTER NOW <span>↗</span></button>
            <button className="landing-secondary" type="button" onClick={() => openAuth('login')}>SIGN IN</button>
          </div>
          <div className="landing-stats"><div><strong>03</strong><small>LIVE TITLES</small></div><div><strong>±300</strong><small>ELO WINDOW</small></div><div><strong>24/7</strong><small>QUEUE READY</small></div></div>
        </div>
        <div className="landing-art" aria-label="Abstract esports arena artwork">
          <div className="art-glow" /><div className="art-grid" /><div className="art-frame frame-one" /><div className="art-frame frame-two" />
          <div className="art-player"><span className="player-visor" /><span className="player-armor" /><span className="player-arm arm-left" /><span className="player-arm arm-right" /></div>
          <div className="art-badge">AR<br /><small>RANKED</small></div><span className="art-coordinate">45° 12' / MATCH POINT</span>
        </div>
      </section>
      <div className="landing-partners"><span>POWERED BY COMPETITION</span><strong>VALORANT</strong><strong>CS2</strong><strong>ROCKET LEAGUE</strong><strong>ARENA / 01</strong></div>
      <section className="auth-card landing-auth-card" id="landing-auth">
        <div className="auth-card-heading"><span className="auth-eyebrow"><span className="pulse-dot" /> {authMode === 'login' ? 'PLAYER LOGIN' : 'NEW PLAYER REGISTRATION'}</span><h2>{authMode === 'login' ? 'Enter the arena.' : 'Build your profile.'}</h2><p className="auth-copy">Your next win starts with a single sign in.</p></div>
        <form onSubmit={handleAuth} className="auth-form">
          {authMode === 'register' && <>
            <label>Player handle<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. NovaStrike" autoComplete="username" /></label>
            <label>Display name<input required minLength={2} maxLength={32} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How players see you" /></label>
          </>}
          <label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label>
          <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Enter the arena' : 'Create player account'} <span>↗</span></button>
        </form>
        {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
        <div className="auth-switch">{authMode === 'login' ? 'New to ArenaRank?' : 'Already registered?'} <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setNotice(null); }} type="button">{authMode === 'login' ? 'Create player account' : 'Sign in'}</button></div>
        {authMode === 'login' && <div className="demo-accounts"><span>DEMO ACCESS</span><div><button type="button" onClick={() => { setEmail('player1@esports.local'); setPassword('Player123!'); }}>Player demo</button><button type="button" onClick={() => { setEmail('admin@esports.local'); setPassword('Admin123!'); }}>Admin demo</button></div></div>}
        <p className="auth-footnote">Academic demonstration environment · Do not reuse the demo credentials in production.</p>
      </section>
      <footer className="landing-footer"><span>ARENA / COMPETITIVE INTELLIGENCE</span><span>FOLLOW THE CLIMB <b>↗</b></span></footer>
    </main>;
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup sidebar-brand"><span className="brand-symbol">A<span>+</span></span><span><strong>ARENA<span>RANK</span></strong><small>COMPETITIVE INTELLIGENCE</small></span></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav">
        {NAV.filter((item) => !item.adminOnly || user.role === 'ADMIN').map((item) => <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'admin' && <span className="nav-admin">ADMIN</span>}</button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="season-card"><div className="season-card-top"><span className="tiny-orbit">◉</span><span className="live-tag">LIVE SEASON</span></div><strong>{dashboard?.activeSeason?.name || 'No active season'}</strong><small>{dashboard?.games?.length || 0} competitive titles enabled</small><div className="season-progress"><span /></div></div>
      <div className="sidebar-profile"><span className="profile-avatar">{initials(user.displayName)}</span><span className="profile-copy"><strong>{user.displayName}</strong><small>{user.role === 'ADMIN' ? 'Platform administrator' : `@${user.username}`}</small></span><button aria-label="Sign out" className="logout-button" onClick={handleLogout} title="Sign out">↪</button></div>
    </aside>

    <section className="main-workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>ARENA /</span> {view.replace('-', ' ').toUpperCase()}</div>
        <div className="topbar-right"><span className="system-status"><i /> DATABASES ONLINE</span><span className="sync-status">{refreshing ? 'SYNCING…' : lastUpdated ? `SYNCED ${relativeTime(lastUpdated, now)}` : 'WAITING FOR DATA'}</span><div className="topbar-divider" /><button className="topbar-user" onClick={() => setView(user.role === 'ADMIN' ? 'admin' : 'overview')}><span className="mini-avatar">{initials(user.displayName)}</span><span>{user.displayName}</span><span className="chevron">⌄</span></button></div>
      </header>

      <div className="page-content">
        {notice && <div className={`notice global-notice ${notice.kind}`}><span>{notice.kind === 'error' ? '!' : notice.kind === 'success' ? '✓' : 'i'}</span>{notice.text}<button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}
        <div className="page-heading-row">
          <div><div className="eyebrow">{dashboard?.activeSeason?.name || 'SEASON NOT CONFIGURED'} <span className="eyebrow-line" /></div><h1>{view === 'overview' ? <>Competitive <em>overview.</em></> : view === 'leaderboard' ? <>Rankings that <em>matter.</em></> : view === 'matchmaking' ? <>Find your <em>rival.</em></> : view === 'matches' ? <>Every match tells <em>a story.</em></> : <>Platform <em>control.</em></>}</h1><p className="heading-subtitle">{view === 'overview' ? 'Your performance, current standing, and the next opportunity to climb.' : view === 'leaderboard' ? 'Explore player performance by game, season, rating, and win rate.' : view === 'matchmaking' ? 'Match with a player near your current Elo rating.' : view === 'matches' ? 'Review completed results and official matches waiting for verification.' : 'Monitor pending match results and review the recent activity audit trail.'}</p></div>
          <div className="heading-actions"><label className="game-select-label">COMPETITIVE TITLE<select value={activeGame?.id || ''} onChange={(e) => setGameId(Number(e.target.value))} aria-label="Select competitive game">{(dashboard?.games || []).map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><button className={`icon-button refresh-button ${refreshing ? 'is-refreshing' : ''}`} title="Refresh data" onClick={() => void loadDashboard(true)} disabled={loading || refreshing}>↻</button></div>
        </div>

        {loading && !dashboard ? <div className="loading-panel"><span className="loader" /><span>Loading competitive data…</span></div> : <>
          {view === 'overview' && <>
            <div className="hero-panel">
              <div className="hero-text"><div className="hero-kicker"><span className="hero-pip" /> YOUR COMPETITIVE SNAPSHOT</div><h2>{user.role === 'ADMIN' ? 'Keep the competition fair.' : <>Make every round<br /><em>count.</em></>}</h2><p>{user.role === 'ADMIN' ? 'Review pending results, monitor platform activity, and keep Elo ratings consistent.' : 'Queue into a balanced match, improve your rating, and make your name on the board.'}</p><button className="hero-button" onClick={() => setView(user.role === 'ADMIN' ? 'admin' : 'matchmaking')}>{user.role === 'ADMIN' ? 'Review admin console' : 'Find a match'} <span>↗</span></button></div>
              <div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-ring ring-three"/><div className="art-cross cross-one"/><div className="art-cross cross-two"/><div className="art-core"><span>AR</span><small>RANKED</small></div><div className="art-label art-label-top">ELO SYSTEM <b>●</b></div><div className="art-label art-label-bottom">SKILL MATCHING <b>↗</b></div></div>
              <div className="hero-watermark">ARENA</div>
            </div>
            <div className="stats-grid">
              <div className="stat-card stat-primary"><div className="stat-top"><span>YOUR ELO RATING</span><span className="stat-icon">↗</span></div><div className="stat-value">{dashboard?.stats ? number(dashboard.stats.rating).toLocaleString() : '—'}<small> ELO</small></div><div className="stat-foot"><span className="rating-chip">{dashboard?.stats ? `Peak ${number(dashboard.stats.peak_rating).toLocaleString()}` : 'Play to establish rating'}</span><span>Current season</span></div><div className="stat-mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
              <div className="stat-card"><div className="stat-top"><span>MATCHES PLAYED</span><span className="stat-icon neutral">◷</span></div><div className="stat-value">{dashboard?.stats ? number(dashboard.stats.games_played).toLocaleString() : '0'}</div><div className="stat-foot"><span>Official results</span><span className="stat-soft">↗ Live ledger</span></div><div className="stat-bottom-line"><span style={{ width: `${Math.min(100, number(dashboard?.stats?.games_played) * 5)}%` }} /></div></div>
              <div className="stat-card"><div className="stat-top"><span>WIN RATE</span><span className="stat-icon neutral">⌁</span></div><div className="stat-value">{dashboard?.stats?.win_rate_pct != null ? `${number(dashboard.stats.win_rate_pct).toFixed(1)}%` : '—'}</div><div className="stat-foot"><span>{dashboard?.stats ? `${number(dashboard.stats.wins)} wins · ${number(dashboard.stats.losses)} losses` : 'No completed matches yet'}</span><span className="stat-soft">Current title</span></div><div className="stat-bottom-line"><span style={{ width: `${Math.max(0, Math.min(100, number(dashboard?.stats?.win_rate_pct)))}%` }} /></div></div>
              <div className="stat-card"><div className="stat-top"><span>QUEUE STATUS</span><span className="stat-icon neutral">⌘</span></div><div className="stat-value stat-value-word">{dashboard?.queue ? 'IN QUEUE' : 'READY'}</div><div className="stat-foot"><span>{dashboard?.queue ? `${dashboard.queue.game_name} · ${dashboard.queue.rating_snapshot} Elo` : `${number(dashboard?.queueCount)} waiting for ${activeGame?.name || 'a game'}`}</span><span className="stat-soft">{dashboard?.queue ? `${queueAge} elapsed` : 'Matchmaking'}</span></div><div className="stat-bottom-line"><span style={{ width: dashboard?.queue ? '72%' : '22%' }} /></div></div>
            </div>
            <div className="content-grid overview-grid">
              <section className="panel leaderboard-panel"><div className="panel-heading"><div><span className="panel-overline">PERFORMANCE INDEX</span><h3>Top contenders</h3></div><button className="text-link" onClick={() => setView('leaderboard')}>Full leaderboard <span>↗</span></button></div><LeaderboardTable rows={(dashboard?.leaderboard || []).slice(0, 5)} highlightUserId={user.id} /></section>
              <section className="panel queue-panel"><div className="panel-heading"><div><span className="panel-overline">QUICK MATCH</span><h3>Queue up</h3></div><span className="live-indicator"><i /> LIVE</span></div><div className="queue-graphic"><div className="queue-circle q-one"/><div className="queue-circle q-two"/><div className="queue-center">⌘</div><span className="queue-coordinate coord-a">RATING<br /><b>±{MAX_RATING_GAP_LABEL}</b></span><span className="queue-coordinate coord-b">WAITING<br /><b>{number(dashboard?.queueCount).toString().padStart(2, '0')}</b></span></div><p className="queue-caption">We prioritize players close to your Elo rating, then prefer the player who has waited longest.</p>{user.role === 'PLAYER' ? <button className="primary-button full-button" onClick={() => void (dashboard?.queue ? leaveQueue() : joinQueue())} disabled={busy}>{dashboard?.queue ? 'Leave matchmaking queue' : 'Join matchmaking queue'} <span>{dashboard?.queue ? '×' : '↗'}</span></button> : <button className="primary-button full-button" onClick={() => setView('admin')}>Review pending matches <span>↗</span></button>}<div className="queue-foot"><span><i /> SQL TRANSACTIONAL QUEUE</span><span>{activeGame?.name || 'No game'}</span></div></section>
            </div>
            <section className="panel recent-panel"><div className="panel-heading"><div><span className="panel-overline">LATEST ACTIVITY</span><h3>Recent matches</h3></div><button className="text-link" onClick={() => setView('matches')}>View match history <span>↗</span></button></div><MatchTable matches={(dashboard?.matches || []).slice(0, 5)} compact onResult={recordResult} role={user.role} busy={busy} /></section>
          </>}

          {view === 'leaderboard' && <section className="panel full-panel"><div className="panel-heading"><div><span className="panel-overline">RANKED BY ELO · {dashboard?.activeSeason?.name || 'NO ACTIVE SEASON'}</span><h3>{activeGame?.name || 'Competitive'} leaderboard</h3></div><span className="row-count">{leaderboardRows.length} PLAYERS</span></div><div className="table-tools"><label className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search handles or player names…" aria-label="Search leaderboard" /></label><span className="table-hint">Sorted by rating, then wins</span></div><LeaderboardTable rows={leaderboardRows} highlightUserId={user.id} /></section>}

          {view === 'matchmaking' && <div className="matchmaking-layout"><section className="panel matchmaking-main"><span className="panel-overline">RATING-AWARE PAIRING</span><h3>Find your next opponent.</h3><p className="panel-copy">The queue compares your rating with available players in the same game and season. A match is created only when the rating gap is within {MAX_RATING_GAP_LABEL} Elo.</p><div className="matchmaking-score"><div><span>YOUR RATING</span><strong>{dashboard?.stats ? number(dashboard.stats.rating).toLocaleString() : '1,000'}</strong><small>{activeGame?.name || 'Selected game'}</small></div><span className="versus">VS</span><div><span>PAIRING WINDOW</span><strong>±300</strong><small>Maximum rating gap</small></div></div><div className={`queue-state-card ${dashboard?.queue ? 'queued' : ''}`}><span className="queue-state-icon">{dashboard?.queue ? '◌' : '⌘'}</span><div><strong>{dashboard?.queue ? 'You are waiting for a match' : 'You are not queued'}</strong><small>{dashboard?.queue ? `Joined ${dateLabel(dashboard.queue.joined_at)} · ${dashboard.queue.game_name}` : 'Join the queue to find a compatible opponent.'}</small></div><span className="queue-state-live">{dashboard?.queue ? 'SEARCHING' : 'READY'}</span></div>{user.role === 'PLAYER' && <button className="primary-button" disabled={busy} onClick={() => void (dashboard?.queue ? leaveQueue() : joinQueue())}>{dashboard?.queue ? 'Leave queue' : 'Join matchmaking'} <span>↗</span></button>}<div className="rule-list"><div><span className="rule-num">01</span><p><strong>Same competitive title</strong><small>Players must queue for the same game.</small></p></div><div><span className="rule-num">02</span><p><strong>Same active season</strong><small>Season ratings are kept separate.</small></p></div><div><span className="rule-num">03</span><p><strong>Rating-first selection</strong><small>Closest Elo gap wins; queue age breaks ties.</small></p></div></div></section><section className="panel waiting-panel"><div className="panel-heading"><div><span className="panel-overline">MATCHMAKING POOL</span><h3>Queue monitor</h3></div><span className="queue-count">{number(dashboard?.queueCount).toString().padStart(2, '0')} WAITING</span></div><div className="waiting-visual"><div className="waiting-grid"/><div className="waiting-orbit orbit-a"/><div className="waiting-orbit orbit-b"/><div className="waiting-node node-a">P1</div><div className="waiting-node node-b">P2</div><div className="waiting-center">{number(dashboard?.queueCount)}</div><span className="waiting-label">PLAYERS IN {activeGame?.slug?.toUpperCase() || 'QUEUE'}</span></div><div className="waiting-stats"><div><span>Compatible now</span><strong>{dashboard?.queue && number(dashboard.queueCount) > 1 ? 'Potential pair' : 'Checking'}</strong></div><div><span>Search window</span><strong>±300 Elo</strong></div><div><span>Queue strategy</span><strong>Nearest skill</strong></div></div><p className="muted-note">Only queue counts and your own queue status are exposed to player accounts. The full queue is not publicly enumerable.</p></section></div>}

          {view === 'matches' && <section className="panel full-panel"><div className="panel-heading"><div><span className="panel-overline">OFFICIAL MATCH LEDGER</span><h3>Match history</h3></div><span className="row-count">{(dashboard?.matches || []).length} RECORDS</span></div><div className="match-summary-strip"><div><span>COMPLETED</span><strong>{completedMatches.length}</strong></div><div><span>PENDING</span><strong>{(dashboard?.matches || []).filter((match) => match.status === 'PENDING').length}</strong></div><div><span>SELECTED TITLE</span><strong>{activeGame?.name || '—'}</strong></div></div><MatchTable matches={dashboard?.matches || []} onResult={recordResult} role={user.role} busy={busy} /></section>}

          {view === 'admin' && user.role === 'ADMIN' && <div className="admin-layout"><section className="panel admin-matches"><div className="panel-heading"><div><span className="panel-overline">ADMINISTRATION</span><h3>Pending match results</h3></div><span className="pending-count">{dashboard?.pendingMatches.length || 0} TO VERIFY</span></div><p className="panel-copy">Choose the official winner for each pending match. Elo changes, match status, match result, and the two rating-history entries are committed atomically by PostgreSQL.</p>{dashboard?.pendingMatches.length ? <div className="pending-list">{dashboard.pendingMatches.map((match) => <div className="pending-match" key={match.id}><div className="pending-match-meta"><span>{match.game_name}</span><span>{compactDate(match.created_at)}</span><StatusPill status={match.status} /></div><div className="pending-contestants"><PlayerIdentity name={match.player_a_name} username={match.player_a_username} compact /><span className="versus small">VS</span><PlayerIdentity name={match.player_b_name} username={match.player_b_username} compact /></div><div className="winner-actions"><button disabled={busy} onClick={() => void recordResult(match.id, match.player_a_id, match.player_a_name)}>Declare {match.player_a_name} winner</button><button disabled={busy} onClick={() => void recordResult(match.id, match.player_b_id, match.player_b_name)}>Declare {match.player_b_name} winner</button></div></div>)}</div> : <div className="empty-state"><span>✓</span><strong>All caught up</strong><p>There are no pending match results to finalize.</p></div>}</section><section className="panel audit-panel"><div className="panel-heading"><div><span className="panel-overline">MONGODB · AUDIT EVENTS</span><h3>Recent platform activity</h3></div><span className="mongo-chip">NOSQL</span></div><p className="panel-copy">Append-only activity events are stored as flexible MongoDB documents, separate from transactional match records.</p><div className="audit-list">{(dashboard?.recentAuditEvents || []).map((event, index) => <div className="audit-item" key={`${event.action}-${event.createdAt}-${index}`}><span className="audit-icon">{event.action.includes('match') ? '⚔' : event.action.includes('queue') ? '⌘' : '◉'}</span><div><strong>{event.action.replaceAll('.', ' ')}</strong><small>{event.actorUsername ? `@${event.actorUsername}` : 'System'} · {event.entityType}</small></div><time>{compactDate(event.createdAt)}</time></div>)}{!dashboard?.recentAuditEvents.length && <div className="empty-state compact-empty">No audit events yet. Sign-in, queue, and result actions will be recorded here.</div>}</div><div className="mongo-note"><span>◇</span><p><strong>Flexible by design</strong><small>Game telemetry can add map, round, duration, and game-specific metrics without changing the relational schema.</small></p></div></section></div>}
        </>}
        <footer className="page-footer"><span>ARENARANK <b>·</b> DBMS EXPERIENTIAL LEARNING LEVEL 3</span><span>POSTGRESQL <i /> MONGODB <i /> NEXT.JS</span></footer>
      </div>
    </section>
  </main>;
}

const MAX_RATING_GAP_LABEL = '300';

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function relativeTime(value: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - value.getTime()) / 1000));
  if (seconds < 5) return 'JUST NOW';
  if (seconds < 60) return `${seconds}S AGO`;
  return `${Math.floor(seconds / 60)}M AGO`;
}

function LeaderboardTable({ rows, highlightUserId }: { rows: PlayerRow[]; highlightUserId: string }) {
  if (!rows.length) return <div className="empty-state"><span>⌕</span><strong>No players found</strong><p>Try another name or make sure a season is active.</p></div>;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>RANK / PLAYER</th><th>REGION</th><th>RATING</th><th>W / L</th><th>WIN RATE</th><th>GAMES</th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id} className={row.user_id === highlightUserId ? 'current-user-row' : ''}><td><div className="rank-player"><span className={`rank-number rank-${row.rank_position <= 3 ? row.rank_position : 'other'}`}>{String(row.rank_position).padStart(2, '0')}</span><PlayerIdentity name={row.display_name} username={row.username} /></div></td><td><span className="region-tag">{row.region || 'APAC'}</span></td><td><strong className="rating-number">{number(row.rating).toLocaleString()}</strong><small className="table-subtext">Peak {number(row.peak_rating).toLocaleString()}</small></td><td><span className="record-text"><b>{number(row.wins)}</b><i>/</i>{number(row.losses)}</span></td><td><div className="winrate-cell"><span>{row.win_rate_pct == null ? '—' : `${number(row.win_rate_pct).toFixed(1)}%`}</span><div className="micro-progress"><span style={{ width: `${Math.max(0, Math.min(100, number(row.win_rate_pct)))}%` }} /></div></div></td><td><span className="games-count">{number(row.games_played).toLocaleString()}</span></td></tr>)}</tbody></table></div>;
}

function MatchTable({ matches, compact = false, onResult, role, busy }: { matches: MatchRow[]; compact?: boolean; onResult: (matchId: string, winnerId: string, winnerName: string) => void; role: User['role']; busy: boolean }) {
  if (!matches.length) return <div className="empty-state"><span>◷</span><strong>No match records yet</strong><p>Join matchmaking to create your first competitive fixture.</p></div>;
  return <div className="table-wrap"><table className="data-table match-table"><thead><tr><th>FIXTURE</th><th>GAME / SEASON</th><th>RESULT</th><th>DATE</th>{!compact && <th>STATUS</th>}</tr></thead><tbody>{matches.map((match) => <tr key={match.id}><td><div className="fixture-cell"><div className="fixture-teams"><span>{match.player_a_name}</span><small>vs</small><span>{match.player_b_name}</span></div><small className="match-id">#{match.id.slice(0, 8).toUpperCase()}</small></div></td><td><strong className="game-cell">{match.game_name}</strong><small className="table-subtext">{match.season_name}</small></td><td>{match.status === 'COMPLETED' ? <div className="result-cell"><strong>{match.winner_name || match.winner_username || 'Winner'}</strong><small>{match.player_a_rating_before != null ? `${match.player_a_rating_before} → ${match.player_a_rating_after}` : 'Elo calculated'}</small></div> : <div className="result-cell pending-result"><strong>{match.status === 'PENDING' ? 'Awaiting result' : 'Cancelled'}</strong>{role === 'ADMIN' && match.status === 'PENDING' && <div className="inline-winner-actions"><button disabled={busy} onClick={() => onResult(match.id, match.player_a_id, match.player_a_name)}>A wins</button><button disabled={busy} onClick={() => onResult(match.id, match.player_b_id, match.player_b_name)}>B wins</button></div>}</div>}</td><td><span className="date-cell">{dateLabel(match.completed_at || match.created_at)}</span></td>{!compact && <td><StatusPill status={match.status} /></td>}</tr>)}</tbody></table></div>;
}
