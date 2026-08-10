// ── Auth helpers ─────────────────────────────────────────────────────────

export type AuthUser = {
  user_id: string;
  username: string;
  display_name: string;
};

// Token is set as an httpOnly cookie by the server — never exposed to JS.
// These response types only carry non-sensitive user info.
export type UserInfoResponse = {
  user_id: string;
  username: string;
  display_name: string;
};

// credentials: 'include' ensures the session cookie is sent on every request.
// Since the Vite dev proxy makes all /api calls same-origin this is redundant
// in development, but required if the frontend ever talks to the backend directly.
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, credentials: 'include' });
}

export async function register(username: string, password: string, displayName?: string): Promise<UserInfoResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, display_name: displayName ?? '' }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error(data.detail ?? 'Registration failed');
  }
  return res.json();
}

export async function logoutUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function updateProfile(displayName: string): Promise<AuthUser> {
  const res = await authFetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Update failed' }));
    throw new Error(data.detail ?? 'Update failed');
  }
  return res.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await authFetch('/api/auth/me/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Password change failed' }));
    throw new Error(data.detail ?? 'Password change failed');
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const res = await authFetch('/api/auth/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to delete account' }));
    throw new Error(data.detail ?? 'Failed to delete account');
  }
}

export async function loginUser(username: string, password: string): Promise<UserInfoResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(data.detail ?? 'Login failed');
  }
  return res.json();
}

// ── Tasks ────────────────────────────────────────────────────────────────

export type Task = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  category_name?: string | null;
  context_name?: string | null;
  deadline_at?: string | null;
  mental_load: number;
  priority: number;
  status: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  google_event_id?: string | null;
  created_at: string;
  updated_at: string;
  subtask_count: number;
  completed_subtask_count: number;
};

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
};

export async function fetchTasks(): Promise<Task[]> {
  const res = await authFetch('/api/tasks');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch tasks: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function createTask(payload: Partial<Task>) {
  const res = await authFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Create task failed');
  return res.json();
}

export async function updateTask(taskId: string, payload: Partial<Task>): Promise<Task> {
  const res = await authFetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to update task: ${txt}`);
  }
  return res.json();
}

// ── Subtasks ─────────────────────────────────────────────────────────────

export async function fetchSubtasks(taskId: string): Promise<Subtask[]> {
  const res = await authFetch(`/api/tasks/${taskId}/subtasks`);
  if (!res.ok) throw new Error('Failed to fetch subtasks');
  return res.json();
}

export async function createSubtask(taskId: string, title: string, position?: number): Promise<Subtask> {
  const res = await authFetch(`/api/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, position: position ?? 0 }),
  });
  if (!res.ok) throw new Error('Failed to create subtask');
  return res.json();
}

export async function updateSubtask(taskId: string, subtaskId: string, payload: Partial<Subtask>): Promise<Subtask> {
  const res = await authFetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update subtask');
  return res.json();
}

export async function deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
  const res = await authFetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete subtask');
}

// ── Contexts ─────────────────────────────────────────────────────────────

export type AvailabilityWindow = {
  days: number[];   // 0=Mon … 6=Sun
  start: string;   // "HH:MM"
  end: string;     // "HH:MM"
};

export type Context = {
  id: string;
  name: string;
  color: string;
  availability: string;  // JSON-encoded AvailabilityWindow[]
  created_at: string;
};

export async function fetchContexts(): Promise<Context[]> {
  const res = await authFetch('/api/contexts');
  if (!res.ok) throw new Error('Failed to fetch contexts');
  return res.json();
}

export async function createContext(payload: { name: string; color?: string; availability?: string }): Promise<Context> {
  const res = await authFetch('/api/contexts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create context: ${txt}`);
  }
  return res.json();
}

export async function updateContext(
  contextId: string,
  payload: { name: string; color: string; availability: string },
): Promise<Context> {
  const res = await authFetch(`/api/contexts/${contextId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to update context: ${txt}`);
  }
  return res.json();
}

export async function deleteContext(contextId: string): Promise<{ message: string; untagged_tasks: number }> {
  const res = await authFetch(`/api/contexts/${contextId}`, { method: 'DELETE' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete context: ${txt}`);
  }
  return res.json();
}

// ── Categories ───────────────────────────────────────────────────────────

export type Category = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export async function fetchCategories(): Promise<Category[]> {
  const res = await authFetch('/api/categories');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch categories: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function createCategory(payload: { name: string; color?: string }): Promise<Category> {
  const res = await authFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create category: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function deleteCategory(categoryId: string): Promise<{ message: string; uncategorized_tasks: number }> {
  const res = await authFetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete category: ${res.status} ${txt}`);
  }
  return res.json();
}

