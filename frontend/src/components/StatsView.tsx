import type { Habit, Task } from '../lib/api';
import { localDateKey, parseUTC } from '../lib/date';

type Props = { tasks: Task[]; habits: Habit[] };

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="stat-box">
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function StatsView({ tasks, habits }: Props) {
  const total       = tasks.length;
  const completed   = tasks.filter((t) => t.status === 'completed').length;
  const scheduled   = tasks.filter((t) => t.status === 'scheduled').length;
  const unscheduled = tasks.filter((t) => t.status === 'unscheduled').length;
  const skipped     = tasks.filter((t) => t.status === 'skipped').length;
  const decided     = completed + skipped;
  const completionRate = decided > 0 ? Math.round((completed / decided) * 100) : null;

  // Last 7 days: completed tasks by day (keyed on updated_at date)
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return localDateKey(d);
  });
  const byDay: Record<string, number> = Object.fromEntries(weekDays.map((d) => [d, 0]));
  tasks
    .filter((t) => t.status === 'completed')
    .forEach((t) => {
      const day = localDateKey(parseUTC(t.updated_at));
      if (day in byDay) byDay[day]++;
    });
  const maxBar = Math.max(1, ...Object.values(byDay));

  // Habit stats
  const activeHabits      = habits.filter((h) => h.is_active);
  const totalCompletions  = habits.reduce((s, h) => s + h.completions_count, 0);
  const bestStreak        = habits.reduce((s, h) => Math.max(s, h.best_streak), 0);
  const avgStreak         = activeHabits.length
    ? (activeHabits.reduce((s, h) => s + h.streak_count, 0) / activeHabits.length).toFixed(1)
    : '—';

  const dayLabels = weekDays.map((d) =>
    new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short' }),
  );

  return (
    <div className="workspace-stack">
      {/* Tasks overview */}
      <div className="panel">
        <div className="panel-head">
          <div><h3>Tasks</h3><p>All-time breakdown</p></div>
        </div>
        <div className="stats-grid">
          <StatCard value={total}       label="Total" />
          <StatCard value={completed}   label="Completed" />
          <StatCard value={scheduled}   label="Scheduled" />
          <StatCard value={unscheduled} label="Unscheduled" />
          <StatCard value={skipped}     label="Skipped" />
          <StatCard
            value={completionRate !== null ? `${completionRate}%` : '—'}
            label="Completion rate"
            sub="completed ÷ (completed + skipped)"
          />
        </div>
      </div>

      {/* Weekly chart */}
      <div className="panel">
        <div className="panel-head">
          <div><h3>Last 7 days</h3><p>Tasks completed per day</p></div>
        </div>
        <div className="week-chart">
          {weekDays.map((day, i) => {
            const count  = byDay[day];
            const height = Math.round((count / maxBar) * 100);
            const isToday = day === localDateKey(today);
            return (
              <div key={day} className="week-chart__col">
                <div className="week-chart__bar-wrap">
                  <div
                    className={`week-chart__bar${isToday ? ' week-chart__bar--today' : ''}`}
                    style={{ height: `${Math.max(height, count > 0 ? 8 : 2)}%` }}
                    title={`${count} completed`}
                  />
                </div>
                <span className="week-chart__count">{count > 0 ? count : ''}</span>
                <span className={`week-chart__label${isToday ? ' week-chart__label--today' : ''}`}>
                  {dayLabels[i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Habits overview */}
      <div className="panel">
        <div className="panel-head">
          <div><h3>Habits</h3><p>All-time streak and completion stats</p></div>
        </div>
        <div className="stats-grid">
          <StatCard value={habits.length}       label="Total habits" />
          <StatCard value={activeHabits.length} label="Active" />
          <StatCard value={totalCompletions}    label="Total check-ins" />
          <StatCard value={bestStreak}          label="Best streak" sub="across all habits" />
          <StatCard value={avgStreak}           label="Avg current streak" sub="active habits" />
        </div>

        {habits.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Habit</th>
                  <th>Streak</th>
                  <th>Best</th>
                  <th>Check-ins</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...habits]
                  .sort((a, b) => b.streak_count - a.streak_count)
                  .map((h) => (
                    <tr key={h.id}>
                      <td>{h.title}</td>
                      <td>{h.streak_count}</td>
                      <td>{h.best_streak}</td>
                      <td>{h.completions_count}</td>
                      <td>
                        <span className={`task-badge ${h.is_active ? 'task-badge--scheduled' : 'task-badge--skipped'}`}>
                          {h.is_active ? 'active' : 'paused'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
