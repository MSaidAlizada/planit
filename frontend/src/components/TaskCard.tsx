import { useState } from 'react';
import { fetchSubtasks, updateSubtask, type Subtask } from '../lib/api';
import { localDateKey } from '../lib/date';

const LOAD_COLORS = ['', '#9dc8aa', '#6ab88a', '#e2b540', '#e07840', '#cc4430'];

function formatDeadline(deadline_at?: string | null): { label: string; cls: string } | null {
  if (!deadline_at) return null;
  const now = new Date();
  const due = new Date(deadline_at);
  const diffMs = due.getTime() - now.getTime();
  const diffH  = diffMs / (1000 * 60 * 60);
  const diffD  = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs < 0) return { label: `Overdue ${Math.ceil(-diffD)}d`, cls: 'task-deadline--overdue' };
  if (diffH < 24) return { label: 'Due today',                       cls: 'task-deadline--today' };
  if (diffD < 2)  return { label: 'Due tomorrow',                    cls: 'task-deadline--soon' };
  if (diffD < 7)  return { label: `Due in ${Math.ceil(diffD)}d`,     cls: 'task-deadline--soon' };
  return { label: due.toLocaleDateString([], { month: 'short', day: 'numeric' }), cls: 'task-deadline--ok' };
}

type TaskCardProps = {
  id?: string;
  title: string;
  description?: string;
  detail?: string;
  status: string;
  deadline_at?: string | null;
  mental_load?: number;
  category_name?: string | null;
  category_color?: string;
  context_name?: string | null;
  duration_minutes?: number;
  google_event_id?: string | null;
  subtask_count?: number;
  completed_subtask_count?: number;
  onComplete?: (id: string) => void;
  onSkip?: (id: string) => void;
  onReschedule?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onPin?: (id: string, isoStart: string) => void;
  onStartPomodoro?: (id: string, title: string) => void;
  showActions?: boolean;
};

