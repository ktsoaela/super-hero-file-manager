import { memo } from 'react';

export function TrayGlyph() {
  return (
    <svg className="glyph tray" viewBox="0 0 30 20" aria-hidden="true">
      <path d="M2 8 15 2.5 28 8 15 13.5Z" fill="#eef1f3" stroke="#9aa3ab" strokeWidth="0.8" />
      <path d="M2 8v4l13 5.5v-4Z" fill="#b8bfc5" stroke="#9aa3ab" strokeWidth="0.8" />
      <path d="M28 8v4l-13 5.5v-4Z" fill="#d1d6da" stroke="#9aa3ab" strokeWidth="0.8" />
    </svg>
  );
}

function LockBadge() {
  return (
    <g className="lock-badge">
      <path d="M21.5 13.2v-1.6a2.5 2.5 0 0 1 5 0v1.6" fill="none" stroke="#c3212d" strokeWidth="1.4" />
      <rect x="20" y="13" width="8" height="6.5" rx="1" fill="#c3212d" />
      <rect x="23.4" y="15" width="1.2" height="2.4" fill="#fff" />
    </g>
  );
}

/**
 * Folder as a flat camera memory card. Silver body, one corner cut,
 * a key notch on the left edge, and a blue contact row along the bottom.
 * The colour chip sits on the label. The body still follows the theme tokens.
 */
export const FolderGlyph = memo(function FolderGlyph({ tab, locked = false }) {
  return (
    <svg className="glyph folder3d" viewBox="0 0 30 22" aria-hidden="true">
      <path
        d="M3.2 4.2H17.2L21.8 8.6V18H3.2v-5.4h1.7V9H3.2V4.2Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-line)"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d="M4.5 5.4h9.2v4.4H4.5Z" fill="var(--glyph-back)" />
      <path d="M4.5 5.4h9.2v1.15H4.5Z" fill="#3a94dc" />
      <g fill="#1f6fb8">
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x={4.4 + i * 2.15} y="14.2" width="1.3" height="2.5" />
        ))}
      </g>
      {tab && <rect x="15.1" y="5.5" width="2.1" height="4.2" fill={tab} />}
      {locked && <LockBadge />}
    </svg>
  );
});

/** A 3D sheet with a folded corner and a coloured type stripe. */
export const FileGlyph = memo(function FileGlyph({ tab, locked = false }) {
  return (
    <svg className="glyph file3d" viewBox="0 0 30 22" aria-hidden="true">
      <path d="M9 2.5h9l4 4v13H9Z" fill="var(--glyph-side)" transform="translate(2 1)" />
      <path d="M9 2.5h9l4 4v13H9Z" fill="var(--glyph-paper)" stroke="var(--glyph-line)" strokeWidth="0.7" />
      <path d="M18 2.5v4h4" fill="var(--glyph-fold)" stroke="var(--glyph-line)" strokeWidth="0.7" />
      <path d="M11 10h8M11 12.5h8M11 15h5" stroke="var(--glyph-line)" strokeWidth="0.7" />
      {tab && <rect x="9" y="17" width="13" height="2.5" fill={tab} />}
      {locked && <LockBadge />}
    </svg>
  );
});

export function CubeGlyph({ tone = 'grey', crossed = false }) {
  const fills =
    tone === 'blue'
      ? ['#5fa8e6', '#1f6fb8', '#2f86d1']
      : tone === 'ghost'
        ? ['rgba(242,244,246,.35)', 'rgba(185,192,198,.3)', 'rgba(214,219,223,.3)']
        : ['#f2f4f6', '#b9c0c6', '#d6dbdf'];
  return (
    <svg className="glyph cube" viewBox="0 0 30 24" aria-hidden="true">
      <path d="M3 7 15 2l12 5-12 5Z" fill={fills[0]} stroke="rgba(40,50,60,.35)" strokeWidth="0.7" />
      <path d="M3 7v9l12 6v-10Z" fill={fills[1]} stroke="rgba(40,50,60,.35)" strokeWidth="0.7" />
      <path d="M27 7v9l-12 6v-10Z" fill={fills[2]} stroke="rgba(40,50,60,.35)" strokeWidth="0.7" />
      {crossed && <path d="M1 2 29 22" stroke="#d0202c" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}
