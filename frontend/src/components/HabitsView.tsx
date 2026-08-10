import { useEffect, useMemo, useState } from 'react';
import {
  completeHabit, uncompleteHabit, createHabit, fetchHabits, updateHabit, deleteHabit,
  fetchHabitHeatmap,
  type Habit, type HabitHeatmapDay,
} from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────

function isCompletedToday(lastCompletedAt?: string | null): boolean {
  if (!lastCompletedAt) return false;
  const d = new Date(lastCompletedAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatNextDue(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffH < 0) return 'overdue';
  if (diffH < 1) return 'in < 1h';
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  const diffD = Math.round(diffH / 24);
  return `in ${diffD}d`;
}

// ── Heatmap ───────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS   = ['Mon','','Wed','','Fri','','Sun'];

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function heatLevel(ratio: number, due: number): 0 | 1 | 2 | 3 | 4 {
  if (due === 0 || ratio === 0) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5)  return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

type HeatCell = { date: string; level: 0|1|2|3|4; completed: number; due: number; inYear: boolean };
type WeekCol  = { monthLabel: string | null; cells: HeatCell[] };

function buildYearGrid(data: HabitHeatmapDay[], year: number): WeekCol[] {
  const byDate: Record<string, HabitHeatmapDay> = {};
  for (const d of data) byDate[d.date] = d;

  const today     = new Date();
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = year === today.getFullYear() ? today : new Date(year, 11, 31);

  // Mon-based day of week for Jan 1 (0=Mon … 6=Sun)
  const jan1Dow = (yearStart.getDay() + 6) % 7;

  // Grid starts on the Monday that contains Jan 1
  const gridStart = new Date(yearStart);
  gridStart.setDate(gridStart.getDate() - jan1Dow);

  // Grid ends on the Sunday that contains yearEnd
  const yearEndDow = (yearEnd.getDay() + 6) % 7;
  const gridEnd = new Date(yearEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - yearEndDow));

  const columns: WeekCol[] = [];
  const cursor = new Date(gridStart);
  let prevMonth = -1;

  while (cursor <= gridEnd) {
    const cells: HeatCell[] = [];
    let monthLabel: string | null = null;

    for (let d = 0; d < 7; d++) {
      const dateStr = toLocalDateStr(cursor);
      const inYear  = cursor >= yearStart && cursor <= yearEnd;
      const entry   = inYear ? byDate[dateStr] : undefined;
      const m       = cursor.getMonth();

      if (inYear && m !== prevMonth) { monthLabel = MONTH_LABELS[m]; prevMonth = m; }

      cells.push({
        date: dateStr,
        level: entry ? heatLevel(entry.ratio, entry.due) : 0,
        completed: entry?.completed ?? 0,
        due: entry?.due ?? 0,
        inYear,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    columns.push({ monthLabel, cells });
  }

  return columns;
}

function HabitHeatmap({ refreshKey }: { refreshKey: number }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear]   = useState(currentYear);
  const [data, setData]   = useState<HabitHeatmapDay[] | null>(null);

  useEffect(() => {
    setData(null);
    fetchHabitHeatmap(year).then(setData).catch(() => setData([]));
  }, [year, refreshKey]);

  const grid = useMemo(
    () => (data ? buildYearGrid(data, year) : null),
    [data, year],
  );

  const hasAnyData = data && data.some(d => d.due > 0);

  return (
    <div className="habit-heatmap">
      <div className="habit-heatmap__header">
        <div className="heatmap-year-nav">
          <button
            className="heatmap-year-btn"
            onClick={() => setYear(y => y - 1)}
            title="Previous year"
          >‹</button>
          <span className="habit-heatmap__title">{year}</span>
          <button
            className="heatmap-year-btn"
            onClick={() => setYear(y => y + 1)}
            disabled={year >= currentYear}
            title="Next year"
          >›</button>
        </div>
        <div className="heatmap-legend">
          <span className="heatmap-legend__label">Less</span>
          {[0,1,2,3,4].map(l => <span key={l} className={`heatmap-cell heatmap-cell--l${l}`} />)}
          <span className="heatmap-legend__label">More</span>
        </div>
      </div>

      {data === null ? (
        <div className="heatmap-loading">Loading…</div>
      ) : !hasAnyData ? (
        <div className="heatmap-loading">No habit data for {year}.</div>
      ) : (
        <div className="heatmap-scroll">
          <div className="heatmap-month-row">
            <div className="heatmap-day-labels-spacer" />
            {grid!.map((col, i) => (
              <div key={i} className="heatmap-month-cell">
                {col.monthLabel && <span>{col.monthLabel}</span>}
              </div>
            ))}
          </div>

          <div className="heatmap-grid-row">
            <div className="heatmap-day-labels">
              {DAY_LABELS.map((lbl, i) => (
                <div key={i} className="heatmap-day-label">{lbl}</div>
              ))}
            </div>

            <div className="heatmap-grid">
              {grid!.map((col, ci) =>
                col.cells.map((cell, di) => (
                  <div
                    key={`${ci}-${di}`}
                    className={`heatmap-cell heatmap-cell--l${cell.level}${!cell.inYear ? ' heatmap-cell--out' : ''}`}
                    title={cell.inYear && cell.due > 0 ? `${cell.date}: ${cell.completed}/${cell.due} habits` : cell.date}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Habit Modal ───────────────────────────────────────────────────────

type HabitForm = {
  title: string;
  duration_minutes: string;
  mental_load: string;
  recurrence_mode: string;
  custom_days: string;
};

const emptyForm: HabitForm = {
  title: '',
  duration_minutes: '15',
  mental_load: '2',
  recurrence_mode: 'daily',
  custom_days: 'mon,wed,fri',
};

function AddHabitModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState<HabitForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof HabitForm, value: string) {
    setForm((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const recurrence_rule =
      form.recurrence_mode === 'custom' ? `custom:${form.custom_days}` : form.recurrence_mode;
    try {
      await createHabit({
        title: form.title,
        duration_minutes: Number(form.duration_minutes),
        mental_load: Number(form.mental_load),
        recurrence_rule,
        is_active: true,
      });
      onSave();
    } catch (err) {
      setError(String(err).replace('Error: ', ''));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>New habit</h3>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <div className="form-field">
            <label className="field-label">Title</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Morning run, read, stretch…"
              required
              autoFocus
            />
          </div>

          <div className="field-grid field-grid--three">
            <div className="form-field">
              <label className="field-label">Duration (min)</label>
              <input type="number" min="5" value={form.duration_minutes}
                onChange={(e) => set('duration_minutes', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="field-label">Mental load (1–5)</label>
              <input type="number" min="1" max="5" value={form.mental_load}
                onChange={(e) => set('mental_load', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="field-label">Recurrence</label>
              <select value={form.recurrence_mode} onChange={(e) => set('recurrence_mode', e.target.value)}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
                <option value="every_n_days:2">Every 2 days</option>
                <option value="custom">Custom days</option>
              </select>
            </div>
          </div>

          {form.recurrence_mode === 'custom' && (
            <div className="form-field">
              <label className="field-label">Custom days</label>
              <input value={form.custom_days} onChange={(e) => set('custom_days', e.target.value)}
                placeholder="mon,wed,fri" />
              <span className="field-help">Comma-separated: mon, tue, wed, thu, fri, sat, sun</span>
            </div>
          )}

          {error && <div className="panel-error">{error}</div>}

          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add habit'}</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Habit Card ────────────────────────────────────────────────────────────

function HabitCard({
  habit,
  onComplete,
  onUncomplete,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onToggle: (habit: Habit) => void;
  onDelete: (id: string) => void;
}) {
  const nextDue   = formatNextDue(habit.next_due_at);
  const doneToday = isCompletedToday(habit.last_completed_at);

  return (
    <article className={`habit-row${habit.is_due ? ' habit-row--due' : ''}${!habit.is_active ? ' habit-row--paused' : ''}${doneToday ? ' habit-row--done' : ''}`}>
      <div className="habit-row__left">
        {habit.is_due && !doneToday && <span className="habit-due-pip" />}
        {doneToday && <span className="habit-done-pip" />}
        <div className="habit-row__info">
          <span className="habit-row__title">{habit.title}</span>
          <span className="habit-row__meta">
            {habit.recurrence_label || habit.recurrence_rule}
            {' · '}{habit.duration_minutes}m
            {nextDue && !doneToday && <> · <span className={habit.is_due ? 'habit-overdue' : ''}>{nextDue}</span></>}
            {doneToday && <> · <span className="habit-done-label">done today</span></>}
            {!habit.is_active && <span className="habit-paused-label"> · paused</span>}
          </span>
        </div>
      </div>

      <div className="habit-row__streak">
        <span className="habit-streak-num">{habit.streak_count}</span>
        <span className="habit-streak-label">streak</span>
      </div>

      <div className="habit-row__actions">
        {habit.is_active && (
          doneToday ? (
            <button
              type="button"
              className="habit-complete-btn habit-complete-btn--done"
              onClick={() => onUncomplete(habit.id)}
              title="Undo completion"
            >✓ Done · Undo</button>
          ) : (
            <button
              type="button"
              className={`habit-complete-btn${habit.is_due ? ' habit-complete-btn--due' : ''}`}
              onClick={() => onComplete(habit.id)}
              title="Mark complete"
            >✓ Done</button>
          )
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => onToggle(habit)}>
          {habit.is_active ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          style={{ color: 'var(--red)' }}
          onClick={() => onDelete(habit.id)}
          title="Delete"
        >✕</button>
      </div>
    </article>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────

export default function HabitsView({ onHabitsChanged }: { onHabitsChanged?: () => void }) {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [heatmapKey, setHeatmapKey] = useState(0);

  const dueHabits      = useMemo(() => (habits ?? []).filter((h) => h.is_active && h.is_due && !isCompletedToday(h.last_completed_at)), [habits]);
  const doneHabits     = useMemo(() => (habits ?? []).filter((h) => h.is_active && isCompletedToday(h.last_completed_at)), [habits]);
  const upcomingHabits = useMemo(() => (habits ?? []).filter((h) => h.is_active && !h.is_due && !isCompletedToday(h.last_completed_at)), [habits]);
  const pausedHabits   = useMemo(() => (habits ?? []).filter((h) => !h.is_active), [habits]);
  const totalStreak    = useMemo(() => (habits ?? []).reduce((s, h) => s + h.streak_count, 0), [habits]);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setHabits(await fetchHabits()); }
    catch (err) { setError(String(err)); }
  }

  async function handleComplete(id: string) {
    try { await completeHabit(id); await load(); setHeatmapKey(k => k + 1); onHabitsChanged?.(); }
    catch (err) { setError(String(err)); }
  }

  async function handleUncomplete(id: string) {
    try { await uncompleteHabit(id); await load(); setHeatmapKey(k => k + 1); onHabitsChanged?.(); }
    catch (err) { setError(String(err)); }
  }

  async function handleToggle(habit: Habit) {
    try { await updateHabit(habit.id, { is_active: !habit.is_active }); await load(); onHabitsChanged?.(); }
    catch (err) { setError(String(err)); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this habit and all its completions?')) return;
    try { await deleteHabit(id); await load(); setHeatmapKey(k => k + 1); onHabitsChanged?.(); }
    catch (err) { setError(String(err)); }
  }

  return (
    <div className="habits-page">
      {/* Header */}
      <div className="habits-page__header">
        <div>
          <h3>Habits</h3>
          <p className="subtitle">
            {(habits ?? []).filter((h) => h.is_active).length} active
            {dueHabits.length > 0 && <> · <strong style={{ color: 'var(--amber)' }}>{dueHabits.length} due now</strong></>}
            {doneHabits.length > 0 && <> · <strong style={{ color: 'var(--green)' }}>{doneHabits.length} done today</strong></>}
            {totalStreak > 0 && <> · {totalStreak} streak days</>}
          </p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}>+ Add habit</button>
      </div>

      {error && <div className="panel-error">{error}</div>}

      {/* Heatmap */}
      <HabitHeatmap refreshKey={heatmapKey} />

      {habits === null ? (
        <div className="panel-loading">Loading habits…</div>
      ) : habits.length === 0 ? (
        <div className="habits-empty">
          <p>No habits yet — click <strong>+ Add habit</strong> to get started.</p>
        </div>
      ) : (
        <div className="habits-list">
          {dueHabits.length > 0 && (
            <section className="habits-section">
              <div className="habits-section__header">Due now</div>
              {dueHabits.map((h) => (
                <HabitCard key={h.id} habit={h} onComplete={handleComplete} onUncomplete={handleUncomplete} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {doneHabits.length > 0 && (
            <section className="habits-section">
              <div className="habits-section__header">Done today</div>
              {doneHabits.map((h) => (
                <HabitCard key={h.id} habit={h} onComplete={handleComplete} onUncomplete={handleUncomplete} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {upcomingHabits.length > 0 && (
            <section className="habits-section">
              {(dueHabits.length > 0 || doneHabits.length > 0) && <div className="habits-section__header">Upcoming</div>}
              {upcomingHabits.map((h) => (
                <HabitCard key={h.id} habit={h} onComplete={handleComplete} onUncomplete={handleUncomplete} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {pausedHabits.length > 0 && (
            <section className="habits-section">
              <div className="habits-section__header">Paused</div>
              {pausedHabits.map((h) => (
                <HabitCard key={h.id} habit={h} onComplete={handleComplete} onUncomplete={handleUncomplete} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}
        </div>
      )}

      {showAdd && (
        <AddHabitModal
          onSave={() => { setShowAdd(false); load(); onHabitsChanged?.(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