export default function TaskCard({
  id,
  title,
  description,
  detail,
  status,
  deadline_at,
  mental_load = 1,
  category_name,
  category_color,
  context_name,
  duration_minutes,
  google_event_id,
  subtask_count = 0,
  completed_subtask_count = 0,
  onComplete,
  onSkip,
  onReschedule,
  onDelete,
  onEdit,
  onPin,
  onStartPomodoro,
  showActions = false,
}: TaskCardProps) {
  const [pinOpen, setPinOpen] = useState(false);
  const todayStr = localDateKey(new Date());
  const [pinDate, setPinDate] = useState(todayStr);
  const [pinTime, setPinTime] = useState('09:00');

  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[] | null>(null);
  const [subtasksLoading, setSubtasksLoading] = useState(false);

  const deadlineInfo = formatDeadline(deadline_at);
  const stripeColor = category_color ?? (
    mental_load >= 4 ? '#e07840' :
    mental_load >= 3 ? '#e2b540' :
    '#9dc8aa'
  );

  const badgeCls = status === 'scheduled'   ? 'task-badge--scheduled'
                 : status === 'completed'   ? 'task-badge--completed'
                 : status === 'skipped'     ? 'task-badge--skipped'
                 : deadlineInfo?.cls === 'task-deadline--overdue' ? 'task-badge--overdue'
                 : 'task-badge--unscheduled';

  function handlePin() {
    if (!id || !pinDate || !pinTime) return;
    const iso = new Date(`${pinDate}T${pinTime}:00`).toISOString();
    onPin?.(id, iso);
    setPinOpen(false);
  }

  async function toggleSubtasks() {
    if (!id) return;
    if (!subtasksOpen && subtasks === null) {
      setSubtasksLoading(true);
      try {
        const data = await fetchSubtasks(id);
        setSubtasks(data);
      } finally {
        setSubtasksLoading(false);
      }
    }
    setSubtasksOpen((v) => !v);
  }

  async function toggleSubtask(subtask: Subtask) {
    if (!id) return;
    const updated = await updateSubtask(id, subtask.id, { is_completed: !subtask.is_completed });
    setSubtasks((prev) => prev ? prev.map((s) => s.id === updated.id ? updated : s) : prev);
  }

  return (
    <article className="task-card">
      <div className="task-card__stripe" style={{ background: stripeColor }} />

      <div className="task-card__body">
        <div className="task-card__top">
          <span className="task-card__title">{title}</span>
          <div className="task-card__badges">
            {google_event_id && (
              <span className="gcal-dot" title="Synced to Google Calendar" />
            )}
            <span className={`task-badge ${badgeCls}`}>{status}</span>
          </div>
        </div>

        <div className="task-card__meta">
          {duration_minutes != null && (
            <span className="task-detail">{duration_minutes}m</span>
          )}
          {category_name && (
            <span className="task-detail" style={{ color: category_color ?? 'var(--muted)' }}>
              {category_name}
            </span>
          )}
          {context_name && (
            <span className="task-detail task-context">⌖ {context_name}</span>
          )}
          {detail && !duration_minutes && (
            <span className="task-detail">{detail}</span>
          )}
          {deadlineInfo && (
            <span className={`task-deadline ${deadlineInfo.cls}`}>{deadlineInfo.label}</span>
          )}
          {subtask_count > 0 && (
            <button
              type="button"
              className={`subtask-progress-btn${subtasksOpen ? ' active' : ''}`}
              onClick={toggleSubtasks}
              title="Show subtasks"
            >
              <span
                className="subtask-progress-fill"
                style={{ width: `${(completed_subtask_count / subtask_count) * 100}%` }}
              />
              <span className="subtask-progress-label">
                {completed_subtask_count}/{subtask_count}
              </span>
            </button>
          )}
        </div>

        {description && (
          <p className="task-card__desc">{description}</p>
        )}

        <div className="load-dots" title={`Mental load: ${mental_load}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="load-dot"
              style={{ background: n <= mental_load ? LOAD_COLORS[mental_load] : 'var(--panel-border)' }}
            />
          ))}
        </div>

        {/* Subtask checklist */}
        {subtasksOpen && (
          <div className="subtask-list">
            {subtasksLoading && <span className="subtask-loading">Loading…</span>}
            {subtasks && subtasks.length === 0 && (
              <span className="subtask-empty">No steps yet — add them via edit.</span>
            )}
            {subtasks && subtasks.map((s) => (
              <label key={s.id} className={`subtask-row${s.is_completed ? ' subtask-row--done' : ''}`}>
                <input
                  type="checkbox"
                  checked={s.is_completed}
                  onChange={() => toggleSubtask(s)}
                />
                <span>{s.title}</span>
              </label>
            ))}
          </div>
        )}

        {/* Inline pin picker */}
        {pinOpen && (
          <div className="pin-row">
            <input
              type="date"
              value={pinDate}
              onChange={(e) => setPinDate(e.target.value)}
            />
            <input
              type="time"
              step="300"
              value={pinTime}
              onChange={(e) => setPinTime(e.target.value)}
            />
            <button type="button" className="btn-ghost btn-sm" style={{ color: 'var(--green)' }} onClick={handlePin}>
              Set
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPinOpen(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      {showActions && id && (
        <div className="task-card__actions">
          {(status === 'scheduled' || status === 'unscheduled') && onStartPomodoro && (
            <button type="button" className="action-btn pomo-btn" onClick={() => onStartPomodoro(id, title)} title="Focus timer">
              <span className="action-btn__icon">▶</span>
              <span className="action-btn__label">Focus</span>
            </button>
          )}
          {status === 'scheduled' && (
            <>
              <button type="button" className="action-btn complete-btn" onClick={() => onComplete?.(id)} title="Mark complete">
                <span className="action-btn__icon">✓</span>
                <span className="action-btn__label">Done</span>
              </button>
              <button type="button" className="action-btn skip-btn" onClick={() => onSkip?.(id)} title="Skip">
                <span className="action-btn__icon">↷</span>
                <span className="action-btn__label">Skip</span>
              </button>
              <button type="button" className="action-btn" onClick={() => onReschedule?.(id)} title="Unschedule">
                <span className="action-btn__icon">↩</span>
                <span className="action-btn__label">Unschedule</span>
              </button>
            </>
          )}
          {(status === 'unscheduled' || status === 'skipped') && (
            <button
              type="button"
              className={`action-btn pin-btn${pinOpen ? ' active' : ''}`}
              onClick={() => setPinOpen((v) => !v)}
              title="Pin to time slot"
            >
              <span className="action-btn__icon">⊙</span>
              <span className="action-btn__label">Pin</span>
            </button>
          )}
          <button type="button" className="action-btn edit-btn" onClick={() => onEdit?.(id)} title="Edit">
            <span className="action-btn__icon">✎</span>
            <span className="action-btn__label">Edit</span>
          </button>
          <button type="button" className="action-btn delete-btn" onClick={() => onDelete?.(id)} title="Delete">
            <span className="action-btn__icon">✕</span>
            <span className="action-btn__label">Delete</span>
          </button>
        </div>
      )}
    </article>
  );
}
