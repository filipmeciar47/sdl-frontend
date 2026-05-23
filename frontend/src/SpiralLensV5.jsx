// SpiralLensV5.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';

const LEVELS = [
  { id: 'beige',     name: 'BÉŽOVÁ',    motto: 'Prežitie',            polarity: 'express', hex: '#C4A882', glow: 'rgba(196,168,130,0.55)' },
  { id: 'purple',    name: 'PURPUROVÁ', motto: 'Bezpečie klanu',      polarity: 'deny',    hex: '#A78BFA', glow: 'rgba(167,139,250,0.55)' },
  { id: 'red',       name: 'ČERVENÁ',   motto: 'Moc a vôľa',          polarity: 'express', hex: '#F87171', glow: 'rgba(248,113,113,0.55)' },
  { id: 'blue',      name: 'MODRÁ',     motto: 'Poriadok a zmysel',   polarity: 'deny',    hex: '#60A5FA', glow: 'rgba(96,165,250,0.55)'  },
  { id: 'orange',    name: 'ORANŽOVÁ',  motto: 'Úspech a výkon',      polarity: 'express', hex: '#FB923C', glow: 'rgba(251,146,60,0.55)'  },
  { id: 'green',     name: 'ZELENÁ',    motto: 'Harmónia a rovnosť',  polarity: 'deny',    hex: '#4ADE80', glow: 'rgba(74,222,128,0.55)'  },
  { id: 'yellow',    name: 'ŽLTÁ',      motto: 'Syst. integrácia',    polarity: 'express', hex: '#FACC15', glow: 'rgba(250,204,21,0.6)'   },
  { id: 'turquoise', name: 'TYRKYSOVÁ', motto: 'Celostné vedomie',    polarity: 'deny',    hex: '#2DD4BF', glow: 'rgba(45,212,191,0.6)'   },
];

const ICO1 = 60;  // primary icon size
const ICO2 = 40;  // secondary icon size
const GAP  = 6;   // gap between icons
const HEIGHT = 480;
const CY     = HEIGHT / 2;
const OFFSET = 90;

function anchorY(polarity) {
  return polarity === 'express' ? CY - OFFSET : CY + OFFSET;
}

function polyPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

