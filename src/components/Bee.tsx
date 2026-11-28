export type BeePose = 'idle' | 'waving' | 'cheering' | 'celebrating' | 'sleepy' | 'focused' | 'streak' | 'sad';

/** Pip, the Hexagon bee. A small SVG mascot with eight poses; colours come from the theme tokens. */
export function Bee({ pose = 'idle', size = 96, className }: { pose?: BeePose; size?: number; className?: string }) {
  const happy = pose === 'cheering' || pose === 'celebrating' || pose === 'streak';
  const eyesOpen = pose === 'idle' || pose === 'waving' || pose === 'sad';
  const armsUp = pose === 'cheering' || pose === 'celebrating';
  const mouthSmile = pose === 'idle' || pose === 'waving' || pose === 'streak';
  const mouthBig = pose === 'cheering' || pose === 'celebrating';
  const ink = 'var(--ink, #1E2B26)';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Pip the bee, ${pose}`} className={className} style={{ flex: 'none' }}>
      {pose === 'celebrating' && (
        <>
          <polygon points="14,14 20,10.5 26,14 26,21 20,24.5 14,21" style={{ fill: 'var(--honey, #E9B44C)' }} />
          <polygon points="98,8 102,5.7 106,8 106,12.6 102,14.9 98,12.6" style={{ fill: 'var(--s3, #4C6FB5)' }} />
          <polygon points="104,96 109,93 114,96 114,102 109,105 104,102" style={{ fill: 'var(--primary, #2F5D50)' }} />
          <polygon points="6,92 10,89.7 14,92 14,96.6 10,98.9 6,96.6" style={{ fill: 'var(--s4, #A0558F)' }} />
          <rect x="88" y="30" width="5" height="9" rx="1.5" transform="rotate(30 90 34)" style={{ fill: 'var(--s2, #C9772E)' }} />
          <rect x="24" y="36" width="5" height="9" rx="1.5" transform="rotate(-30 26 40)" style={{ fill: 'var(--s1, #2F7D6B)' }} />
        </>
      )}
      {pose === 'streak' && (
        <>
          <path d="M60 4 C67 15 74 20 69 31 C66 38 54 38 51 31 C47 22 56 17 60 4 Z" fill="#E0702E" />
          <path d="M60 17 C64 24 65 29 62 33 C59 35 56 33 57 28 C58 25 59 22 60 17 Z" style={{ fill: 'var(--honey, #E9B44C)' }} />
        </>
      )}
      <path d="M50 46 Q44 32 37 27" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: ink }} />
      <path d="M70 46 Q76 32 83 27" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: ink }} />
      <circle cx="36" cy="26" r="4.5" style={{ fill: ink }} />
      <circle cx="84" cy="26" r="4.5" style={{ fill: ink }} />
      <ellipse cx="42" cy="44" rx="15" ry="21" transform="rotate(-28 42 44)" fill="#FFFFFF" fillOpacity="0.85" stroke="#1E2B26" strokeWidth="2.5" />
      <ellipse cx="78" cy="44" rx="15" ry="21" transform="rotate(28 78 44)" fill="#FFFFFF" fillOpacity="0.85" stroke="#1E2B26" strokeWidth="2.5" />
      {armsUp && (
        <>
          <path d="M29 70 Q15 58 18 42" fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: ink }} />
          <path d="M91 70 Q105 58 102 42" fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: ink }} />
        </>
      )}
      {pose === 'waving' && (
        <>
          <path d="M91 70 Q107 62 104 44" fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: ink }} />
          <path d="M110 38 Q114 44 112 50" fill="none" strokeWidth="2" strokeLinecap="round" style={{ stroke: 'var(--muted, #5F6964)' }} />
          <path d="M29 78 Q20 84 22 92" fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: ink }} />
        </>
      )}
      <ellipse cx="60" cy="72" rx="34" ry="30" stroke="#1E2B26" strokeWidth="3" style={{ fill: 'var(--honey, #E9B44C)' }} />
      <path d="M31 83 Q60 93 89 83" fill="none" stroke="#2F5D50" strokeWidth="7" strokeLinecap="round" />
      <path d="M41 96 Q60 102 79 96" fill="none" stroke="#2F5D50" strokeWidth="6" strokeLinecap="round" />
      <circle cx="39" cy="73" r="4.5" fill="#E8836A" fillOpacity="0.45" />
      <circle cx="81" cy="73" r="4.5" fill="#E8836A" fillOpacity="0.45" />
      {eyesOpen && (
        <>
          <circle cx="48" cy="63" r="5" fill="#1E2B26" />
          <circle cx="72" cy="63" r="5" fill="#1E2B26" />
          <circle cx="49.6" cy="61.4" r="1.6" fill="#FFFFFF" />
          <circle cx="73.6" cy="61.4" r="1.6" fill="#FFFFFF" />
        </>
      )}
      {happy && (
        <>
          <path d="M43 65 Q48 58 53 65" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />
          <path d="M67 65 Q72 58 77 65" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {pose === 'sleepy' && (
        <>
          <path d="M43 62 Q48 67 53 62" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />
          <path d="M67 62 Q72 67 77 62" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {pose === 'focused' && (
        <>
          <ellipse cx="48" cy="64" rx="4.5" ry="3.2" fill="#1E2B26" />
          <ellipse cx="72" cy="64" rx="4.5" ry="3.2" fill="#1E2B26" />
          <path d="M42 57 L53 59" stroke="#1E2B26" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M78 57 L67 59" stroke="#1E2B26" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {pose === 'sad' && (
        <>
          <path d="M42 57 L52 54" stroke="#1E2B26" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M78 57 L68 54" stroke="#1E2B26" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {mouthSmile && <path d="M53 75 Q60 82 67 75" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />}
      {mouthBig && <path d="M51 74 Q60 89 69 74 Z" fill="#1E2B26" stroke="#1E2B26" strokeWidth="2" strokeLinejoin="round" />}
      {pose === 'focused' && <path d="M55 77 L65 77" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />}
      {pose === 'sad' && <path d="M54 79 Q60 75 66 79" fill="none" stroke="#1E2B26" strokeWidth="3" strokeLinecap="round" />}
      {pose === 'sleepy' && <ellipse cx="60" cy="77" rx="3.5" ry="4" fill="#1E2B26" />}
      {pose === 'focused' && (
        <>
          <path d="M38 88 L60 92 L82 88 L82 106 L60 110 L38 106 Z" stroke="#1E2B26" strokeWidth="2.5" strokeLinejoin="round" style={{ fill: 'var(--surface, #FFFBF4)' }} />
          <path d="M60 92 L60 110" stroke="#1E2B26" strokeWidth="2" />
        </>
      )}
      {pose === 'sleepy' && (
        <>
          <text x="92" y="38" fontFamily="Figtree Variable, Figtree, sans-serif" fontWeight="800" fontSize="15" style={{ fill: 'var(--primary-ink, #2F5D50)' }}>
            z
          </text>
          <text x="102" y="24" fontFamily="Figtree Variable, Figtree, sans-serif" fontWeight="800" fontSize="11" style={{ fill: 'var(--primary-ink, #2F5D50)' }}>
            z
          </text>
        </>
      )}
    </svg>
  );
}
