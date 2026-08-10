import { useEffect, useState, useMemo } from 'react';
import { createCalendarEvent, fetchCalendarEvents, type CalendarEvent } from '../lib/api';

type FormState = {
  title: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
};

const initialForm: FormState = { title: '', start_date: '', start_time: '09:00', end_date: '', end_time: '10:00' };

export default function CalendarView({ scheduledTasks = [] }: { scheduledTasks?: {id: string, title: string, start_at: string, end_at: string}[] }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetchCalendarEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
  };

  useEffect(() => {
    load();
  }, []);

  const combinedEvents = useMemo(() => {
    if (!events) return null;
    const all = [
      ...events,
      ...scheduledTasks.map(t => ({
        id: t.id,
        title: `[Task] ${t.title}`,
        start_at: t.start_at,
        end_at: t.end_at,
        source_calendar: 'planit',
        is_busy: true
      }))
    ];
    return all.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, scheduledTasks]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCalendarEvent({
        title: form.title,
        start_at: new Date(`${form.start_date}T${form.start_time}:00`).toISOString(),
        end_at: new Date(`${form.end_date}T${form.end_time}:00`).toISOString(),
        source_calendar: 'local',
        is_busy: true,
        is_imported: false,
      });
      setForm(initialForm);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="calendar-view panel">
      <div className="panel-head">
        <h3>Calendar</h3>
        <p>Current events</p>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <div className="form-field">
          <label className="field-label" htmlFor="eventTitle">Event title</label>
          <input
            id="eventTitle"
            placeholder="Event title"
            value={form.title}
            onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
          />
        </div>
        <div className="row">
          <div className="form-field">
            <label className="field-label" htmlFor="eventStartDate">Start date</label>
            <input
              id="eventStartDate"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((v) => ({ ...v, start_date: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="eventStartTime">Start time</label>
            <input
              id="eventStartTime"
              type="time"
              step="60"
              value={form.start_time}
              onChange={(e) => setForm((v) => ({ ...v, start_time: e.target.value }))}
            />
          </div>
        </div>
        <div className="row">
          <div className="form-field">
            <label className="field-label" htmlFor="eventEndDate">End date</label>
            <input
              id="eventEndDate"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((v) => ({ ...v, end_date: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="eventEndTime">End time</label>
            <input
              id="eventEndTime"
              type="time"
              step="60"
              value={form.end_time}
              onChange={(e) => setForm((v) => ({ ...v, end_time: e.target.value }))}
            />
          </div>
        </div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button>
      </form>

      {error ? <div className="panel-error">{error}</div> : null}

      {combinedEvents === null ? (
        <div className="panel-loading">Loading…</div>
      ) : combinedEvents.length === 0 ? (
        <div className="panel-empty">No events yet.</div>
      ) : (
        <ul className="event-list">
          {combinedEvents.map((e) => (
            <li key={e.id} className={`event-row ${e.source_calendar === 'planit' ? 'task-event' : ''}`}>
              <div className="event-time">{new Date(e.start_at).toLocaleString()}</div>
              <div className="event-title">{e.title}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}