export default function SpiralLensV5({ icons = {}, axisIcons = {}, activeKeys = [], pendingKeys = [], onLevelClick }) {
  const [hover, setHover] = useState(null);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(860);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const active  = useMemo(() => new Set(activeKeys),  [activeKeys]);
  const pending = useMemo(() => new Set(pendingKeys),  [pendingKeys]);
  const selected = useMemo(() => new Set([...activeKeys, ...pendingKeys]), [activeKeys, pendingKeys]);

  const slot = width / LEVELS.length;

  const items = useMemo(() => LEVELS.map((lv, i) => ({
    lv,
    cx: (i + 0.5) * slot,
    cy: anchorY(lv.polarity),
  })), [slot]);

  // All 8 anchors for background zigzag
  const allAnchors = items.map(it => ({ x: it.cx, y: it.cy }));

  // Selected anchors for glowing zigzag
  const selItems   = items.filter(it => selected.has(it.lv.id));
  const selAnchors = selItems.map(it => ({ x: it.cx, y: it.cy, isPending: !active.has(it.lv.id) }));
  const N = selItems.length;
  const outerToInner = Array.from({ length: N }, (_, i) => N - 1 - i);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: HEIGHT, overflow: 'hidden', fontFamily: "'DM Sans', Georgia, sans-serif" }}
    >
      {/* Zone labels */}
      <div style={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontSize: 9, letterSpacing: '0.38em', color: 'rgba(255,180,100,0.3)', pointerEvents: 'none', zIndex: 5 }}>
        EXPRESS · JA
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 9, letterSpacing: '0.38em', color: 'rgba(96,165,250,0.3)', pointerEvents: 'none', zIndex: 5 }}>
        DENY · MY
      </div>

      <svg width={width} height={HEIGHT} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        <defs>
          <filter id="slv5-halo" x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="28" />
          </filter>
          <filter id="slv5-band" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="slv5-core" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Background zigzag — all 8 levels, always visible, very dim */}
        <path
          d={polyPath(allAnchors)}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 6"
        />

        {/* Glowing zigzag — only selected/pending levels */}
        {N >= 2 && (
          <>
            {/* 1. Ambient halo */}
            <g style={{ mixBlendMode: 'screen' }}>
              {selItems.map((it, k) => (
                <path
                  key={`halo-${it.lv.id}`}
                  d={polyPath(selAnchors.slice(k))}
                  fill="none"
                  stroke={it.lv.hex}
                  strokeWidth={12 + k * 14}
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeOpacity={pending.has(it.lv.id) && !active.has(it.lv.id) ? "0.2" : "0.38"}
                  filter="url(#slv5-halo)"
                />
              ))}
            </g>

            {/* 2. Color bands outer→inner */}
            <g>
              {outerToInner.map(k => {
                const it = selItems[k];
                const isPend = pending.has(it.lv.id) && !active.has(it.lv.id);
                return (
                  <path
                    key={`band-${it.lv.id}`}
                    d={polyPath(selAnchors.slice(k))}
                    fill="none"
                    stroke={it.lv.hex}
                    strokeWidth={12 + k * 14}
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeOpacity={isPend ? "0.42" : "0.85"}
                    strokeDasharray={isPend ? "8 5" : undefined}
                    filter="url(#slv5-band)"
                  />
                );
              })}
            </g>

            {/* 3. White core */}
            <g style={{ mixBlendMode: 'screen' }}>
              <path
                d={polyPath(selAnchors)}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                strokeOpacity="0.6"
                filter="url(#slv5-core)"
              />
            </g>
          </>
        )}

        {/* Sparks at selected anchor points */}
        {selAnchors.map((a, idx) => (
          <circle key={`spark-${idx}`} cx={a.x} cy={a.y} r="2.5"
            fill="#fff" opacity={a.isPending ? "0.4" : "0.85"} />
        ))}

        {/* Dim dots at non-selected anchor points */}
        {allAnchors.map((a, idx) => {
          if (selected.has(LEVELS[idx].id)) return null;
          return <circle key={`dot-${idx}`} cx={a.x} cy={a.y} r="1.5" fill="rgba(255,255,255,0.18)" />;
        })}
      </svg>

      {/* Badges — all levels, both icons */}
      {items.map(({ lv, cx, cy }) => {
        const isHover   = hover === lv.id;
        const isActive  = active.has(lv.id);
        const isPending = pending.has(lv.id);
        const isSel     = isActive || isPending;
        const isLit     = isHover || isSel;

        const src1 = icons[lv.id];     // primary icon
        const src2 = axisIcons[lv.id]; // secondary icon

        // Stack: primary on top, secondary below (for express); reverse for deny
        const isExpress = lv.polarity === 'express';
        const totalH = ICO1 + GAP + ICO2;
        // Anchor cy is midpoint between the two icons
        const topY = cy - totalH / 2;

        return (
          <div
            key={lv.id}
            onMouseEnter={() => setHover(lv.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onLevelClick && onLevelClick(lv.id)}
            style={{
              position: 'absolute',
              left: cx - (ICO1 / 2 + 20),
              top: topY - 16,
              width: ICO1 + 40,
              cursor: 'pointer',
              zIndex: isHover ? 50 : 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: isHover ? 'scale(1.1)' : 'scale(1)',
              transition: 'transform 0.25s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            {/* Primary icon (ICONS) */}
            <div style={{ position: 'relative', width: ICO1, height: ICO1, flexShrink: 0 }}>
              <div style={{
                position: 'absolute',
                inset: -(ICO1 * 0.2),
                background: `radial-gradient(circle, ${lv.hex}99 0%, ${lv.glow} 30%, transparent 65%)`,
                opacity: isLit ? 1 : 0.2,
                transition: 'opacity 0.25s',
                pointerEvents: 'none',
                filter: 'blur(4px)',
              }} />
              {src1 && (
                <img src={src1} alt={lv.name} style={{
                  position: 'relative', width: '100%', height: '100%',
                  borderRadius: '50%', objectFit: 'cover',
                  filter: `drop-shadow(0 0 ${isLit ? 12 : 3}px ${lv.glow})`,
                  opacity: isLit ? 1 : 0.35,
                  transition: 'filter 0.25s, opacity 0.25s',
                }} />
              )}
              {isActive && (
                <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${lv.hex}`, boxShadow: `0 0 12px ${lv.glow}`, pointerEvents: 'none' }} />
              )}
              {isPending && !isActive && (
                <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px dashed ${lv.hex}`, opacity: 0.7, pointerEvents: 'none' }} />
              )}
            </div>

            {/* Gap */}
            <div style={{ height: GAP }} />

            {/* Secondary icon (AXIS_ICONS) */}
            <div style={{ position: 'relative', width: ICO2, height: ICO2, flexShrink: 0 }}>
              {src2 && (
                <img src={src2} alt={lv.name} style={{
                  position: 'relative', width: '100%', height: '100%',
                  borderRadius: '50%', objectFit: 'cover',
                  filter: `drop-shadow(0 0 ${isLit ? 8 : 2}px ${lv.glow})`,
                  opacity: isLit ? 0.85 : 0.22,
                  transition: 'filter 0.25s, opacity 0.25s',
                }} />
              )}
            </div>

            {/* Labels */}
            <div style={{ marginTop: 6, textAlign: 'center' }}>
              <div style={{
                fontSize: 8, letterSpacing: '0.18em', fontWeight: 600, textTransform: 'uppercase',
                color: isLit ? lv.hex : 'rgba(200,190,178,0.35)',
                textShadow: isLit ? `0 0 8px ${lv.glow}` : 'none',
                transition: 'color 0.25s',
              }}>
                {lv.name}
              </div>
              <div style={{
                marginTop: 2, fontSize: 8,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                color: isLit ? 'rgba(220,210,200,0.8)' : 'rgba(200,190,178,0.2)',
                transition: 'color 0.25s',
              }}>
                {lv.motto}
              </div>
            </div>
          </div>
        );
      })}

      {/* Bottom hint */}
      <div style={{
        position: 'absolute', bottom: 24, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none', zIndex: 6,
        fontSize: 10, letterSpacing: '0.28em',
        color: N === 0 ? 'rgba(200,190,178,0.25)' : 'transparent',
        transition: 'color 0.3s',
      }}>
        KLIKNUTÍM AKTIVUJEŠ ÚROVEŇ
      </div>
    </div>
  );
}
