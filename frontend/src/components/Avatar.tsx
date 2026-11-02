import { useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { pb } from '../lib/pb';

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
