import { useEffect, useState } from 'react';
import {
  updateTask,
  fetchSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  type Category,
  type Context,
  type Subtask,
  type Task,
} from '../lib/api';

type Props = {
  task: Task;
  categories: Category[];
  contexts: Context[];
  onSave: () => void;
  onClose: () => void;
};

export default function EditTaskModal({ task, categories, contexts, onSave, onClose }: Props) {
  const [title, setTitle]               = useState(task.title);
  const [description, setDescription]   = useState(task.description);
  const [duration, setDuration]         = useState(String(task.duration_minutes));
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [mentalLoad, setMentalLoad]     = useState(String(task.mental_load));
  const [priority, setPriority]         = useState(String(task.priority));
  const [category, setCategory]         = useState(task.category_name ?? '');
  const [context, setContext]           = useState(task.context_name ?? '');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const [subtasks, setSubtasks]         = useState<Subtask[]>([]);
  const [newStep, setNewStep]           = useState('');
  const [addingStep, setAddingStep]     = useState(false);

  useEffect(() => {
    if (task.deadline_at) {
      const d = new Date(task.deadline_at);
      setDeadlineDate(d.toISOString().split('T')[0]);
      setDeadlineTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      );
    }
  }, [task.deadline_at]);

  useEffect(() => {
    fetchSubtasks(task.id).then(setSubtasks).catch(() => {});
  }, [task.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateTask(task.id, {
        title,
        description,
        duration_minutes: Number(duration),
        category_name: category || null,
        context_name: context || null,
        deadline_at: deadlineDate
          ? new Date(`${deadlineDate}T${deadlineTime}:00`).toISOString()
          : null,
        mental_load: Number(mentalLoad),
        priority: Number(priority),
      });
      onSave();
    } catch (err) {
      setError(String(err).replace('Error: ', ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (!newStep.trim()) return;
    setAddingStep(true);
    try {
      const sub = await createSubtask(task.id, newStep.trim(), subtasks.length);
      setSubtasks((prev) => [...prev, sub]);
      setNewStep('');
    } finally {
      setAddingStep(false);
    }
  }

  async function handleToggleStep(sub: Subtask) {
    const updated = await updateSubtask(task.id, sub.id, { is_completed: !sub.is_completed });
    setSubtasks((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  }

  async function handleDeleteStep(subId: string) {
    await deleteSubtask(task.id, subId);
    setSubtasks((prev) => prev.filter((s) => s.id !== subId));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Edit task</h3>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="stack">
          <div className="form-field">
            <label className="field-label">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>

          <div className="form-field">
            <label className="field-label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes or context"
            />
          </div>

          <div className="field-grid field-grid--three">
            <div className="form-field">
              <label className="field-label">Duration (min)</label>
              <input
                type="number" min="5" value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Deadline date</label>
              <input
                type="date" value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Deadline time</label>
              <input
                type="time" step="60" value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
              />
            </div>
          </div>

          <div className="field-grid field-grid--three">
            <div className="form-field">
              <label className="field-label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="field-label">Context</label>
              <select value={context} onChange={(e) => setContext(e.target.value)}>
                <option value="">Any location</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-grid field-grid--two">
            <div className="form-field">
              <label className="field-label">Mental load (1–5)</label>
              <input
                type="number" min="1" max="5" value={mentalLoad}
                onChange={(e) => setMentalLoad(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Priority (0–10)</label>
              <input
                type="number" min="0" max="10" value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </div>

          {/* Subtask checklist */}
          <div className="form-field">
            <label className="field-label">Steps</label>
            <div className="subtask-edit-list">
              {subtasks.map((s) => (
                <div key={s.id} className={`subtask-edit-row${s.is_completed ? ' done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={s.is_completed}
                    onChange={() => handleToggleStep(s)}
                  />
                  <span>{s.title}</span>
                  <button
                    type="button"
                    className="subtask-delete-btn"
                    onClick={() => handleDeleteStep(s.id)}
                    title="Remove step"
                  >✕</button>
                </div>
              ))}
              <div className="subtask-add-row">
                <input
                  type="text"
                  placeholder="Add a step…"
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(e); } }}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={handleAddStep}
                  disabled={addingStep || !newStep.trim()}
                >Add</button>
              </div>
            </div>
          </div>

          {error && <div className="panel-error">{error}</div>}

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
