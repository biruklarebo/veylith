import { useState } from 'react';
import { useNav } from '../nav';
import { avatarUrl, useAccount, type Account } from '../lib/api';

// A person's picture, or their first initial when there is none or it can't load (offline).
export function Avatar({ user }: { user: Account }) {
  const [failedFor, setFailedFor] = useState<string>();
  const label = user.name || user.email || '?';
  if (user.avatar && failedFor !== user.avatar) {
    return <img className="avatar" src={avatarUrl(user)} alt={label} onError={() => setFailedFor(user.avatar ?? undefined)} />;
  }
  return (
    <span className="avatar" role="img" aria-label={label}>
      {label[0].toUpperCase()}
    </span>
  );
}

// The signed-in person in a screen header, leading to Settings.
export function ProfileButton() {
  const nav = useNav();
  const user = useAccount();
  if (!user) return null;
  return (
    <button className="profile-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Settings">
      <Avatar user={user} />
    </button>
  );
}
