export function TrayGlyph() {
  return (
    <svg className="glyph tray" viewBox="0 0 30 20" aria-hidden="true">
      <path d="M2 8 15 2.5 28 8 15 13.5Z" fill="#eef1f3" stroke="#9aa3ab" strokeWidth="0.8" />
      <path d="M2 8v4l13 5.5v-4Z" fill="#b8bfc5" stroke="#9aa3ab" strokeWidth="0.8" />
      <path d="M28 8v4l-13 5.5v-4Z" fill="#d1d6da" stroke="#9aa3ab" strokeWidth="0.8" />
    </svg>
  );
}

export function CubeGlyph({ tone = 'grey', crossed = false }) {
  const fills =
    tone === 'blue'
      ? ['#5fa8e6', '#1f6fb8', '#2f86d1']
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