// ── Calendar events ──────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  external_id?: string | null;
  title: string;
  start_at: string;
  end_at: string;
  source_calendar?: string;
  is_busy?: boolean;
  is_imported?: boolean;
};

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const res = await authFetch('/api/calendar');
  if (!res.ok) throw new Error('Failed to fetch calendar');
  return res.json();
}

export async function createCalendarEvent(payload: Partial<CalendarEvent>) {
  const res = await authFetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Create calendar event failed');
  return res.json();
}

export async function deleteCalendarEvent(eventId: string): Promise<{ message: string }> {
  const res = await authFetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete calendar event: ${res.status} ${txt}`);
  }
  return res.json();
}

// ── Schedule ─────────────────────────────────────────────────────────────

export async function autoScheduleTasks(): Promise<{ scheduled: number; message: string }> {
  const res = await authFetch('/api/schedule/auto', { method: 'POST' });
  if (!res.ok) throw new Error('Auto-schedule failed');
  return res.json();
}

export async function getScheduleSuggestions(): Promise<{
  unscheduled_count: number;
  suggestions: Array<{
    name: string;
    description: string;
    placements: Record<string, { task_id: string; title: string; start: string; end: string; duration: number }>;
    score: number;
  }>;
}> {
  const res = await authFetch('/api/schedule/suggestions');
  if (!res.ok) throw new Error('Failed to get suggestions');
  return res.json();
}

export async function applySchedule(suggestionIndex: number): Promise<{ applied: number; suggestion_name: string; message: string }> {
  const res = await authFetch(`/api/schedule/apply?suggestion_index=${suggestionIndex}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to apply schedule');
  return res.json();
}

// ── Task actions ─────────────────────────────────────────────────────────

