import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const WORK_SECONDS  = 25 * 60;
const BREAK_SECONDS = 5  * 60;

type Phase = 'work' | 'break';

type PomodoroState = {
  taskId: string | null;
  taskTitle: string | null;
  phase: Phase;
  secondsLeft: number;
  isRunning: boolean;
  sessionsCompleted: number;
  start: (taskId: string, taskTitle: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skip: () => void;
};

const PomodoroContext = createContext<PomodoroState | null>(null);

export function usePomodoroContext() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoroContext must be used inside PomodoroProvider');
  return ctx;
}

function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [taskId, setTaskId]                       = useState<string | null>(null);
  const [taskTitle, setTaskTitle]                 = useState<string | null>(null);
  const [phase, setPhase]                         = useState<Phase>('work');
  const [secondsLeft, setSecondsLeft]             = useState(WORK_SECONDS);
  const [isRunning, setIsRunning]                 = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  const originalTitle = useRef(document.title);

  // Tick
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Phase transition when timer hits 0
  useEffect(() => {
    if (!isRunning || secondsLeft > 0) return;
    if (phase === 'work') {
      setSessionsCompleted((n) => n + 1);
      notify('Focus session complete!', `Great work on "${taskTitle}". Time for a 5-minute break.`);
      setPhase('break');
      setSecondsLeft(BREAK_SECONDS);
    } else {
      notify('Break over!', 'Ready for another focus session?');
      setPhase('work');
      setSecondsLeft(WORK_SECONDS);
    }
  }, [secondsLeft, isRunning, phase, taskTitle]);

  // Update tab title
  useEffect(() => {
    if (!taskId) {
      document.title = originalTitle.current;
      return;
    }
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const ss = String(secondsLeft % 60).padStart(2, '0');
    const icon = phase === 'work' ? '⏱' : '☕';
    document.title = `${icon} ${mm}:${ss} — planit`;
    return () => { document.title = originalTitle.current; };
  }, [taskId, secondsLeft, phase]);

  const start = useCallback((id: string, title: string) => {
    requestNotificationPermission();
    setTaskId(id);
    setTaskTitle(title);
    setPhase('work');
    setSecondsLeft(WORK_SECONDS);
    setSessionsCompleted(0);
    setIsRunning(true);
  }, []);

  const pause  = useCallback(() => setIsRunning(false), []);
  const resume = useCallback(() => setIsRunning(true), []);

  const stop = useCallback(() => {
    setIsRunning(false);
    setTaskId(null);
    setTaskTitle(null);
    setPhase('work');
    setSecondsLeft(WORK_SECONDS);
    setSessionsCompleted(0);
    document.title = originalTitle.current;
  }, []);

  const skip = useCallback(() => {
    if (phase === 'work') {
      setPhase('break');
      setSecondsLeft(BREAK_SECONDS);
    } else {
      setPhase('work');
      setSecondsLeft(WORK_SECONDS);
    }
  }, [phase]);

  return (
    <PomodoroContext.Provider value={{
      taskId, taskTitle, phase, secondsLeft, isRunning, sessionsCompleted,
      start, pause, resume, stop, skip,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}
