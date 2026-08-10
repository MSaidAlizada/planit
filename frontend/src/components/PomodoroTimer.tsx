import { usePomodoroContext } from '../context/PomodoroContext';

export default function PomodoroTimer() {
  const { taskId, taskTitle, phase, secondsLeft, isRunning, sessionsCompleted, pause, resume, stop, skip } =
    usePomodoroContext();

  if (!taskId) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const total = phase === 'work' ? 25 * 60 : 5 * 60;
  const progress = ((total - secondsLeft) / total) * 100;

  return (
    <div className="pomo-widget">
      <div className="pomo-widget__track">
        <div className="pomo-widget__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="pomo-widget__body">
        <div className="pomo-widget__top">
          <span className="pomo-widget__phase">{phase === 'work' ? '⏱ Focus' : '☕ Break'}</span>
          <button type="button" className="pomo-widget__stop" onClick={stop} title="End session">✕</button>
        </div>

        <div className="pomo-widget__time">{mm}:{ss}</div>

        <div className="pomo-widget__task" title={taskTitle ?? undefined}>
          {taskTitle}
        </div>

        <div className="pomo-widget__controls">
          {isRunning
            ? <button type="button" className="pomo-btn-ctrl" onClick={pause}>⏸ Pause</button>
            : <button type="button" className="pomo-btn-ctrl" onClick={resume}>▶ Resume</button>
          }
          <button type="button" className="pomo-btn-ctrl pomo-btn-ctrl--ghost" onClick={skip}>
            {phase === 'work' ? 'Skip to break' : 'Skip break'}
          </button>
        </div>

        {sessionsCompleted > 0 && (
          <div className="pomo-widget__sessions">
            {Array.from({ length: sessionsCompleted }).map((_, i) => (
              <span key={i} className="pomo-session-dot" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