export async function completeTask(taskId: string): Promise<Task> {
  const res = await authFetch(`/api/tasks/${taskId}/complete`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to complete task');
  return res.json();
}

export async function clearCompletedTasks(): Promise<{ cleared: number; message: string }> {
  const res = await authFetch('/api/tasks/clear-completed', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear completed tasks');
  return res.json();
}

export async function skipTask(taskId: string): Promise<Task> {
  const res = await authFetch(`/api/tasks/${taskId}/skip`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to skip task');
  return res.json();
}

export async function pinTask(taskId: string, scheduledStartAt: string): Promise<Task> {
  const res = await authFetch(`/api/tasks/${taskId}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_start_at: scheduledStartAt }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to pin task: ${txt}`);
  }
  return res.json();
}

export async function rescheduleTask(taskId: string): Promise<Task> {
  const res = await authFetch(`/api/tasks/${taskId}/reschedule`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reschedule task');
  return res.json();
}

export async function deleteTask(taskId: string): Promise<{ message: string }> {
  const res = await authFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete task: ${res.status} ${txt}`);
  }
  return res.json();
}

// ── Preferences ──────────────────────────────────────────────────────────

export type Preferences = {
  id: string;
  sleep_start: string;
  sleep_end: string;
  buffer_minutes: number;
  max_daily_load: number;
};

export async function getPreferences(): Promise<Preferences> {
  const res = await authFetch('/api/preferences');
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return res.json();
}

export async function updatePreferences(prefs: Partial<Preferences>): Promise<Preferences> {
  const res = await authFetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

// ── Habits ───────────────────────────────────────────────────────────────

export type Habit = {
  id: string;
  title: string;
  duration_minutes: number;
  mental_load: number;
  recurrence_rule: string;
  recurrence_label?: string;
  is_active: boolean;
  created_at: string;
  streak_count: number;
  best_streak: number;
  last_completed_at?: string | null;
  next_due_at?: string | null;
  completions_count: number;
  is_due: boolean;
};

export async function fetchHabits(): Promise<Habit[]> {
  const res = await authFetch('/api/habits');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch habits: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function createHabit(payload: Partial<Habit>): Promise<Habit> {
  const res = await authFetch('/api/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Create habit failed');
  return res.json();
}

export async function updateHabit(habitId: string, payload: Partial<Habit>): Promise<Habit> {
  const res = await authFetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Update habit failed');
  return res.json();
}

export async function completeHabit(habitId: string): Promise<Habit> {
  const res = await authFetch(`/api/habits/${habitId}/complete`, { method: 'POST' });
  if (!res.ok) throw new Error('Complete habit failed');
  return res.json();
}

export type HabitOccurrence = {
  habit_id: string;
  title: string;
  date: string;
  duration_minutes: number;
  mental_load: number;
};

export async function fetchHabitOccurrences(start: string, end: string): Promise<HabitOccurrence[]> {
  const res = await authFetch(`/api/habits/occurrences?start=${start}&end=${end}`);
  if (!res.ok) throw new Error('Failed to fetch habit occurrences');
  return res.json();
}

export async function uncompleteHabit(habitId: string): Promise<Habit> {
  const res = await authFetch(`/api/habits/${habitId}/complete`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Uncomplete habit failed');
  return res.json();
}

export type HabitHeatmapDay = {
  date: string;
  completed: number;
  due: number;
  ratio: number;
};

export async function fetchHabitHeatmap(year?: number): Promise<HabitHeatmapDay[]> {
  const params = year ? `?year=${year}` : '';
  const res = await authFetch(`/api/habits/heatmap${params}`);
  if (!res.ok) throw new Error('Failed to fetch habit heatmap');
  return res.json();
}

export async function deleteHabit(habitId: string): Promise<{ message: string; deleted_completions?: number }> {
  const res = await authFetch(`/api/habits/${habitId}`, { method: 'DELETE' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete habit: ${res.status} ${txt}`);
  }
  return res.json();
}

// ── iCal feeds ──────────────────────────────────────────────────────────

export type CalendarFeed = {
  id: string;
  name: string;
  url: string;
  last_synced_at: string | null;
  event_count: number;
  is_active: boolean;
  created_at: string;
};

export async function fetchFeeds(): Promise<CalendarFeed[]> {
  const res = await authFetch('/api/feeds');
  if (!res.ok) throw new Error('Failed to fetch feeds');
  return res.json();
}

export async function createFeed(payload: { name: string; url: string }): Promise<CalendarFeed> {
  const res = await authFetch('/api/feeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to add feed: ${txt}`);
  }
  return res.json();
}

export async function syncFeed(feedId: string): Promise<CalendarFeed> {
  const res = await authFetch(`/api/feeds/${feedId}/sync`, { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sync failed: ${txt}`);
  }
  return res.json();
}

export async function deleteFeed(feedId: string): Promise<void> {
  const res = await authFetch(`/api/feeds/${feedId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete feed');
}

// ── Google Calendar ──────────────────────────────────────────────────────

export type GoogleStatus = {
  connected: boolean;
  email: string;
  last_synced_at: string | null;
  configured: boolean;
};

export async function getGoogleStatus(): Promise<GoogleStatus> {
  const res = await authFetch('/api/google/status');
  if (!res.ok) throw new Error('Failed to get Google status');
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<{ url: string; state: string }> {
  const res = await authFetch('/api/google/auth-url');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cannot get auth URL: ${txt}`);
  }
  return res.json();
}

export async function syncGoogle(): Promise<{ synced: number; message: string }> {
  const res = await authFetch('/api/google/sync', { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google sync failed: ${txt}`);
  }
  return res.json();
}

export async function disconnectGoogle(): Promise<void> {
  const res = await authFetch('/api/google/disconnect', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to disconnect Google');
}

// ── Email digest ─────────────────────────────────────────────────────────

export type DigestStatus = {
  email: string;
  email_verified: boolean;
  digest_enabled: boolean;
  digest_frequency: 'daily' | 'weekly';
  digest_time: string;
  digest_day: number; // 1=Mon … 7=Sun
};

export async function getDigestStatus(): Promise<DigestStatus> {
  const res = await authFetch('/api/digest/status');
  if (!res.ok) throw new Error('Failed to fetch digest status');
  return res.json();
}

export async function sendVerificationCode(email: string): Promise<void> {
  const res = await authFetch('/api/digest/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to send code' }));
    throw new Error(data.detail ?? 'Failed to send code');
  }
}

export async function confirmVerificationCode(code: string): Promise<void> {
  const res = await authFetch('/api/digest/confirm-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Invalid code' }));
    throw new Error(data.detail ?? 'Invalid code');
  }
}

export async function updateDigestSettings(payload: Partial<DigestStatus>): Promise<DigestStatus> {
  const res = await authFetch('/api/digest/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to save' }));
    throw new Error(data.detail ?? 'Failed to save');
  }
  return res.json();
}

export async function sendTestDigest(): Promise<{ message: string }> {
  const res = await authFetch('/api/digest/send-test', { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to send' }));
    throw new Error(data.detail ?? 'Failed to send');
  }
  return res.json();
}
