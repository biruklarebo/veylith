import { useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { useNav } from '../nav';
import { pb, useAccount } from '../lib/pb';

// A person's picture, or their first initial when there is none or it can't load (offline).
export function Avatar({ user }: { user: RecordModel }) {
  const [failedFor, setFailedFor] = useState<string>();
  const label = user.name || user.email || '?';
  if (user.avatar && failedFor !== user.avatar) {
    return <img className="avatar" src={pb.files.getURL(user, user.avatar)} alt={label} onError={() => setFailedFor(user.avatar)} />;
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
