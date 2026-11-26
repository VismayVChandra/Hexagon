import { useEffect, useRef } from 'react';
import { HashRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { dismissSummary, heartbeat, initStore, isDemoMode, removeDemoData, resolveAway, startFresh, updateSettings, useStore, watchOtherTabs } from './store/store';
import { useApplyTheme, useResolvedTheme } from './lib/theme';
import { showToast, useNow, useToasts } from './hooks/hooks';
import { computeView } from './lib/timer';
import { formatClock, formatTimeOfDay } from './lib/time';
import { Icon, Logo } from './components/Icon';
import { Dialog } from './components/Dialog';
import { SubjectDot } from './components/bits';
import Home from './pages/Home';
import Study from './pages/Study';
import Session from './pages/Session';
import Progress from './pages/Progress';
import Friends from './pages/Friends';
import Exams from './pages/Exams';
import SettingsPage from './pages/Settings';

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="splash" role="status">
      <Logo size={56} />
      {children ?? <p className="muted">Opening your study space…</p>}
    </div>
  );
}

function ToastHost() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ResumeBar() {
  const { data } = useStore();
  const active = data.active;
  const now = useNow(!!active && !!active.resumedAt, 1000);
  const loc = useLocation();
  if (!active || loc.pathname === '/session') return null;
  const v = computeView(active, now);
  const subject = data.subjects.find((s) => s.id === active.subjectId);
  const label = v.done ? 'Time’s up' : v.phase === 'break' ? 'On a break' : v.running ? 'Studying' : 'Paused';
  return (
    <Link to="/session" className="resume-bar">
      <SubjectDot subject={subject} size={12} />
      <span className="resume-text">
        <strong>{label}</strong> · {subject?.name ?? 'Session'}
      </span>
      <span className="resume-time" aria-label={`Timer ${formatClock(v.displayMs)}`}>
        {formatClock(v.displayMs)}
      </span>
      <span className="resume-go">
        Return <Icon name="chevron" size={16} />
      </span>
    </Link>
  );
}

function Shell() {
  const { data, persistFailed, storageKind, away } = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  const redirected = useRef(false);
  const active = data.active;
  const inSession = loc.pathname === '/session';
  const theme = useResolvedTheme(data.settings.theme);
  const toggleTheme = () => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });

  // Session recovery: if the app opens with a session in progress, take the student straight back to it.
  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    if (active && loc.pathname !== '/session') navigate('/session', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat: lets us notice if the app was closed for a long time while a session was "running".
  const running = !!active && active.resumedAt != null;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => heartbeat(), 15_000);
    const onHide = () => heartbeat();
    const onVis = () => document.visibilityState === 'hidden' && heartbeat();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running]);

  // The celebration card is shown once: drop it when the student moves on from Home.
  useEffect(() => {
    if (loc.pathname !== '/') dismissSummary();
  }, [loc.pathname]);

  // Move focus to the page heading on route change, for keyboard and screen-reader users.
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className={`shell${inSession ? ' shell-session' : ''}`}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Hexagon home">
          <Logo size={26} />
          <span>Hexagon</span>
        </Link>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <NavLink to="/" end className="nav-link">
            <Icon name="home" />
            <span>Home</span>
          </NavLink>
          <NavLink to="/progress" className="nav-link">
            <Icon name="chart" />
            <span>Progress</span>
          </NavLink>
          <NavLink to={active ? '/session' : '/study'} className="nav-study" aria-label={active ? 'Return to session' : 'Start studying'}>
            <span className="nav-study-hex">
              <Icon name={active ? 'clock' : 'play'} size={22} />
            </span>
            <span>{active ? 'Session' : 'Study'}</span>
          </NavLink>
          <NavLink to="/friends" className="nav-link">
            <Icon name="users" />
            <span>Friends</span>
          </NavLink>
          <NavLink to="/exams" className="nav-link">
            <Icon name="calendar" />
            <span>Exams</span>
          </NavLink>
          <NavLink to="/settings" className="nav-link nav-settings">
            <Icon name="settings" />
            <span>Settings</span>
          </NavLink>
        </div>
      </nav>

      <main id="main" ref={mainRef} tabIndex={-1} className="main">
        {isDemoMode(data) && !inSession && (
          <div className="demo-strip" role="note">
            <span className="badge badge-demo">Demo</span>
            <p>Sample data to explore. Your first session, subject or exam starts a fresh space of your own.</p>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                removeDemoData();
                showToast('Sample data cleared. This is your own fresh space now.', 'info');
              }}
            >
              Start fresh now
            </button>
          </div>
        )}
        {persistFailed && (
          <div className="banner banner-warn" role="alert">
            <Icon name="alert" />
            <p>
              {storageKind === 'memory'
                ? 'Your browser is blocking storage, so nothing will be kept after you close this tab.'
                : 'We couldn’t save your latest changes — storage may be full or blocked. Export your data in Settings to be safe.'}
            </p>
          </div>
        )}
        <Outlet />
      </main>

      <ResumeBar />
      <ToastHost />

      <Dialog open={!!away} onClose={() => resolveAway('keep')} title="Welcome back" small dismissible={false}>
        {away && active && (
          <>
            <p>
              Your session was still running when you left at <strong>{formatTimeOfDay(away.lastSeenAt)}</strong>. How should we count the time since then?
            </p>
            <div className="dialog-actions dialog-actions-stack">
              <button type="button" className="btn btn-primary" onClick={() => resolveAway('keep')}>
                Keep counting — I was studying
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => resolveAway('stop')}>
                Stop at {formatTimeOfDay(away.lastSeenAt)}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function Gate() {
  const { status, loadError, data } = useStore();
  // Only apply once the saved choice has loaded; until then the pre-paint script in index.html decides.
  useApplyTheme(status === 'ready' ? data.settings.theme : null);

  useEffect(() => {
    void initStore();
    return watchOtherTabs();
  }, []);

  if (status === 'loading') return <Splash />;
  if (status === 'error') {
    return (
      <Splash>
        <div className="error-panel" role="alert">
          <h1>We couldn’t open your data</h1>
          <p className="muted">
            {loadError?.kind === 'corrupt'
              ? 'The saved study data looks damaged. You can start fresh — the unreadable copy is kept aside in this browser, not deleted.'
              : 'This browser isn’t letting Hexagon read its storage. Check that cookies/site data aren’t blocked and try again.'}
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void initStore()}>
              Try again
            </button>
            {loadError?.kind === 'corrupt' && (
              <button type="button" className="btn btn-quiet" onClick={() => void startFresh()}>
                Start fresh
              </button>
            )}
          </div>
        </div>
      </Splash>
    );
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="study" element={<Study />} />
        <Route path="session" element={<Session />} />
        <Route path="progress" element={<Progress />} />
        <Route path="friends" element={<Friends />} />
        <Route path="exams" element={<Exams />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}
