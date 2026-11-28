import { Icon } from './Icon';

/** "3 likes from friends" on a car you built. Only shown when there is at least one. */
export function LikesBadge({ n }: { n: number }) {
  return (
    <span className="likes-badge">
      <Icon name="heart" size={14} filled />
      <span>
        {n} {n === 1 ? 'friend likes' : 'friends like'} this
      </span>
    </span>
  );
}
