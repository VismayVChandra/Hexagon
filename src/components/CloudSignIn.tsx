import { useEffect, useState } from 'react';
import { backToEmail, requestCode, saveName, submitCode, useCloud } from '../cloud/cloud';
import { formatFriendCode } from '../cloud/presence';
import { useStore } from '../store/store';
import { Field } from './bits';
import { Icon } from './Icon';

const RESEND_SECONDS = 30;

/** Three quiet steps: email -> code from the email -> display name. No passwords. */
export function CloudSignIn() {
  const c = useCloud();
  const { data } = useStore();
  const [email, setEmail] = useState(c.email);
  const [code, setCode] = useState('');
  const [name, setName] = useState(data.settings.displayName);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (c.phase === 'code-sent') setWait(RESEND_SECONDS);
  }, [c.phase]);
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const err = c.error ? (
    <p className="field-error" role="alert">
      {c.error}
    </p>
  ) : null;

  if (c.phase === 'starting') return <p className="muted">Checking your account…</p>;

  if (c.phase === 'code-sent') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submitCode(code);
        }}
      >
        <p>
          We emailed a code to <strong>{c.email}</strong>. Type it below. It can take a minute to arrive, so check spam too.
        </p>
        <Field label="Code from the email" htmlFor="cloud-code">
          <input id="cloud-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} maxLength={12} aria-invalid={!!c.error} onChange={(e) => setCode(e.target.value)} />
        </Field>
        {err}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={c.busy}>
            {c.busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className="btn btn-quiet" disabled={c.busy || wait > 0} onClick={() => void requestCode(c.email)}>
            {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
          </button>
          <button type="button" className="link-btn" onClick={backToEmail}>
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  if (c.phase === 'needs-name') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void saveName(name);
        }}
      >
        <p>Signed in. What should your friends call you?</p>
        <Field label="Your name" htmlFor="cloud-name" hint="1 to 30 characters. Friends you accept will see this.">
          <input id="cloud-name" autoComplete="given-name" autoFocus value={name} maxLength={30} aria-invalid={!!c.error} onChange={(e) => setName(e.target.value)} />
        </Field>
        {err}
        <button type="submit" className="btn btn-primary" disabled={c.busy}>
          {c.busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    );
  }

  // signed-out
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void requestCode(email);
      }}
    >
      {c.pendingInvite && (
        <p className="banner banner-info">
          <Icon name="users" />
          <span>
            You were invited with code <strong>{formatFriendCode(c.pendingInvite)}</strong>. Sign in and we’ll add them.
          </span>
        </p>
      )}
      <Field label="Email" htmlFor="cloud-email" hint="We’ll send a one-time code. No password needed.">
        <input id="cloud-email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254} aria-invalid={!!c.error} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {err}
      <button type="submit" className="btn btn-primary" disabled={c.busy}>
        {c.busy ? 'Sending…' : 'Email me a code'}
      </button>
    </form>
  );
}
