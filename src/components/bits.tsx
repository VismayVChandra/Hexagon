import { useEffect, useState, type ReactNode } from 'react';
import type { Friend, FriendState, Subject } from '../types';
import { SUBJECT_COLORS } from '../data/seed';
import { STATE_LABEL } from '../data/friendsSim';

export const subjectColor = (s: Pick<Subject, 'color'> | undefined) => SUBJECT_COLORS[(s?.color ?? 0) % SUBJECT_COLORS.length];

export function SubjectDot({ subject, size = 10 }: { subject?: Subject; size?: number }) {
  return <span className="hex-dot" style={{ background: subjectColor(subject), width: size, height: size }} aria-hidden="true" />;
}

export function SubjectLabel({ subject }: { subject?: Subject }) {
  return (
    <span className="subject-label">
      <SubjectDot subject={subject} />
      {subject?.name ?? 'Removed subject'}
    </span>
  );
}

export function DemoBadge({ children = 'Demo' }: { children?: ReactNode }) {
  return <span className="badge badge-demo">{children}</span>;
}

export function FriendAvatar({ friend, state, size = 40 }: { friend: Friend; state?: FriendState; size?: number }) {
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <span
        className="hex-avatar"
        style={{ background: `oklch(0.86 0.06 ${friend.hue})`, color: `oklch(0.35 0.08 ${friend.hue})`, fontSize: size * 0.42 }}
        aria-hidden="true"
      >
        {friend.name.slice(0, 1).toUpperCase()}
      </span>
      {state && <span className={`presence presence-${state}`} aria-hidden="true" />}
    </span>
  );
}

export function StateBadge({ state }: { state: FriendState }) {
  return (
    <span className={`state state-${state}`}>
      <span className="state-dot" aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
        <polygon points="32,6 54,19 54,45 32,58 10,45 10,19" fill="none" stroke="var(--line-strong)" strokeWidth="3" strokeLinejoin="round" strokeDasharray="5 6" />
      </svg>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}

export function Field({ label, error, hint, htmlFor, children }: { label: string; error?: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint" id={`${htmlFor}-hint`}>{hint}</p>}
      {error && (
        <p className="field-error" id={`${htmlFor}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, description, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {description && (
          <p className="hint" id={`${id}-desc`}>
            {description}
          </p>
        )}
      </div>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} aria-describedby={description ? `${id}-desc` : undefined} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function ProgressRing({ value, size = 132, stroke = 10, children, label }: { value: number; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Start empty and fill on the next frame so the ring animates in (and eases between values).
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const v = Math.max(0, Math.min(1, shown));
  return (
    <div className={`ring${value >= 1 ? ' is-complete' : ''}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={v >= 1 ? 'var(--honey)' : 'var(--primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-arc"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Bar({ value, color = 'var(--primary)', label }: { value: number; color?: string; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className="bar-fill" style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}
