type Props = {
  onLogin: () => void;
  onSignUp: () => void;
};

const FEATURES = [
  {
    icon: '✦',
    title: 'Smart scheduling',
    body: 'Tell planit your tasks and deadlines. It finds the best open slots in your calendar — around meetings, sleep, and buffer time.',
  },
  {
    icon: '⊙',
    title: 'Context-aware',
    body: "Tag tasks with a location context like Home or Work. The scheduler only places them when you're actually there.",
  },
  {
    icon: '↻',
    title: 'Habit tracking',
    body: 'Build recurring routines with streak tracking. planit surfaces habits that are due so nothing slips through the cracks.',
  },
  {
    icon: '◑',
    title: 'Mental load balancing',
    body: 'Rate tasks by cognitive effort. planit spreads heavy work across your week so you never hit a wall mid-day.',
  },
];

const PREVIEW_EVENTS = [
  { label: 'Write project report', time: '9:00 – 10:30', load: 4, color: '#c07a3a' },
  { label: 'Review pull requests',  time: '11:00 – 11:30', load: 2, color: '#6ab88a' },
  { label: 'Lunch break',           time: '12:00 – 13:00', load: 1, color: '#9dc8aa' },
  { label: 'Deep work session',     time: '14:00 – 16:00', load: 5, color: '#e07840' },
  { label: 'Respond to emails',     time: '16:15 – 16:45', load: 2, color: '#6ab88a' },
];

export default function LandingPage({ onLogin, onSignUp }: Props) {
  return (
    <div className="lp-shell">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <span className="lp-nav__logo">planit</span>
        <div className="lp-nav__actions">
          <button type="button" className="lp-nav__login" onClick={onLogin}>Log in</button>
          <button type="button" className="lp-cta-primary lp-nav__cta" onClick={onSignUp}>Get started</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero__inner">
          <p className="lp-eyebrow">Focus without friction</p>
          <h1 className="lp-hero__headline">
            Your calendar,<br />finally on your side.
          </h1>
          <p className="lp-hero__sub">
            planit automatically schedules your tasks around your life — respecting your deadlines,
            energy levels, sleep, and the places you'll actually be.
          </p>
          <div className="lp-hero__ctas">
            <button type="button" className="lp-cta-primary" onClick={onSignUp}>
              Get started free →
            </button>
            <button type="button" className="lp-cta-ghost" onClick={onLogin}>
              I have an account
            </button>
          </div>
        </div>

        {/* ── App preview mockup ── */}
        <div className="lp-hero__visual" aria-hidden>
          <div className="lp-preview">
            <div className="lp-preview__bar">
              <span className="lp-preview__dot" style={{ background: '#cc4430' }} />
              <span className="lp-preview__dot" style={{ background: '#e2b540' }} />
              <span className="lp-preview__dot" style={{ background: '#3e8a5c' }} />
            </div>
            <div className="lp-preview__rows">
              {PREVIEW_EVENTS.map((row, i) => (
                <div key={i} className="lp-preview__event">
                  <span className="lp-preview__stripe" style={{ background: row.color }} />
                  <div className="lp-preview__event-body">
                    <span className="lp-preview__event-title">{row.label}</span>
                    <span className="lp-preview__event-time">{row.time}</span>
                  </div>
                  <div className="lp-preview__dots">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="lp-preview__load-dot"
                        style={{ background: n <= row.load ? row.color : 'var(--lp-dot-empty)' }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features">
        <div className="lp-features__inner">
          <h2 className="lp-section-title">Everything you need to stay on track</h2>
          <div className="lp-features__grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature-card">
                <span className="lp-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="lp-cta-banner">
        <div className="lp-cta-banner__content">
          <h2>Ready to take back your time?</h2>
          <button type="button" className="lp-cta-primary lp-cta-banner__btn" onClick={onSignUp}>
            Create your free account →
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <span className="lp-nav__logo">planit</span>
        <span>Built to protect your focus.</span>
      </footer>
    </div>
  );
}
