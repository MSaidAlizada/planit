import { useState } from 'react';
import { createTask, type Category, type Context } from '../lib/api';

type TaskForm = {
  title: string;
  description: string;
  duration_minutes: string;
  deadline_date: string;
  deadline_time: string;
  mental_load: string;
  priority: string;
  category_name: string;
  context_name: string;
};

const emptyForm: TaskForm = {
  title: '',
  description: '',
  duration_minutes: '30',
  deadline_date: '',
  deadline_time: '17:00',
  mental_load: '2',
  priority: '0',
  category_name: '',
  context_name: '',
};

type Props = {
  categories: Category[];
  contexts: Context[];
  onSave: () => void;
  onClose: () => void;
};

export default function AddTaskModal({ categories, contexts, onSave, onClose }: Props) {
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof TaskForm, value: string) {
    setForm((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createTask({
        title: form.title,
        description: form.description,
        duration_minutes: Number(form.duration_minutes),
        category_name: form.category_name || null,
        context_name: form.context_name || null,
        deadline_at:
          form.deadline_date && form.deadline_time
            ? new Date(`${form.deadline_date}T${form.deadline_time}:00`).toISOString()
            : null,
        mental_load: Number(form.mental_load),
        priority: Number(form.priority),
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
          <h3>New task</h3>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          {/* Title + description */}
          <div className="field-grid">
            <div className="form-field">
              <label className="field-label">Title</label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="What needs to get done?"
                required
                autoFocus
              />
            </div>
            <div className="form-field">
              <label className="field-label">Description <span className="field-optional">optional</span></label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Notes or details…"
                rows={2}
              />
            </div>
          </div>

          {/* Duration + deadline */}
          <div className="field-grid field-grid--three">
            <div className="form-field">
              <label className="field-label">Duration (min)</label>
              <input
                type="number" min="5" placeholder="30"
                value={form.duration_minutes}
                onChange={(e) => set('duration_minutes', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Deadline date <span className="field-optional">optional</span></label>
              <input
                type="date"
                value={form.deadline_date}
                onChange={(e) => set('deadline_date', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Deadline time</label>
              <input
                type="time" step="60"
                value={form.deadline_time}
                onChange={(e) => set('deadline_time', e.target.value)}
              />
            </div>
          </div>

          {/* Category + context */}
          <div className="field-grid field-grid--two">
            <div className="form-field">
              <label className="field-label">Category</label>
              <select value={form.category_name} onChange={(e) => set('category_name', e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="field-label">Context</label>
              <select value={form.context_name} onChange={(e) => set('context_name', e.target.value)}>
                <option value="">Any location</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Mental load + priority */}
          <div className="field-grid field-grid--two">
            <div className="form-field">
              <label className="field-label">Mental load (1–5)</label>
              <input
                type="number" min="1" max="5"
                value={form.mental_load}
                onChange={(e) => set('mental_load', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Priority (0–10)</label>
              <input
                type="number" min="0" max="10"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
              />
            </div>
          </div>

          {error && <div className="panel-error">{error}</div>}

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add task'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <span className="field-help">Tasks land in the backlog — run a plan from the dashboard to schedule them.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
