import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import TaskCard from './components/TaskCard';
import EditTaskModal from './components/EditTaskModal';
import MonthCalendarView, { type PreviewPlacement } from './components/MonthCalendarView';
import SettingsView from './components/SettingsView';
import HabitsView from './components/HabitsView';
import StatsView from './components/StatsView';
import PomodoroTimer from './components/PomodoroTimer';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { usePomodoroContext } from './context/PomodoroContext';
import AddTaskModal from './components/AddTaskModal';
import LandingPage from './components/LandingPage';
import {
  fetchTasks,
  fetchCategories,
  fetchContexts,
  clearCompletedTasks,
  getScheduleSuggestions,
  applySchedule,
  completeTask,
  skipTask,
  rescheduleTask,
  deleteTask,
  fetchHabits,
  pinTask,
  loginUser,
  register,
  type Task,
  type Category,
  type Context,
  type Habit,
} from './lib/api';
import { localDateKey, parseUTC } from './lib/date';

type ScheduleSuggestion = {
  name: string;
  description: string;
  placements: Record<string, { task_id: string; title: string; start: string; end: string; duration: number }>;
  score: number;
  placed: number;
  total: number;
};

export default function App() {
  const { addToast } = useToast();
  const { user: authUser, login: authLogin, logout: authLogout, isLoading: authIsLoading } = useAuth();
  const { start: startPomodoro } = usePomodoroContext();

  const [showLanding, setShowLanding] = useState(true);

  // Auth form state
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authInviteCode, setAuthInviteCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [contexts, setContexts] = useState<Context[] | null>(null);
  const [habits, setHabits] = useState<Habit[] | null>(null);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);

  // ── URL-based routing ──────────────────────────────────────────────────
  // Paths are relative to Vite's BASE_URL so this also works when the app is
  // served from a subpath (e.g. GitHub Pages' /planit/ project-page path).
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
  const TAB_PATHS: Record<string, string> = {
    dashboard: `${BASE}/`,
    tasks:     `${BASE}/tasks`,
    calendar:  `${BASE}/calendar`,
    habits:    `${BASE}/habits`,
    stats:     `${BASE}/stats`,
    settings:  `${BASE}/settings`,
  };
  const PATH_TABS: Record<string, string> = Object.fromEntries(
    Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab]),
  );

  function tabFromPath(): string {
    return PATH_TABS[window.location.pathname] ?? 'dashboard';
  }

  const [activeTab, setActiveTab] = useState(tabFromPath);

  useEffect(() => {
    const onPop = () => setActiveTab(tabFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(tab: string) {
    const path = TAB_PATHS[tab] ?? '/';
    if (window.location.pathname !== path) history.pushState(null, '', path);
    setActiveTab(tab);
  }
  // ───────────────────────────────────────────────────────────────────────

  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'scheduled' | 'unscheduled' | 'completed'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[] | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  type PreviewState = { suggestionIndex: number; strategyName: string; placements: PreviewPlacement[] };
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    (categories ?? []).forEach((c) => map.set(c.name, c.color));
    return map;
  }, [categories]);

  const tasksByCategory = useMemo(() => {
    const statusOrder = (s: string) => s === 'scheduled' ? 0 : s === 'unscheduled' ? 1 : 2;
    const sorted = [...(tasks ?? [])].sort((a, b) => statusOrder(a.status) - statusOrder(b.status));
    const groups: { key: string; label: string; color: string | undefined; tasks: Task[] }[] = [];
    const seen = new Set<string>();
    for (const cat of (categories ?? [])) {
      const catTasks = sorted.filter((t) => t.category_name === cat.name);
      if (catTasks.length > 0) {
        groups.push({ key: cat.id, label: cat.name, color: cat.color, tasks: catTasks });
        seen.add(cat.name);
      }
    }
    const uncategorized = sorted.filter((t) => !t.category_name || !seen.has(t.category_name));
    if (uncategorized.length > 0) {
      groups.push({ key: '__none__', label: 'No category', color: undefined, tasks: uncategorized });
    }
    return groups;
  }, [tasks, categories]);

  const todayKey = localDateKey(new Date());
  const todayTasks = useMemo(() =>
    (tasks ?? [])
      .filter((t) => t.status === 'scheduled' && t.scheduled_start_at && localDateKey(parseUTC(t.scheduled_start_at)) === todayKey)
      .sort((a, b) => parseUTC(a.scheduled_start_at!).getTime() - parseUTC(b.scheduled_start_at!).getTime()),
    [tasks, todayKey],
  );

  const dueHabitsCount = useMemo(() => (habits ?? []).filter((h) => h.is_due).length, [habits]);

  const overdueTasks = useMemo(() => {
    const now = new Date();
    return (tasks ?? []).filter(
      (t) => t.status === 'scheduled' && t.scheduled_end_at && parseUTC(t.scheduled_end_at) < now,
    );
  }, [tasks]);

  const upcomingDeadlines = useMemo(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return (tasks ?? []).filter(
      (t) =>
        t.deadline_at &&
        t.status !== 'completed' &&
        t.status !== 'skipped' &&
        parseUTC(t.deadline_at) > now &&
        parseUTC(t.deadline_at) <= in24h,
    );
  }, [tasks]);

  function loadTasks()      { fetchTasks().then(setTasks).catch(() => {}); }
  function loadCategories() { fetchCategories().then(setCategories).catch(() => {}); }
  function loadContexts()   { fetchContexts().then(setContexts).catch(() => {}); }
  function loadHabits()     { fetchHabits().then(setHabits).catch(() => {}); }

  useEffect(() => {
    if (authUser) { loadTasks(); loadCategories(); loadContexts(); loadHabits(); }
  }, [authUser]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const data = await loginUser(authUsername, authPassword);
      authLogin({ user_id: data.user_id, username: data.username, display_name: data.display_name });
    } catch (err) {
      setAuthError(String(err).replace('Error: ', ''));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const data = await register(authUsername, authPassword, authDisplayName, authInviteCode);
      authLogin({ user_id: data.user_id, username: data.username, display_name: data.display_name });
    } catch (err) {
      setAuthError(String(err).replace('Error: ', ''));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleClearCompleted() {
    if (!confirm('Clear all completed tasks?')) return;
    try {
      const res = await clearCompletedTasks();
      addToast(res.message, 'success');
      loadTasks();
    } catch {
      addToast('Failed to clear completed tasks', 'error');
    }
  }

  async function loadSuggestions() {
    setIsLoadingSuggestions(true);
    setSuggestions(null);
    try {
      const data = await getScheduleSuggestions();
      if (data.suggestions.length === 0) {
        addToast('No unscheduled tasks to plan.', 'info');
      } else {
        setSuggestions(data.suggestions as ScheduleSuggestion[]);
      }
    } catch (err) {
      addToast('Failed to load suggestions: ' + String(err), 'error');
    } finally {
      setIsLoadingSuggestions(false);
    }
  }

  async function applySuggestion(index: number) {
    setIsApplying(true);
    try {
      const res = await applySchedule(index);
      addToast(res.message, 'success');
      setSuggestions(null);
      setPreview(null);
      loadTasks();
    } catch {
      addToast('Failed to apply schedule', 'error');
    } finally {
      setIsApplying(false);
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      await completeTask(taskId);
      addToast('Task completed ✓', 'success');
      loadTasks();
    } catch {
      addToast('Failed to complete task', 'error');
    }
  }

  async function handleSkipTask(taskId: string) {
    try {
      await skipTask(taskId);
      addToast('Task skipped', 'info');
      loadTasks();
    } catch {
      addToast('Failed to skip task', 'error');
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask(taskId);
      addToast('Task deleted', 'info');
      loadTasks();
    } catch {
      addToast('Failed to delete task', 'error');
    }
  }

  async function handlePinTask(taskId: string, isoStart: string) {
    try {
      await pinTask(taskId, isoStart);
      addToast('Task pinned to schedule', 'success');
      loadTasks();
    } catch {
      addToast('Failed to pin task', 'error');
    }
  }

  function handleEditTask(taskId: string) {
    const task = (tasks ?? []).find((t) => t.id === taskId);
    if (task) setEditingTask(task);
  }

  async function handleRescheduleTask(taskId: string) {
    try {
      await rescheduleTask(taskId);
      addToast('Task returned to backlog', 'info');
      loadTasks();
    } catch {
      addToast('Failed to reschedule task', 'error');
    }
  }

  /* ── Loading / Login screen ──────────────────────────── */
  if (authIsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!authUser && showLanding) {
    return (
      <LandingPage
        onLogin={() => { setAuthTab('login'); setShowLanding(false); }}
        onSignUp={() => { setAuthTab('register'); setShowLanding(false); }}
      />
    );
  }

  if (!authUser) {
    return (
      <div className="auth-shell">
        {/* ── Left brand panel ── */}
        <div className="auth-brand">
          <div className="auth-brand__inner">
            <p className="auth-brand__logo">planit</p>
            <h1 className="auth-brand__headline">Plan your time.<br />Protect your focus.</h1>
            <ul className="auth-brand__bullets">
              <li>Auto-schedule tasks around your calendar</li>
              <li>Respect deadlines, mental load &amp; sleep</li>
              <li>Track habits and build streaks</li>
              <li>Context-aware — schedule by location</li>
            </ul>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-card__head">
              <h2>{authTab === 'login' ? 'Welcome back' : 'Create account'}</h2>
              <p>
                {authTab === 'login' ? (
                  <>No account? <button type="button" className="auth-switch-btn" onClick={() => { setAuthTab('register'); setAuthError(null); }}>Sign up free →</button></>
                ) : (
                  <>Already have one? <button type="button" className="auth-switch-btn" onClick={() => { setAuthTab('login'); setAuthError(null); }}>Log in →</button></>
                )}
              </p>
            </div>

            {authTab === 'login' ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <div className="form-field">
                  <label className="field-label" htmlFor="loginUsername">Username</label>
                  <input
                    id="loginUsername"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="your-username"
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="loginPassword">Password</label>
                  <input
                    id="loginPassword"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {authError && <div className="panel-error">{authError}</div>}
                <button type="submit" className="auth-submit-btn" disabled={authSubmitting}>
                  {authSubmitting ? 'Signing in…' : 'Sign in →'}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleRegister}>
                <div className="form-field">
                  <label className="field-label" htmlFor="regUsername">Username</label>
                  <input
                    id="regUsername"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="your-username"
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="regDisplayName">
                    Display name <span className="field-optional">optional</span>
                  </label>
                  <input
                    id="regDisplayName"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    placeholder="What should we call you?"
                    autoComplete="name"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="regPassword">Password</label>
                  <input
                    id="regPassword"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="regInviteCode">
                    Invite code <span className="field-optional">not needed for the first account</span>
                  </label>
                  <input
                    id="regInviteCode"
                    value={authInviteCode}
                    onChange={(e) => setAuthInviteCode(e.target.value)}
                    placeholder="Ask whoever invited you"
                    autoCapitalize="characters"
                  />
                </div>
                {authError && <div className="panel-error">{authError}</div>}
                <button type="submit" className="auth-submit-btn" disabled={authSubmitting}>
                  {authSubmitting ? 'Creating account…' : 'Create account →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── App shell ────────────────────────────────────────── */
  const scheduledCount   = (tasks ?? []).filter(t => t.status === 'scheduled').length;
  const unscheduledCount = (tasks ?? []).filter(t => t.status === 'unscheduled').length;
  const completedCount   = (tasks ?? []).filter(t => t.status === 'completed').length;

  const todayFmt = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onTabChange={navigate} onLogout={authLogout} userName={authUser.display_name} />
      <main className="main-area">

        {/* ── Header ── */}
        <header className="main-header">
          <div className="main-header__meta">
            <p className="eyebrow mobile-hide">planit</p>
            <h2>
              <span className="mobile-greeting">
                {activeTab === 'dashboard' ? `Hi, ${authUser.display_name.split(' ')[0] || authUser.display_name}` :
                 activeTab === 'tasks'     ? 'Tasks' :
                 activeTab === 'calendar'  ? 'Calendar' :
                 activeTab === 'habits'    ? 'Habits' :
                 activeTab === 'stats'     ? 'Stats' : 'Settings'}
              </span>
              <span className="desktop-only">{authUser.display_name}</span>
            </h2>
            <p className="subtitle mobile-hide">
              {scheduledCount} scheduled · {unscheduledCount} unscheduled · {completedCount} completed
              {dueHabitsCount > 0 && ` · ${dueHabitsCount} habit${dueHabitsCount > 1 ? 's' : ''} due`}
            </p>
            <p className="mobile-subtext">
              {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {activeTab === 'dashboard' && (
            <div className="header-actions">
              <button type="button" className="btn-ghost desktop-only" onClick={() => setShowAddTask(true)}>
                + Add task
              </button>
              <button onClick={loadSuggestions} disabled={isLoadingSuggestions} className="plan-btn">
                {isLoadingSuggestions ? 'Loading…' : '✦ Plan my schedule'}
              </button>
            </div>
          )}
          {activeTab === 'tasks' && (
            <div className="header-actions desktop-only">
              <button type="button" className="btn-ghost" onClick={() => setShowAddTask(true)}>
                + Add task
              </button>
            </div>
          )}
        </header>

        {/* ── Content ── */}
        <section className="workspace-grid">

          {/* ═══ DASHBOARD ═══ */}
          {activeTab === 'dashboard' && (
            <>
              {/* Suggestions panel */}
              {suggestions && (
                <div className="suggestion-panel full-width">
                  <div className="panel-head">
                    <div>
                      <h3>Schedule suggestions</h3>
                      <p>Click a strategy to preview it on your calendar.</p>
                    </div>
                    <button
                      className="close-btn"
                      onClick={() => setSuggestions(null)}
                    >✕</button>
                  </div>
                  <div className="suggestions-list">
                    {suggestions.map((sugg, idx) => (
                      <div
                        key={idx}
                        className="suggestion-card"
                        onClick={() => {
                          setPreview({
                            suggestionIndex: idx,
                            strategyName: sugg.name,
                            placements: Object.values(sugg.placements),
                          });
                          navigate('calendar');
                        }}
                      >
                        <h4>{sugg.name}</h4>
                        <p>{sugg.description}</p>
                        <div className="suggestion-stats">
                          <span>{sugg.placed}/{sugg.total} tasks fit</span>
                          <span>Score {sugg.score.toFixed(0)}</span>
                        </div>
                        <span className="suggestion-card__cta">Preview on calendar →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming deadline warning */}
              {upcomingDeadlines.length > 0 && (
                <div className="deadline-banner full-width">
                  <div className="checkin-banner__title">
                    {upcomingDeadlines.length} task{upcomingDeadlines.length > 1 ? 's' : ''} due within 24 hours
                  </div>
                  {upcomingDeadlines.map((t) => {
                    const due = parseUTC(t.deadline_at!);
                    const diffH = Math.round((due.getTime() - Date.now()) / (1000 * 60 * 60));
                    return (
                      <div key={t.id} className="checkin-row">
                        <span className="checkin-row__title">{t.title}</span>
                        <span className="checkin-row__time">due in {diffH}h</span>
                        {t.status === 'unscheduled' && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--amber)' }}>not scheduled</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Check-in banner for overdue scheduled tasks */}
              {overdueTasks.length > 0 && (
                <div className="checkin-banner full-width">
                  <div className="checkin-banner__title">
                    {overdueTasks.length} task{overdueTasks.length > 1 ? 's' : ''} past their scheduled time — did you finish?
                  </div>
                  {overdueTasks.map((t) => (
                    <div key={t.id} className="checkin-row">
                      <span className="checkin-row__title">{t.title}</span>
                      <span className="checkin-row__time">
                        ended {parseUTC(t.scheduled_end_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        className="btn-ghost btn-sm"
                        style={{ color: 'var(--green)' }}
                        onClick={() => handleCompleteTask(t.id)}
                      >Done ✓</button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => handleRescheduleTask(t.id)}
                      >Reschedule</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Today panel */}
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Today</h3>
                    <p>{todayFmt}</p>
                  </div>
                  <span className="today-count-badge">
                    {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {todayTasks.length === 0 ? (
                  <div className="panel-empty">
                    {unscheduledCount > 0
                      ? `${unscheduledCount} unscheduled task${unscheduledCount > 1 ? 's' : ''} — run a plan to fill your day.`
                      : 'Nothing scheduled for today. Enjoy the free time.'}
                  </div>
                ) : (
                  <div className="today-list">
                    {todayTasks.map((t) => {
                      const color = categoryColorMap.get(t.category_name ?? '') ?? 'var(--accent)';
                      const start = parseUTC(t.scheduled_start_at!);
                      const end   = new Date(start.getTime() + t.duration_minutes * 60000);
                      const fmt   = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      return (
                        <div key={t.id} className="today-task-row">
                          <div className="today-task-stripe" style={{ background: color }} />
                          <div className="today-task-body">
                            <span className="today-task-title">{t.title}</span>
                            {t.category_name && (
                              <span className="today-task-cat" style={{ color }}>{t.category_name}</span>
                            )}
                          </div>
                          <div className="today-task-time">
                            <span>{fmt(start)}</span>
                            <span className="today-task-time__end">→ {fmt(end)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Stats panel */}
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Overview</h3>
                    <p>All time stats</p>
                  </div>
                </div>
                <div className="stats-grid">
                  <div className="stat-box">
                    <div className="stat-number">{scheduledCount}</div>
                    <div className="stat-label">Scheduled</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-number">{unscheduledCount}</div>
                    <div className="stat-label">Unscheduled</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-number">{completedCount}</div>
                    <div className="stat-label">Completed</div>
                  </div>
                </div>

                {dueHabitsCount > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '10px 14px',
                      background: 'var(--amber-bg)',
                      border: '1px solid var(--amber-light, #f5dea0)',
                      borderRadius: 10,
                      fontSize: '0.88rem',
                      color: 'var(--amber)',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    onClick={() => navigate('habits')}
                  >
                    {dueHabitsCount} habit{dueHabitsCount > 1 ? 's' : ''} due — tap to check in →
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ TASKS ═══ */}
          {activeTab === 'tasks' && (() => {
            const q = taskSearch.trim().toLowerCase();
            const filteredGroups = tasksByCategory
              .map((group) => ({
                ...group,
                tasks: group.tasks.filter((t) => {
                  const matchesFilter = taskFilter === 'all' || t.status === taskFilter;
                  const matchesSearch = !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
                  return matchesFilter && matchesSearch;
                }),
              }))
              .filter((g) => g.tasks.length > 0);

            return (
              <div className="tasks-page">
                <div className="tasks-page__header">
                  <div>
                    <h3>Tasks</h3>
                    <p className="subtitle">
                      {scheduledCount} scheduled · {unscheduledCount} unscheduled · {completedCount} completed
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-ghost btn-sm" onClick={handleClearCompleted}>
                      Clear completed
                    </button>
                    <button type="button" onClick={() => setShowAddTask(true)}>
                      + Add task
                    </button>
                  </div>
                </div>

                {/* Search + filter toolbar */}
                <div className="tasks-toolbar">
                  <input
                    className="tasks-search"
                    placeholder="Search tasks…"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                  />
                  <div className="tasks-filter-pills">
                    {(['all', 'scheduled', 'unscheduled', 'completed'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`filter-pill${taskFilter === f ? ' filter-pill--active' : ''}`}
                        onClick={() => setTaskFilter(f)}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {tasks === null ? (
                  <div className="panel-loading">Loading tasks…</div>
                ) : tasks.length === 0 ? (
                  <div className="tasks-empty">
                    <p>No tasks yet — click <strong>+ Add task</strong> to get started.</p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="tasks-empty">
                    <p>No tasks match your search.</p>
                  </div>
                ) : (
                  <div className="task-groups">
                    {filteredGroups.map((group) => {
                      const collapsed = collapsedGroups.has(group.key);
                      return (
                      <div key={group.key} className={`task-group${collapsed ? ' task-group--collapsed' : ''}`}>
                        <div className="task-group__header" onClick={() => toggleGroup(group.key)}>
                          {group.color && (
                            <span className="task-group__dot" style={{ background: group.color }} />
                          )}
                          <span className="task-group__label">{group.label}</span>
                          <span className="task-group__count">{group.tasks.length}</span>
                          <span className="task-group__chevron">▼</span>
                        </div>
                        {!collapsed && (
                          <div className="task-list">
                            {group.tasks.map((t) => (
                              <TaskCard
                                key={t.id}
                                id={t.id}
                                title={t.title}
                                description={t.description || undefined}
                                status={t.status}
                                deadline_at={t.deadline_at}
                                mental_load={t.mental_load}
                                category_name={t.category_name}
                                category_color={categoryColorMap.get(t.category_name ?? '')}
                                context_name={t.context_name}
                                duration_minutes={t.duration_minutes}
                                google_event_id={t.google_event_id}
                                subtask_count={t.subtask_count}
                                completed_subtask_count={t.completed_subtask_count}
                                onComplete={handleCompleteTask}
                                onSkip={handleSkipTask}
                                onReschedule={handleRescheduleTask}
                                onDelete={handleDeleteTask}
                                onEdit={handleEditTask}
                                onPin={handlePinTask}
                                onStartPomodoro={startPomodoro}
                                showActions
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══ CALENDAR ═══ */}
          {activeTab === 'calendar' && (
            <div className="calendar-tab">
              {preview && (
                <div className="preview-banner">
                  <div className="preview-banner__info">
                    <span className="preview-banner__label">Previewing</span>
                    <strong>{preview.strategyName}</strong>
                  </div>
                  <div className="preview-banner__actions">
                    <button
                      onClick={() => applySuggestion(preview.suggestionIndex)}
                      disabled={isApplying}
                    >
                      {isApplying ? 'Applying…' : 'Apply this plan'}
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => { setPreview(null); navigate('dashboard'); }}
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              )}
              <MonthCalendarView
                scheduledTasks={tasks?.filter(t => t.status === 'scheduled') || []}
                categories={categories || []}
                onTaskReschedule={handlePinTask}
                previewPlacements={preview?.placements ?? []}
                forceViewMode={preview ? 'week' : undefined}
              />
            </div>
          )}

          {/* ═══ STATS / HABITS / SETTINGS ═══ */}
          {activeTab === 'stats'    && <StatsView tasks={tasks ?? []} habits={habits ?? []} />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'habits'   && <HabitsView onHabitsChanged={loadHabits} />}

        </section>
      </main>
    </div>

    {editingTask && (
      <EditTaskModal
        task={editingTask}
        categories={categories ?? []}
        contexts={contexts ?? []}
        onSave={() => { setEditingTask(null); loadTasks(); addToast('Task updated', 'success'); }}
        onClose={() => setEditingTask(null)}
      />
    )}

    {showAddTask && (
      <AddTaskModal
        categories={categories ?? []}
        contexts={contexts ?? []}
        onSave={() => { setShowAddTask(false); loadTasks(); addToast('Task added', 'success'); }}
        onClose={() => setShowAddTask(false)}
      />
    )}

    <PomodoroTimer />

    {/* Mobile FAB — visible only on tasks + dashboard on mobile */}
    {(activeTab === 'tasks' || activeTab === 'dashboard') && (
      <button
        type="button"
        className="mobile-fab"
        onClick={() => setShowAddTask(true)}
        aria-label="Add task"
      >+</button>
    )}
    </>
  );
}
