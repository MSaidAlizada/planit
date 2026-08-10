// Deterministic star positions — stable across renders, no Math.random
const STARS = Array.from({ length: 230 }, (_, i) => {
  const a = ((i * 2654435761 + 9876543) >>> 0);
  const b = ((i * 1664525   + 1013904223) >>> 0);
  const c = ((i * 214013    + 2531011) >>> 0);
  return {
    x: (a % 9973) / 99.73,
    y: (b % 9973) / 99.73,
    r: i % 13 === 0 ? 2.2 : i % 7 === 0 ? 1.6 : i % 4 === 0 ? 1.1 : 0.72,
    o: 0.12 + ((c >> 8) % 88) / 120,
    d: ((b >> 12) % 500) / 100,
  };
});

export default function SpaceBackground() {
  return (
    <div className="space-bg" aria-hidden>
      {STARS.map((s, i) => (
        <span
          key={i}
          className="space-star"
          style={{
            '--s-o': s.o,
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.r}px`,
            height: `${s.r}px`,
            animationDelay: `${s.d}s`,
            animationDuration: `${2.5 + s.d * 0.4}s`,
          } as React.CSSProperties}
        />
      ))}

      {/* Constellation patterns */}
      <svg
        className="space-constellations"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Orion — bottom right */}
        <g opacity="0.18">
          {/* Belt */}
          <line x1="1638" y1="782" x2="1688" y2="762" stroke="#fff" strokeWidth="0.9"/>
          <line x1="1688" y1="762" x2="1742" y2="748" stroke="#fff" strokeWidth="0.9"/>
          {/* Shoulders */}
          <line x1="1622" y1="722" x2="1638" y2="782" stroke="#fff" strokeWidth="0.6"/>
          <line x1="1758" y1="712" x2="1742" y2="748" stroke="#fff" strokeWidth="0.6"/>
          {/* Sword */}
          <line x1="1688" y1="762" x2="1682" y2="826" stroke="#fff" strokeWidth="0.5"/>
          {/* Stars */}
          <circle cx="1638" cy="782" r="2.8" fill="#fff" opacity="0.7"/>
          <circle cx="1688" cy="762" r="2.2" fill="#fff" opacity="0.55"/>
          <circle cx="1742" cy="748" r="2.8" fill="#fff" opacity="0.7"/>
          <circle cx="1622" cy="722" r="3.5" fill="#aad4ff" opacity="0.75"/>
          <circle cx="1758" cy="712" r="3"   fill="#ffddaa" opacity="0.7"/>
          <circle cx="1682" cy="826" r="2"   fill="#fff"    opacity="0.45"/>
        </g>

        {/* Cassiopeia — top left */}
        <g opacity="0.14">
          <line x1="82"  y1="138" x2="122" y2="92"  stroke="#fff" strokeWidth="0.9"/>
          <line x1="122" y1="92"  x2="164" y2="118" stroke="#fff" strokeWidth="0.9"/>
          <line x1="164" y1="118" x2="206" y2="82"  stroke="#fff" strokeWidth="0.9"/>
          <line x1="206" y1="82"  x2="248" y2="108" stroke="#fff" strokeWidth="0.9"/>
          <circle cx="82"  cy="138" r="2.5" fill="#fff"    opacity="0.65"/>
          <circle cx="122" cy="92"  r="2"   fill="#fff"    opacity="0.5"/>
          <circle cx="164" cy="118" r="3.2" fill="#cce8ff" opacity="0.72"/>
          <circle cx="206" cy="82"  r="2"   fill="#fff"    opacity="0.5"/>
          <circle cx="248" cy="108" r="2.5" fill="#fff"    opacity="0.65"/>
        </g>

        {/* Small triangle — mid right */}
        <g opacity="0.11">
          <line x1="1748" y1="428" x2="1798" y2="388" stroke="#fff" strokeWidth="0.7"/>
          <line x1="1798" y1="388" x2="1842" y2="438" stroke="#fff" strokeWidth="0.7"/>
          <line x1="1842" y1="438" x2="1748" y2="428" stroke="#fff" strokeWidth="0.7"/>
          <circle cx="1748" cy="428" r="2"   fill="#fff" opacity="0.55"/>
          <circle cx="1798" cy="388" r="2.5" fill="#fff" opacity="0.65"/>
          <circle cx="1842" cy="438" r="2"   fill="#fff" opacity="0.55"/>
        </g>

        {/* Loose stars — bottom left */}
        <g opacity="0.1">
          <line x1="118" y1="872" x2="168" y2="842" stroke="#fff" strokeWidth="0.7"/>
          <line x1="168" y1="842" x2="214" y2="878" stroke="#fff" strokeWidth="0.6"/>
          <circle cx="118" cy="872" r="2"   fill="#fff" opacity="0.5"/>
          <circle cx="168" cy="842" r="1.5" fill="#fff" opacity="0.4"/>
          <circle cx="214" cy="878" r="2"   fill="#fff" opacity="0.5"/>
        </g>

        {/* Top right scatter */}
        <g opacity="0.1">
          <line x1="1720" y1="58" x2="1775" y2="92" stroke="#fff" strokeWidth="0.6"/>
          <line x1="1775" y1="92" x2="1820" y2="62" stroke="#fff" strokeWidth="0.6"/>
          <circle cx="1720" cy="58"  r="1.8" fill="#fff" opacity="0.5"/>
          <circle cx="1775" cy="92"  r="1.4" fill="#fff" opacity="0.38"/>
          <circle cx="1820" cy="62"  r="1.8" fill="#fff" opacity="0.5"/>
        </g>
      </svg>
    </div>
  );
}
