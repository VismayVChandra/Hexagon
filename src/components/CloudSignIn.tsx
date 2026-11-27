import { useState } from 'react';
import { backToSignIn, hadAccount, resendConfirmation, saveName, sendPasswordReset, setNewPassword, signIn, signUp, useCloud } from '../cloud/cloud';
import { formatFriendCode } from '../cloud/presence';
import { MIN_PASSWORD } from '../cloud/validate';
import { useStore } from '../store/store';
import { Field } from './bits';
import { Icon } from './Icon';

type View = 'signup' | 'signin' | 'forgot';

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: 'new-password' | 'current-password'; invalid: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} maxLength={72} aria-invalid={invalid} autoCapitalize="none" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="pw-toggle" aria-pressed={show} onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

/** Everything before the friend code: create an account or sign in (email + password), confirm email, reset password, pick a name. */
export function CloudSignIn() {
  const c = useCloud();
  const { data } = useStore();
  const [view, setView] = useState<View>(() => (hadAccount() ? 'signin' : 'signup'));
  const [email, setEmail] = useState(c.email);
  const [password, setPassword] = useState('');
  const [name, setName] = useState(data.settings.displayName);

  const err = c.error ? (
    <p className="field-error" role="alert">
      {c.error}
    </p>
  ) : null;
  const notice = c.notice ? <p className="banner banner-info" role="status">{c.notice}</p> : null;
  const invite = c.pendingInvite ? (
    <p className="banner banner-info">
      <Icon name="users" />
      <span>
        You were invited with code <strong>{formatFriendCode(c.pendingInvite)}</strong>. Finish setting up and we’ll add them.
      </span>
    </p>
  ) : null;

  if (c.phase === 'starting') return <p className="muted">Checking your account…</p>;

  if (c.phase === 'check-email') {
    return (
      <div className="stack">
        {notice}
        <p>
          We sent a confirmation link to <strong>{c.email}</strong>. Tap it, then come back here and sign in with your password.
        </p>
        <p className="muted small">It can take a minute, and sometimes lands in spam. The link may open in your browser rather than this app, and that’s fine: you’re confirmed either way.</p>
        {err}
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEmail(c.email);
              setView('signin');
              backToSignIn();
            }}
          >
            I’ve confirmed, sign in
          </button>
          <button type="button" className="btn btn-quiet" disabled={c.busy} onClick={() => void resendConfirmation()}>
            Resend email
          </button>
          <button type="button" className="link-btn" onClick={backToSignIn}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  if (c.phase === 'reset-password') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void setNewPassword(password).then(() => setPassword(''));
        }}
      >
        <p>
          Choose a new password for <strong>{c.email}</strong>.
        </p>
        <Field label="New password" htmlFor="cloud-newpw" hint={`At least ${MIN_PASSWORD} characters.`}>
          <PasswordInput id="cloud-newpw" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!c.error} />
        </Field>
        {err}
        <button type="submit" className="btn btn-primary" disabled={c.busy}>
          {c.busy ? 'Saving…' : 'Save new password'}
        </button>
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
        {notice}
        {invite}
        <p>You’re in. What should your friends call you?</p>
        <p className="muted small">Friends you add will be able to see when you’re studying (never your subject, sessions or notes). You can switch that off any time in Settings → Privacy.</p>
        <Field label="Your name" htmlFor="cloud-name" hint="1 to 30 characters. This is what your friends see.">
          <input id="cloud-name" autoComplete="given-name" autoFocus value={name} maxLength={30} aria-invalid={!!c.error} onChange={(e) => setName(e.target.value)} />
        </Field>
        {err}
        <button type="submit" className="btn btn-primary" disabled={c.busy}>
          {c.busy ? 'Setting up…' : 'Get my friend code'}
        </button>
      </form>
    );
  }

  // signed-out
  const switchView = (v: View) => {
    setView(v);
    backToSignIn(); // clears any message
  };

  if (view === 'forgot') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void sendPasswordReset(email);
        }}
      >
        {notice}
        <p>Enter your email and we’ll send a link to choose a new password.</p>
        <Field label="Email" htmlFor="cloud-email">
          <input id="cloud-email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254} aria-invalid={!!c.error} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {err}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={c.busy}>
            {c.busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" className="link-btn" onClick={() => switchView('signin')}>
            Back to sign in
          </button>
        </div>
      </form>
    );
  }

  const signingUp = view === 'signup';
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (signingUp ? signUp(email, password) : signIn(email, password));
      }}
    >
      {invite}
      {notice}
      <div role="radiogroup" aria-label="Account" className="segmented segmented-sm">
        <button type="button" role="radio" aria-checked={signingUp} className={`segment${signingUp ? ' is-on' : ''}`} onClick={() => switchView('signup')}>
          Create account
        </button>
        <button type="button" role="radio" aria-checked={!signingUp} className={`segment${!signingUp ? ' is-on' : ''}`} onClick={() => switchView('signin')}>
          Sign in
        </button>
      </div>
      <Field label="Email" htmlFor="cloud-email">
        <input id="cloud-email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254} aria-invalid={!!c.error} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="cloud-pw" hint={signingUp ? `At least ${MIN_PASSWORD} characters.` : undefined}>
        <PasswordInput id="cloud-pw" value={password} onChange={setPassword} autoComplete={signingUp ? 'new-password' : 'current-password'} invalid={!!c.error} />
      </Field>
      {err}
      <button type="submit" className="btn btn-primary" disabled={c.busy}>
        {c.busy ? (signingUp ? 'Creating…' : 'Signing in…') : signingUp ? 'Create account' : 'Sign in'}
      </button>
      {!signingUp && (
        <button type="button" className="link-btn" onClick={() => switchView('forgot')}>
          Forgot your password?
        </button>
      )}
    </form>
  );
}
