import { useEffect, useState } from 'react';
import {
  getPreferences, updatePreferences, type Preferences,
  fetchFeeds, createFeed, syncFeed, deleteFeed, type CalendarFeed,
  getGoogleStatus, getGoogleAuthUrl, syncGoogle, disconnectGoogle, type GoogleStatus,
  fetchContexts, createContext, updateContext, deleteContext,
  type Context, type AvailabilityWindow,
  fetchCategories, createCategory, deleteCategory, type Category,
  updateProfile, changePassword, deleteAccount,
  getDigestStatus, sendVerificationCode, confirmVerificationCode,
  updateDigestSettings, sendTestDigest, type DigestStatus,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme, THEMES, COLOR_LABELS, type ColorKey } from '../context/ThemeContext';

// ── Appearance ────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { themeId, colorOverrides, setTheme, setColorOverride, resetAllOverrides } = useTheme();
  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const hasOverrides = Object.keys(colorOverrides).length > 0;

  const defaultFor: Record<ColorKey, string> = {
    '--accent': activeTheme.vars['--accent'],
    '--bg':     activeTheme.vars['--bg'],
    '--panel':  activeTheme.vars['--panel'],
    '--sb-bg':  activeTheme.vars['--sb-bg'],
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Theme presets */}
      <div>
        <p className="field-label" style={{ marginBottom: 10 }}>Preset themes</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-swatch${themeId === t.id ? ' theme-swatch--active' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <div className="theme-swatch__preview" style={{ background: t.preview.bg }}>
                <div className="theme-swatch__preview-sidebar" style={{ background: t.preview.sidebar }} />
                <div className="theme-swatch__preview-panel"   style={{ background: t.preview.panel }}>
                  <div className="theme-swatch__preview-accent" style={{ background: t.preview.accent }} />
                </div>
              </div>
              <span className="theme-swatch__name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color overrides */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p className="field-label">Custom colors</p>
          {hasOverrides && (
            <button type="button" className="btn-ghost btn-sm" onClick={resetAllOverrides}>
              Reset all
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => {
            const current = colorOverrides[key] ?? defaultFor[key];
            const isOverridden = !!colorOverrides[key];
            return (
              <div key={key} className="color-override-row">
                <span className="color-override-row__swatch" style={{ background: current }} />
                <span className="color-override-row__label">{COLOR_LABELS[key]}</span>
                <input
                  type="color"
                  value={current}
                  onChange={(e) => setColorOverride(key, e.target.value)}
                  className="color-override-row__input"
                />
                <span className="color-override-row__hex">{current}</span>
                {isOverridden && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                    onClick={() => setColorOverride(key, null)}
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Contexts ─────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WindowBuilder({
  windows,
  onChange,
}: {
  windows: AvailabilityWindow[];
  onChange: (w: AvailabilityWindow[]) => void;
}) {
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  function addWindow() {
    if (days.length === 0 || !start || !end || start >= end) return;
    onChange([...windows, { days, start, end }]);
    setDays([0, 1, 2, 3, 4]);
    setStart('09:00');
    setEnd('17:00');
  }

  return (
    <div className="window-builder">
      {windows.length === 0 && (
        <div className="panel-empty" style={{ marginBottom: 10 }}>
          No availability windows — this context can be scheduled any time.
        </div>
      )}
      {windows.map((w, i) => (
        <div key={i} className="window-row">
          <span className="window-days">
            {w.days.map((d) => DAY_LABELS[d]).join(', ')}
          </span>
          <span className="window-time">{w.start} – {w.end}</span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            style={{ color: 'var(--red)' }}
            onClick={() => onChange(windows.filter((_, j) => j !== i))}
          >✕</button>
        </div>
      ))}
      <div className="window-add">
        <div className="day-toggles">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              className={`day-toggle${days.includes(d) ? ' day-toggle--on' : ''}`}
              onClick={() => toggleDay(d)}
            >{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="time" step="900" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: '0.82rem' }} />
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>to</span>
          <input type="time" step="900" value={end} onChange={(e) => setEnd(e.target.value)} style={{ fontSize: '0.82rem' }} />
          <button type="button" className="btn-ghost btn-sm" onClick={addWindow}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

function ContextsSection() {
  const { addToast } = useToast();
  const [contexts, setContexts] = useState<Context[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#7b9e87');
  const [editWindows, setEditWindows] = useState<AvailabilityWindow[]>([]);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7b9e87');
  const [adding, setAdding] = useState(false);

  function load() { fetchContexts().then(setContexts).catch(() => setContexts([])); }
  useEffect(load, []);

  function startEdit(ctx: Context) {
    setEditingId(ctx.id);
    setEditName(ctx.name);
    setEditColor(ctx.color);
    try { setEditWindows(JSON.parse(ctx.availability) as AvailabilityWindow[]); }
    catch { setEditWindows([]); }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await updateContext(editingId, { name: editName, color: editColor, availability: JSON.stringify(editWindows) });
      addToast('Context updated', 'success');
      setEditingId(null);
      load();
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await createContext({ name: newName, color: newColor, availability: '[]' });
      addToast(`Context "${newName}" created`, 'success');
      setNewName(''); setNewColor('#7b9e87');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(ctx: Context) {
    if (!confirm(`Delete context "${ctx.name}"? Tasks tagged with it will lose their context.`)) return;
    try {
      const res = await deleteContext(ctx.id);
      addToast(`${res.message} (${res.untagged_tasks} tasks untagged)`, 'info');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  return (
    <div className="form-section">
      <div className="section-copy">
        <h4>Contexts</h4>
        <p>
          Tag tasks with a context (Home, Work, Errands) so the scheduler only places them during
          the times you're actually in that location. Leave availability empty to allow any time.
        </p>
      </div>

      {contexts === null ? (
        <div className="panel-loading">Loading contexts…</div>
      ) : contexts.length === 0 ? (
        <div className="panel-empty">No contexts yet. Add one below.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {contexts.map((ctx) => (
            <div key={ctx.id} className="context-row">
              {editingId === ctx.id ? (
                <div className="context-edit">
                  <div className="field-grid field-grid--two" style={{ marginBottom: 10 }}>
                    <div className="form-field">
                      <label className="field-label">Name</label>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label className="field-label">Color</label>
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                    </div>
                  </div>
                  <label className="field-label" style={{ marginBottom: 6, display: 'block' }}>Availability windows</label>
                  <WindowBuilder windows={editWindows} onChange={setEditWindows} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={saveEdit}>Save</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="context-row__info">
                  <span className="context-dot" style={{ background: ctx.color }} />
                  <div>
                    <span className="context-row__name">{ctx.name}</span>
                    {(() => {
                      try {
                        const ws = JSON.parse(ctx.availability) as AvailabilityWindow[];
                        if (ws.length === 0) return <span className="context-row__meta">Any time</span>;
                        return (
                          <span className="context-row__meta">
                            {ws.map((w) => `${w.days.map((d) => DAY_LABELS[d]).join('/')} ${w.start}–${w.end}`).join(' · ')}
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => startEdit(ctx)}>Edit</button>
                    <button type="button" className="btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(ctx)}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="settings-add-form">
        <div className="form-field" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="ctxName">New context name</label>
          <input id="ctxName" placeholder="Home, Work, Errands…" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ctxColor">Color</label>
          <input id="ctxColor" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        </div>
        <button type="submit" disabled={adding}>
          {adding ? 'Creating…' : '+ Add'}
        </button>
      </form>
      <div className="field-help">After creating a context, click Edit to set its availability windows.</div>
    </div>
  );
}

// ── Categories ───────────────────────────────────────────────────────────

function CategoriesSection() {
  const { addToast } = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#c9ad93');
  const [adding, setAdding] = useState(false);

  function load() { fetchCategories().then(setCategories).catch(() => setCategories([])); }
  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await createCategory({ name: newName, color: newColor });
      addToast(`Category "${newName}" created`, 'success');
      setNewName(''); setNewColor('#c9ad93');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"? Tasks in this category will become uncategorized.`)) return;
    try {
      const res = await deleteCategory(cat.id);
      addToast(`${res.message} (${res.uncategorized_tasks} tasks uncategorized)`, 'info');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  return (
    <div className="form-section">
      <div className="section-copy">
        <h4>Categories</h4>
        <p>Group tasks by area — work, uni, chores, etc.</p>
      </div>

      {categories === null ? (
        <div className="panel-loading">Loading categories…</div>
      ) : categories.length === 0 ? (
        <div className="panel-empty">No categories yet.</div>
      ) : (
        <div className="category-chips">
          {categories.map((cat) => (
            <span key={cat.id} className="category-chip" style={{ borderColor: cat.color }}>
              <span className="category-dot" style={{ background: cat.color }} />
              {cat.name}
              <button type="button" className="chip-delete" onClick={() => handleDelete(cat)}>✕</button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="settings-add-form">
        <div className="form-field" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="catName">New category name</label>
          <input id="catName" placeholder="Work, Uni, Chores…" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="catColor">Color</label>
          <input id="catColor" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        </div>
        <button type="submit" disabled={adding}>
          {adding ? 'Creating…' : '+ Add'}
        </button>
      </form>
    </div>
  );
}

// ── Planning preferences ─────────────────────────────────────────────────

function PreferencesSection() {
  const { addToast } = useToast();
  const [prefs, setPrefs]   = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPreferences().then(setPrefs).catch(() => {});
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const updated = await updatePreferences(prefs);
      setPrefs(updated);
      addToast('Settings saved', 'success');
    } catch {
      addToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) return <div className="panel-loading">Loading preferences…</div>;

  return (
    <div className="form-shell">
      <div className="form-section">
        <div className="section-copy">
          <h4>Sleep window</h4>
          <p>The scheduler will never place tasks inside this window.</p>
        </div>
        <div className="field-grid field-grid--two">
          <div className="form-field">
            <label className="field-label" htmlFor="sleepStart">Sleep start</label>
            <input
              id="sleepStart" type="time"
              value={prefs.sleep_start}
              onChange={(e) => setPrefs({ ...prefs, sleep_start: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="sleepEnd">Wake time</label>
            <input
              id="sleepEnd" type="time"
              value={prefs.sleep_end}
              onChange={(e) => setPrefs({ ...prefs, sleep_end: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="section-copy">
          <h4>Load balancing</h4>
          <p>Controls breathing room and daily cap on mental load.</p>
        </div>
        <div className="field-grid field-grid--two">
          <div className="form-field">
            <label className="field-label" htmlFor="bufferMin">Buffer between events (min)</label>
            <input
              id="bufferMin" type="number" min="0" max="120"
              value={prefs.buffer_minutes}
              onChange={(e) => setPrefs({ ...prefs, buffer_minutes: Number(e.target.value) })}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="maxLoad">Max daily mental load</label>
            <input
              id="maxLoad" type="number" min="1" max="20"
              value={prefs.max_daily_load}
              onChange={(e) => setPrefs({ ...prefs, max_daily_load: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  );
}

// ── iCal feeds ───────────────────────────────────────────────────────────

function ICalSection() {
  const { addToast } = useToast();
  const [feeds, setFeeds]   = useState<CalendarFeed[] | null>(null);
  const [name, setName]     = useState('');
  const [url, setUrl]       = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  function load() { fetchFeeds().then(setFeeds).catch(() => setFeeds([])); }
  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await createFeed({ name, url });
      addToast(`Feed "${name}" added`, 'success');
      setName(''); setUrl('');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleSync(feed: CalendarFeed) {
    setSyncing(feed.id);
    try {
      const updated = await syncFeed(feed.id);
      addToast(`Synced ${updated.event_count} events from "${feed.name}"`, 'success');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(feed: CalendarFeed) {
    if (!confirm(`Remove feed "${feed.name}" and its imported events?`)) return;
    try {
      await deleteFeed(feed.id);
      addToast(`Removed "${feed.name}"`, 'info');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  return (
    <div className="form-section">
      <div className="section-copy">
        <h4>iCal feeds</h4>
        <p>
          Paste any iCal URL — Google Calendar's private address, Apple Calendar, Outlook, or any
          other service that exports <code>.ics</code>. Events are imported as busy blocks so the
          scheduler plans around them.
        </p>
      </div>

      {/* Existing feeds */}
      {feeds && feeds.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {feeds.map((feed) => (
            <div key={feed.id} className="feed-row">
              <div className="feed-row__info">
                <span className="feed-row__name">{feed.name}</span>
                <span className="feed-row__meta">
                  {feed.last_synced_at
                    ? `${feed.event_count} events · synced ${new Date(feed.last_synced_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Never synced'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={syncing === feed.id}
                  onClick={() => handleSync(feed)}
                >
                  {syncing === feed.id ? 'Syncing…' : '↻ Sync'}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => handleDelete(feed)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {feeds !== null && feeds.length === 0 && (
        <div className="panel-empty">No feeds yet. Add one below.</div>
      )}

      {/* Add feed form */}
      <form onSubmit={handleAdd} style={{ display: 'grid', gap: 10 }}>
        <div className="field-grid field-grid--two">
          <div className="form-field">
            <label className="field-label" htmlFor="feedName">Feed name</label>
            <input
              id="feedName" placeholder="My Google Calendar"
              value={name} onChange={(e) => setName(e.target.value)} required
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="feedUrl">iCal URL</label>
            <input
              id="feedUrl" placeholder="https://calendar.google.com/calendar/ical/…"
              value={url} onChange={(e) => setUrl(e.target.value)} required
            />
          </div>
        </div>
        <div>
          <button type="submit" disabled={adding}>
            {adding ? 'Adding…' : '+ Add feed'}
          </button>
        </div>
      </form>

      <div className="field-help" style={{ marginTop: 4 }}>
        To find your Google Calendar iCal URL: Calendar settings → Integrate calendar → Secret address in iCal format.
      </div>
    </div>
  );
}

// ── Google OAuth ──────────────────────────────────────────────────────────

function GoogleSection() {
  const { addToast } = useToast();
  const [status, setStatus]   = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  function load() { getGoogleStatus().then(setStatus).catch(() => {}); }

  useEffect(() => {
    load();
    // If returning from OAuth flow, check query param
    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get('google');
    if (googleParam === 'connected') {
      addToast('Google Calendar connected!', 'success');
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (googleParam === 'error') {
      addToast(`Google connection failed: ${params.get('reason') ?? 'unknown'}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function handleConnect() {
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncGoogle();
      addToast(res.message, 'success');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Google Calendar? This will remove all imported Google events.')) return;
    try {
      await disconnectGoogle();
      addToast('Google Calendar disconnected', 'info');
      load();
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  return (
    <div className="form-section">
      <div className="section-copy">
        <h4>Google Calendar</h4>
        <p>
          Connect via OAuth for real-time read access to your Google Calendar. Events are imported
          as busy blocks so the scheduler plans around them.
        </p>
      </div>

      {!status ? (
        <div className="panel-loading">Checking connection…</div>
      ) : !status.configured ? (
        <div className="google-setup-notice">
          <strong>OAuth credentials not configured.</strong>
          <p style={{ marginTop: 6, fontSize: '0.88rem', color: 'var(--muted)' }}>
            Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to{' '}
            <code>backend/.env</code>, then restart the server.
          </p>
          <p style={{ marginTop: 4, fontSize: '0.84rem', color: 'var(--muted)' }}>
            Create credentials at: Google Cloud Console → APIs &amp; Services → Credentials →
            OAuth 2.0 Client IDs. Set the redirect URI to{' '}
            <code>http://localhost:8000/auth/google/callback</code>.
          </p>
        </div>
      ) : status.connected ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="google-connected-badge">
            <span className="google-dot" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Connected</div>
              <div style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>
                {status.email}
                {status.last_synced_at && (
                  <> · Last synced {new Date(status.last_synced_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={syncing} onClick={handleSync}>
              {syncing ? 'Syncing…' : '↻ Sync now'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={handleConnect}>
          Connect Google Calendar
        </button>
      )}
    </div>
  );
}

// ── Account ──────────────────────────────────────────────────────────────

function AccountSection() {
  const { addToast } = useToast();
  const { user, login, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [savingName, setSavingName]   = useState(false);

  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [savingPw, setSavingPw]     = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const updated = await updateProfile(displayName);
      login(updated);
      addToast('Display name updated', 'success');
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      addToast('Password changed', 'success');
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    } finally {
      setSavingPw(false);
    }
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount(deletePw);
      logout();
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>

      {/* Display name */}
      <form className="form-section" onSubmit={handleSaveName}>
        <div className="section-copy">
          <h4>Display name</h4>
          <p>Shown in the header and sidebar.</p>
        </div>
        <div className="field-grid field-grid--two">
          <div className="form-field">
            <label className="field-label">Username</label>
            <input value={user?.username ?? ''} disabled style={{ opacity: 0.55 }} />
          </div>
          <div className="form-field">
            <label className="field-label">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you want to be called"
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={savingName}>{savingName ? 'Saving…' : 'Save name'}</button>
        </div>
      </form>

      {/* Password */}
      <form className="form-section" onSubmit={handleChangePassword}>
        <div className="section-copy">
          <h4>Change password</h4>
          <p>Must be at least 8 characters.</p>
        </div>
        <div className="field-grid field-grid--two">
          <div className="form-field">
            <label className="field-label">Current password</label>
            <input
              type="password" value={currentPw} autoComplete="current-password"
              onChange={(e) => setCurrentPw(e.target.value)} required
            />
          </div>
          <div className="form-field">
            <label className="field-label">New password</label>
            <input
              type="password" value={newPw} autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)} required minLength={8}
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={savingPw}>{savingPw ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>

      {/* Delete account */}
      <div className="form-section">
        <div className="section-copy">
          <h4>Delete account</h4>
          <p>Permanently removes your account. Your tasks, habits and calendar data will remain in the database but become inaccessible.</p>
        </div>
        {!confirmDelete ? (
          <button type="button" className="btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            Delete account
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
            <p style={{ fontSize: '0.88rem', color: 'var(--red)', margin: 0 }}>
              This cannot be undone. Enter your password to confirm.
            </p>
            <input
              type="password"
              placeholder="Your password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              autoComplete="current-password"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-danger btn-sm" onClick={handleDeleteAccount} disabled={!deletePw}>
                Yes, delete my account
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setConfirmDelete(false); setDeletePw(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Email digest ─────────────────────────────────────────────────────────

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DigestSection() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  function load() {
    getDigestStatus().then((s) => {
      setStatus(s);
      setEmailInput(s.email);
    }).catch(() => {});
  }
  useEffect(load, []);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendVerificationCode(emailInput.trim());
      setCodeSent(true);
      setCodeInput('');
      addToast('Verification code sent — check your inbox', 'success');
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await confirmVerificationCode(codeInput.trim());
      setCodeSent(false);
      addToast('Email verified!', 'success');
      load();
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function patch(payload: Partial<DigestStatus>) {
    if (!status) return;
    try {
      const updated = await updateDigestSettings(payload);
      setStatus({ ...status, ...updated });
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    }
  }

  async function handleSendTest() {
    setTestBusy(true);
    try {
      const res = await sendTestDigest();
      addToast(res.message, 'success');
    } catch (err) {
      addToast(String(err).replace('Error: ', ''), 'error');
    } finally {
      setTestBusy(false);
    }
  }

  if (!status) return <div className="panel-loading">Loading…</div>;

  const verified = status.email_verified;

  return (
    <div className="form-shell">

      {/* ── Email verification ── */}
      <div className="form-section">
        <div className="section-copy">
          <h4>Email address</h4>
          <p>We'll send your digest here. You must verify the address before enabling.</p>
        </div>

        {verified && !codeSent ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--green-bg)', color: 'var(--green)',
                borderRadius: 8, padding: '6px 12px', fontSize: '0.88rem', fontWeight: 600,
              }}>
                ✓ {status.email}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => { setStatus({ ...status, email_verified: false }); setCodeSent(false); }}
              >
                Change
              </button>
            </div>
          </div>
        ) : codeSent ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
              Code sent to <strong style={{ color: 'var(--text)' }}>{emailInput}</strong>. Enter it below:
            </p>
            <form onSubmit={handleConfirmCode} style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="6-digit code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                maxLength={6}
                style={{ width: 120, letterSpacing: 4, textAlign: 'center', fontWeight: 600 }}
                required
              />
              <button type="submit" disabled={busy || codeInput.length !== 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={handleSendCode} disabled={busy}>
                Resend
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSendCode} style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              style={{ flex: 1 }}
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}
      </div>

      {/* ── Digest settings (only shown after verification) ── */}
      {verified && (
        <>
          <div className="form-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>Enable digest</p>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Receive a summary of your day at your chosen time
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={status.digest_enabled}
                className={`toggle-switch${status.digest_enabled ? ' toggle-switch--on' : ''}`}
                onClick={() => patch({ digest_enabled: !status.digest_enabled })}
              />
            </div>
          </div>

          {status.digest_enabled && (
            <div className="form-section">
              <div className="section-copy">
                <h4>Schedule</h4>
              </div>

              {/* Frequency */}
              <div className="form-field">
                <label className="field-label">Frequency</label>
                <div className="seg-control">
                  {(['daily', 'weekly'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`seg-control__btn${status.digest_frequency === f ? ' seg-control__btn--active' : ''}`}
                      onClick={() => patch({ digest_frequency: f })}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekly day picker */}
              {status.digest_frequency === 'weekly' && (
                <div className="form-field">
                  <label className="field-label">Day</label>
                  <div className="day-toggles">
                    {WEEK_DAYS.map((label, i) => {
                      const iso = i + 1; // 1=Mon … 7=Sun
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={`day-toggle${status.digest_day === iso ? ' day-toggle--on' : ''}`}
                          onClick={() => patch({ digest_day: iso })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time */}
              <div className="form-field" style={{ maxWidth: 160 }}>
                <label className="field-label">Send at (UTC)</label>
                <input
                  type="time"
                  value={status.digest_time}
                  onChange={(e) => setStatus({ ...status, digest_time: e.target.value })}
                  onBlur={(e) => patch({ digest_time: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Test send */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn-ghost btn-sm" onClick={handleSendTest} disabled={testBusy}>
              {testBusy ? 'Sending…' : '✉ Send test email'}
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Sends a sample digest to {status.email} right now
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main SettingsView ────────────────────────────────────────────────────

type SettingsTab = 'appearance' | 'preferences' | 'data' | 'calendar' | 'digest' | 'account';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string; color: string; sub: string }[] = [
  { id: 'appearance',  label: 'Appearance',  icon: '🎨', color: '#9b6bb5', sub: 'Themes & colors' },
  { id: 'preferences', label: 'Preferences', icon: '⚙️', color: '#5a8a6a', sub: 'Sleep, load balancing' },
  { id: 'data',        label: 'Data',        icon: '🗂️', color: '#c97d3a', sub: 'Categories & contexts' },
  { id: 'calendar',    label: 'Calendar',    icon: '📅', color: '#4a7ab5', sub: 'iCal feeds, Google' },
  { id: 'digest',      label: 'Digest',      icon: '✉️', color: '#b87a3a', sub: 'Daily or weekly email' },
  { id: 'account',     label: 'Account',     icon: '👤', color: '#7a7a8a', sub: 'Profile & password' },
];

function SettingsContent({ tab }: { tab: SettingsTab }) {
  return (
    <>
      {tab === 'appearance'  && <AppearanceSection />}
      {tab === 'preferences' && <PreferencesSection />}
      {tab === 'data'        && (
        <div style={{ display: 'grid', gap: 32 }}>
          <CategoriesSection />
          <ContextsSection />
        </div>
      )}
      {tab === 'calendar'    && (
        <div style={{ display: 'grid', gap: 14 }}>
          <ICalSection />
          <GoogleSection />
        </div>
      )}
      {tab === 'digest'      && <DigestSection />}
      {tab === 'account'     && <AccountSection />}
    </>
  );
}

export default function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('appearance');
  // Mobile: null = show menu, string = show section
  const [mobileTab, setMobileTab] = useState<SettingsTab | null>(null);

  return (
    <div className="panel settings-panel" style={{ gridColumn: '1 / -1', maxWidth: '680px' }}>

      {/* ── Desktop layout ── */}
      <div className="settings-desktop">
        <div className="panel-head">
          <h3>Settings</h3>
        </div>
        <div className="settings-tabs">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab${tab === t.id ? ' settings-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ paddingTop: 24 }}>
          <SettingsContent tab={tab} />
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="settings-mobile">
        {mobileTab === null ? (
          /* Menu list */
          <div className="settings-menu">
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="settings-menu__row"
                onClick={() => setMobileTab(t.id)}
                style={{ '--row-color': t.color } as React.CSSProperties}
              >
                <span className="settings-menu__icon">{t.icon}</span>
                <span className="settings-menu__text">
                  <span className="settings-menu__label">{t.label}</span>
                  <span className="settings-menu__sub">{t.sub}</span>
                </span>
                <span className="settings-menu__chevron">›</span>
              </button>
            ))}
          </div>
        ) : (
          /* Section content */
          <div className="settings-section">
            <div className="settings-section__head">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setMobileTab(null)}
              >
                ‹ Back
              </button>
              <span className="settings-section__title">
                {SETTINGS_TABS.find((t) => t.id === mobileTab)?.label}
              </span>
            </div>
            <div className="settings-section__body">
              <SettingsContent tab={mobileTab} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
