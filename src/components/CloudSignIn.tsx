import { useState } from 'react';
import { enableFriends, useCloud } from '../cloud/cloud';
import { formatFriendCode } from '../cloud/presence';
import { useStore } from '../store/store';
import { Field } from './bits';
import { Icon } from './Icon';

/** One step: pick a name. No email, no password. */
export function CloudSignIn() {
  const c = useCloud();
  const { data } = useStore();
  const [name, setName] = useState(data.settings.displayName);

  if (c.phase === 'starting') return <p className="muted">Checking your friends account…</p>;

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void enableFriends(name);
      }}
    >
      {c.pendingInvite && (
        <p className="banner banner-info">
          <Icon name="users" />
          <span>
            You were invited with code <strong>{formatFriendCode(c.pendingInvite)}</strong>. Turn on friends and we’ll add them.
          </span>
        </p>
      )}
      <Field label="Your name" htmlFor="cloud-name" hint="1 to 30 characters. This is what your friends see.">
        <input id="cloud-name" autoComplete="given-name" value={name} maxLength={30} aria-invalid={!!c.error} onChange={(e) => setName(e.target.value)} />
      </Field>
      {c.error && (
        <p className="field-error" role="alert">
          {c.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={c.busy}>
        {c.busy ? 'Setting up…' : 'Get my friend code'}
      </button>
    </form>
  );
}
