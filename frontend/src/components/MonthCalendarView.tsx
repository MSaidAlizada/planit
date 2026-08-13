import { useEffect, useMemo, useRef, useState } from 'react';
import { createCalendarEvent, fetchCalendarEvents, deleteCalendarEvent, type CalendarEvent, type Category, type Task } from '../lib/api';
import { localDateKey, parseUTC } from '../lib/date';

type FormState = { title: string; start_time: string; end_time: string };
type ViewMode = 'month' | 'week' | 'day';
export type PreviewPlacement = { task_id: string; title: string; start: string; end: string; duration: number };

const initialForm: FormState = { title: '', start_time: '09:00', end_time: '10:00' };
const PX_PER_HOUR = 64;

function startOfDay(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}
// Local calendar day key/equality for grid cells — never derive this via
// toISOString() (converts to UTC first), which mislabels "today" near local
// midnight (any evening/night hours where the local day hasn't caught up to
// UTC's yet).
const fmtKey = localDateKey;
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtTime(date: Date) { return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

export default function MonthCalendarView({
  scheduledTasks = [],
  categories = [],
  onTaskReschedule,
  previewPlacements = [],
  forceViewMode,
}: {
  scheduledTasks?: Task[];
  categories?: Category[];
  onTaskReschedule?: (taskId: string, isoStart: string) => void;
  previewPlacements?: PreviewPlacement[];
  forceViewMode?: ViewMode;
}) {
  const [events, setEvents]       = useState<CalendarEvent[] | null>(null);
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [viewMode, setViewMode]   = useState<ViewMode>(window.innerWidth <= 768 ? 'day' : 'month');

  useEffect(() => {
    if (forceViewMode) setViewMode(forceViewMode);
  }, [forceViewMode]);
  const [form, setForm]           = useState<FormState>(initialForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAddForm, setShowAddForm]   = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);

  const catColors = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.name, c.color));
    return m;
  }, [categories]);

  function load() { fetchCalendarEvents().then(setEvents).catch(() => setEvents([])); }
  useEffect(() => { load(); }, []);

  // Auto-scroll timeline to current hour
  useEffect(() => {
    if (viewMode === 'month') return;
    const el = timelineRef.current;
    if (!el) return;
    const now = new Date();
    const scrollTop = (now.getHours() + now.getMinutes() / 60 - 1) * PX_PER_HOUR;
    el.scrollTop = Math.max(0, scrollTop);
  }, [viewMode]);

  // ── Calendar days ─────────────────────────────────────────────────────────
  const calDays = useMemo(() => {
    if (viewMode === 'day') return [startOfDay(selectedDate)];
    if (viewMode === 'week') {
      const s = startOfDay(selectedDate);
      const ws = addDays(s, -s.getDay());
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    }
    const y = anchorDate.getFullYear(), mo = anchorDate.getMonth();
    const first = new Date(y, mo, 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchorDate, selectedDate, viewMode]);

  const grouped = useMemo(() => calDays.map((date) => {
    const key = fmtKey(date);
    return {
      date,
      isCurrentMonth: viewMode !== 'month' || date.getMonth() === anchorDate.getMonth(),
      events: (events ?? []).filter((e) => localDateKey(parseUTC(e.start_at)) === key),
      tasks: scheduledTasks.filter((t) => t.scheduled_start_at && localDateKey(parseUTC(t.scheduled_start_at)) === key),
      previews: previewPlacements.filter((p) => localDateKey(parseUTC(p.start)) === key),
    };
  }), [anchorDate, events, scheduledTasks, previewPlacements, calDays, viewMode]);

  const selDayData = useMemo(() => grouped.find((d) => sameDay(d.date, selectedDate)), [grouped, selectedDate]);

  // ── Navigation ────────────────────────────────────────────────────────────
  function shiftPeriod(dir: number) {
    if (viewMode === 'day') {
      const next = addDays(selectedDate, dir);
      setSelectedDate(next); setAnchorDate(next);
    } else if (viewMode === 'week') {
      const next = addDays(selectedDate, dir * 7);
      setSelectedDate(next); setAnchorDate(next);
    } else {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1));
    }
  }

  function selectDay(date: Date) { setSelectedDate(date); setAnchorDate(date); }
  function goToday() { const t = new Date(); setSelectedDate(t); setAnchorDate(t); }

  const displayLabel = viewMode === 'month'
    ? anchorDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    : viewMode === 'week' && grouped.length >= 7
      ? (() => {
          const a = grouped[0].date, b = grouped[6].date;
          return a.getMonth() === b.getMonth()
            ? a.toLocaleString('default', { month: 'long', year: 'numeric' })
            : `${a.toLocaleString('default', { month: 'short' })} – ${b.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
        })()
      : selectedDate.toLocaleString('default', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Add event ─────────────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const ds = fmtKey(selectedDate);
      await createCalendarEvent({
        title: form.title,
        start_at: new Date(`${ds}T${form.start_time}:00`).toISOString(),
        end_at:   new Date(`${ds}T${form.end_time}:00`).toISOString(),
        source_calendar: 'local', is_busy: true, is_imported: false,
      });
      setForm(initialForm); setShowAddForm(false); load();
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  // ── Current time ──────────────────────────────────────────────────────────
  const nowTop = (today.getHours() + today.getMinutes() / 60) * PX_PER_HOUR;

  // ── Timeline column renderer ──────────────────────────────────────────────
  function TimelineCol({ dayData, isToday }: { dayData: (typeof grouped)[0]; isToday: boolean }) {
    return (
      <div
        className={`cal-week__col${isToday ? ' is-today' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const taskId = e.dataTransfer.getData('taskId');
          if (!taskId || !onTaskReschedule) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scrollTop = timelineRef.current?.scrollTop ?? 0;
          const rawH = (e.clientY - rect.top + scrollTop) / PX_PER_HOUR;
          const snapped = Math.round(rawH * 2) / 2;
          const h = Math.max(0, Math.min(23, Math.floor(snapped)));
          const m = snapped % 1 >= 0.5 ? 30 : 0;
          const ns = new Date(dayData.date); ns.setHours(h, m, 0, 0);
          onTaskReschedule(taskId, ns.toISOString());
        }}
      >
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="cal-hour-line" style={{ top: `${h * PX_PER_HOUR}px` }} />
        ))}
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={`hf${h}`} className="cal-half-line" style={{ top: `${(h + 0.5) * PX_PER_HOUR}px` }} />
        ))}
        {isToday && (
          <div className="cal-now-line" style={{ top: `${nowTop}px` }}>
            <div className="cal-now-dot" />
          </div>
        )}
        {dayData.tasks.map((task) => {
          const start = task.scheduled_start_at ? parseUTC(task.scheduled_start_at) : null;
          if (!start) return null;
          const topH   = start.getHours() + start.getMinutes() / 60;
          const heightH = (task.duration_minutes ?? 30) / 60;
          const color   = catColors.get(task.category_name ?? '') ?? 'var(--accent)';
          return (
            <div
              key={task.id}
              className="cal-event-block cal-event-block--task"
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('taskId', task.id); }}
              style={{ top: `${topH * PX_PER_HOUR}px`, height: `${Math.max(heightH * PX_PER_HOUR, 22)}px`, background: color }}
            >
              <span className="cal-event-block__title">{task.title}</span>
              {heightH * PX_PER_HOUR >= 40 && task.category_name && (
                <span className="cal-event-block__sub">{task.category_name}</span>
              )}
            </div>
          );
        })}
        {dayData.previews.map((p) => {
          const start  = parseUTC(p.start);
          const topH   = start.getHours() + start.getMinutes() / 60;
          const heightH = p.duration / 60;
          return (
            <div
              key={`preview-${p.task_id}`}
              className="cal-event-block cal-preview-block"
              style={{ top: `${topH * PX_PER_HOUR}px`, height: `${Math.max(heightH * PX_PER_HOUR, 22)}px` }}
            >
              <span className="cal-event-block__title">{p.title}</span>
              {heightH * PX_PER_HOUR >= 40 && (
                <span className="cal-event-block__sub">{fmtTime(start)}</span>
              )}
            </div>
          );
        })}
        {dayData.events.map((evt) => {
          const start = parseUTC(evt.start_at), end = parseUTC(evt.end_at);
          const topH   = start.getHours() + start.getMinutes() / 60;
          const heightH = (end.getTime() - start.getTime()) / 3600000;
          return (
            <div
              key={evt.id}
              className="cal-event-block cal-event-block--event"
              style={{ top: `${topH * PX_PER_HOUR}px`, height: `${Math.max(heightH * PX_PER_HOUR, 22)}px` }}
            >
              <span className="cal-event-block__title">{evt.title}</span>
              {heightH * PX_PER_HOUR >= 40 && (
                <span className="cal-event-block__time">{fmtTime(start)} – {fmtTime(end)}</span>
              )}
              <button
                type="button" className="cal-event-block__del"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm('Delete this event?')) return;
                  try { await deleteCalendarEvent(String(evt.id)); load(); } catch {}
                }}
              >✕</button>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cal-root">

      {/* ── Header ── */}
      <div className="cal-header">
        <div className="cal-header__top">
          <h3 className="cal-header__title">{displayLabel}</h3>
          <div className="cal-header__actions">
            <button type="button" className="cal-today-btn" onClick={goToday}>Today</button>
            <button type="button" className="cal-add-btn" onClick={() => setShowAddForm((v) => !v)}>+</button>
          </div>
        </div>
        <div className="cal-header__bottom">
          <div className="cal-nav">
            <button type="button" className="cal-nav-btn" onClick={() => shiftPeriod(-1)}>‹</button>
            <button type="button" className="cal-nav-btn" onClick={() => shiftPeriod(1)}>›</button>
          </div>
          <div className="cal-mode-switch">
            {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
              <button key={m} type="button" className={`cal-mode-btn${viewMode === m ? ' active' : ''}`} onClick={() => setViewMode(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Month view ── */}
      {viewMode === 'month' && (
        <div className="cal-month">
          <div className="cal-month__weekdays">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="cal-month__wdlabel">{d}</div>
            ))}
          </div>
          <div className="cal-month__grid">
            {grouped.map((day) => {
              const isToday    = sameDay(day.date, today);
              const isSelected = sameDay(day.date, selectedDate);
              const dots = [
                ...day.events.slice(0, 3).map(() => ({ type: 'event' as const, color: 'var(--accent)', preview: false })),
                ...day.tasks.slice(0, Math.max(0, 3 - day.events.length)).map((t) => ({
                  type: 'task' as const,
                  color: catColors.get(t.category_name ?? '') ?? 'var(--accent)',
                  preview: false,
                })),
                ...day.previews.slice(0, 2).map(() => ({ type: 'preview' as const, color: 'var(--accent)', preview: true })),
              ];
              return (
                <div
                  key={fmtKey(day.date)}
                  className={[
                    'cal-month__cell',
                    !day.isCurrentMonth ? 'cal-month__cell--other' : '',
                    isToday ? 'cal-month__cell--today' : '',
                    isSelected && !isToday ? 'cal-month__cell--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectDay(day.date)}
                >
                  <div className="cal-month__num">{day.date.getDate()}</div>
                  {dots.length > 0 && (
                    <div className="cal-month__dots">
                      {dots.map((dot, i) => (
                        <span key={i} className={`cal-dot${dot.preview ? ' cal-dot--preview' : ''}`} style={dot.preview ? {} : { background: dot.color }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day agenda */}
          <div className="cal-month__agenda">
            <div className="cal-month__agenda-date">
              {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            {selDayData && selDayData.tasks.length === 0 && selDayData.events.length === 0 && selDayData.previews.length === 0 ? (
              <div className="cal-month__agenda-empty">No events</div>
            ) : (
              <div className="cal-month__agenda-list">
                {selDayData?.tasks
                  .slice().sort((a, b) => parseUTC(a.scheduled_start_at ?? '').getTime() - parseUTC(b.scheduled_start_at ?? '').getTime())
                  .map((task) => (
                    <div
                      key={task.id}
                      className="cal-agenda-row"
                      style={{ '--dot-color': catColors.get(task.category_name ?? '') ?? 'var(--accent)' } as React.CSSProperties}
                    >
                      <div className="cal-agenda-row__dot" />
                      <div className="cal-agenda-row__content">
                        <span className="cal-agenda-row__title">{task.title}</span>
                        {task.scheduled_start_at && (
                          <span className="cal-agenda-row__time">
                            {fmtTime(parseUTC(task.scheduled_start_at))}
                            {task.duration_minutes ? ` · ${task.duration_minutes}m` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                {selDayData?.previews
                  .slice().sort((a, b) => parseUTC(a.start).getTime() - parseUTC(b.start).getTime())
                  .map((p) => (
                    <div key={`preview-${p.task_id}`} className="cal-agenda-row cal-agenda-row--preview">
                      <div className="cal-agenda-row__dot" style={{ background: 'transparent', border: '1.5px dashed var(--accent)' }} />
                      <div className="cal-agenda-row__content">
                        <span className="cal-agenda-row__title" style={{ color: 'var(--accent-dark)' }}>{p.title}</span>
                        <span className="cal-agenda-row__time">
                          {fmtTime(parseUTC(p.start))} · {p.duration}m · preview
                        </span>
                      </div>
                    </div>
                  ))}
                {selDayData?.events
                  .slice().sort((a, b) => parseUTC(a.start_at).getTime() - parseUTC(b.start_at).getTime())
                  .map((evt) => (
                    <div key={evt.id} className="cal-agenda-row cal-agenda-row--event">
                      <div className="cal-agenda-row__dot" style={{ background: 'var(--accent)' }} />
                      <div className="cal-agenda-row__content">
                        <span className="cal-agenda-row__title">{evt.title}</span>
                        <span className="cal-agenda-row__time">
                          {fmtTime(parseUTC(evt.start_at))} – {fmtTime(parseUTC(evt.end_at))}
                        </span>
                      </div>
                      <button
                        type="button" className="cal-agenda-row__del"
                        onClick={async () => {
                          if (!confirm('Delete this event?')) return;
                          try { await deleteCalendarEvent(String(evt.id)); load(); } catch {}
                        }}
                      >✕</button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Week view — single scrollable container with sticky gutter + header ── */}
      {viewMode === 'week' && (
        <div className="cal-week">
          <div className="cal-week__scroll" ref={timelineRef}>
            {/* Sticky header row: corner + 7 day headers */}
            <div className="cal-week__hdr-row">
              <div className="cal-week__corner" />
              {grouped.map((day) => {
                const isToday    = sameDay(day.date, today);
                const isSelected = sameDay(day.date, selectedDate);
                return (
                  <div
                    key={fmtKey(day.date)}
                    className={['cal-week__dayhdr', isToday ? 'is-today' : '', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ')}
                    onClick={() => selectDay(day.date)}
                  >
                    <span className="cal-week__dayhdr-wd">{day.date.toLocaleDateString([], { weekday: 'narrow' })}</span>
                    <span className={`cal-week__dayhdr-num${isToday ? ' is-today-num' : ''}`}>{day.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
            {/* Body: sticky time-label gutter + day columns */}
            <div className="cal-week__body">
              <div className="cal-week__time-col">
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="cal-time-label" style={{ top: `${h * PX_PER_HOUR}px` }}>
                    {h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </div>
                ))}
              </div>
              <div className="cal-week__cols">
                {grouped.map((day) => (
                  <TimelineCol key={fmtKey(day.date)} dayData={day} isToday={sameDay(day.date, today)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Day view ── */}
      {viewMode === 'day' && (
        <div className="cal-day">
          <div className="cal-week__scroll" ref={timelineRef}>
            <div className="cal-week__body">
              <div className="cal-week__time-col">
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="cal-time-label" style={{ top: `${h * PX_PER_HOUR}px` }}>
                    {h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </div>
                ))}
              </div>
              <div className="cal-day__col-wrap">
                <TimelineCol dayData={grouped[0] ?? { date: selectedDate, isCurrentMonth: true, events: [], tasks: [] }} isToday={sameDay(selectedDate, today)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add event form ── */}
      {showAddForm && (
        <div className="cal-add-form">
          <div className="cal-add-form__head">
            <span>Add event · {selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <button type="button" className="close-btn" onClick={() => setShowAddForm(false)}>✕</button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <input
              placeholder="Event title"
              value={form.title}
              onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
            />
            <div className="row">
              <div className="form-field">
                <label className="field-label">Start</label>
                <input type="time" step="60" value={form.start_time} onChange={(e) => setForm((v) => ({ ...v, start_time: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="field-label">End</label>
                <input type="time" step="60" value={form.end_time} onChange={(e) => setForm((v) => ({ ...v, end_time: e.target.value }))} />
              </div>
            </div>
            {error && <div className="panel-error">{error}</div>}
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
