// SpiralLensV5.jsx — icon view pre SDL App
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

const ICON_SIZE = 76;
const HEIGHT    = 460;
const CY        = HEIGHT / 2;
const OFFSET    = 88;

function anchorY(polarity) {
  return polarity === 'express' ? CY - OFFSET : CY + OFFSET;
}

function polyPath(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

export default function SpiralLensV5({ icons = {}, activeKeys = [], pendingKeys = [], onLevelClick }) {
  const [hover, setHover]   = useState(null);
  const containerRef        = useRef(null);
  const [width, setWidth]   = useState(860);

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
  // Combined: all items that have any visual state (active or pending)
  const lit     = useMemo(() => new Set([...activeKeys, ...pendingKeys]), [activeKeys, pendingKeys]);

  const slot = width / LEVELS.length;

  const items = useMemo(() => LEVELS.map((lv, i) => ({
    lv,
    cx: (i + 0.5) * slot,
    cy: anchorY(lv.polarity),
  })), [slot]);

  // Zigzag uses ALL selected items (active + pending)
  const litItems     = items.filter(it => lit.has(it.lv.id));
  const N            = litItems.length;
  const anchors      = litItems.map(it => ({ x: it.cx, y: it.cy, isPending: !active.has(it.lv.id) }));
  const outerToInner = Array.from({ length: N }, (_, i) => N - 1 - i);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: HEIGHT,
        overflow: 'hidden',
        fontFamily: "'DM Sans', Georgia, sans-serif",
      }}
    >
      {/* Zone labels */}
      <div style={{
        position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center',
        fontSize: 9, letterSpacing: '0.38em',
        color: 'rgba(255,180,100,0.38)', pointerEvents: 'none', zIndex: 5,
      }}>
        EXPRESS · JA
      </div>
      <div style={{
        position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center',
        fontSize: 9, letterSpacing: '0.38em',
        color: 'rgba(96,165,250,0.38)', pointerEvents: 'none', zIndex: 5,
      }}>
        DENY · MY
      </div>

      {/* Zigzag SVG — draws for all lit items */}
      <svg
        width={width} height={HEIGHT}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}
      >
        <defs>
          <filter id="slv5-halo" x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="30" />
          </filter>
          <filter id="slv5-band" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="slv5-core" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* 1. Ambient halo */}
        <g style={{ mixBlendMode: 'screen' }}>
          {litItems.map((it, k) => (
            <path
              key={`halo-${it.lv.id}`}
              d={polyPath(anchors.slice(k))}
              fill="none"
              stroke={it.lv.hex}
              strokeWidth={13 + k * 15}
              strokeLinecap="round" strokeLinejoin="round"
              strokeOpacity={pending.has(it.lv.id) && !active.has(it.lv.id) ? "0.22" : "0.42"}
              filter="url(#slv5-halo)"
            />
          ))}
        </g>

        {/* 2. Color bands (outer → inner) */}
        <g>
          {outerToInner.map(k => {
            const it = litItems[k];
            const isPend = pending.has(it.lv.id) && !active.has(it.lv.id);
            return (
              <path
                key={`band-${it.lv.id}`}
                d={polyPath(anchors.slice(k))}
                fill="none"
                stroke={it.lv.hex}
                strokeWidth={13 + k * 15}
                strokeLinecap="round" strokeLinejoin="round"
                strokeOpacity={isPend ? "0.45" : "0.88"}
                strokeDasharray={isPend ? "8 5" : undefined}
                filter="url(#slv5-band)"
              />
            );
          })}
        </g>

        {/* 3. White core */}
        {N >= 2 && (
          <g style={{ mixBlendMode: 'screen' }}>
            <path
              d={polyPath(anchors)}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              strokeOpacity="0.65"
              filter="url(#slv5-core)"
            />
          </g>
        )}

        {/* Sparks at anchor points */}
        {anchors.map((a, idx) => (
          <circle key={`spark-${idx}`} cx={a.x} cy={a.y} r="2.5"
            fill="#fff" opacity={a.isPending ? "0.45" : "0.85"} />
        ))}
      </svg>

      {/* Badges */}
      {items.map(({ lv, cx, cy }) => {
        const isHover   = hover === lv.id;
        const isActive  = active.has(lv.id);
        const isPending = pending.has(lv.id);
        const isLit     = isHover || isActive || isPending;
        const src       = icons[lv.id];
        const badgeTop  = cy - ICON_SIZE / 2;

        return (
          <div
            key={lv.id}
            onMouseEnter={() => setHover(lv.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onLevelClick && onLevelClick(lv.id)}
            style={{
              position: 'absolute',
              left: cx - (ICON_SIZE / 2 + 22),
              top: badgeTop - 12,
              width: ICON_SIZE + 44,
              cursor: 'pointer',
              zIndex: isHover ? 50 : 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: isHover ? 'scale(1.11)' : 'scale(1)',
              transition: 'transform 0.28s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            <div style={{ position: 'relative', width: ICON_SIZE, height: ICON_SIZE }}>
              <div style={{
                position: 'absolute',
                inset: -(ICON_SIZE * 0.18),
                background: `radial-gradient(circle, ${lv.hex}b0 0%, ${lv.glow} 28%, transparent 62%)`,
                opacity: isLit ? 1 : 0.45,
                transition: 'opacity 0.25s',
                pointerEvents: 'none',
                filter: 'blur(4px)',
              }} />
              {src && (
                <img
                  src={src}
                  alt={lv.name}
                  style={{
                    position: 'relative',
                    width: '100%', height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    filter: `drop-shadow(0 0 ${isLit ? 13 : 4}px ${lv.glow})`,
                    transition: 'filter 0.25s',
                  }}
                />
              )}
              {/* Active ring */}
              {isActive && (
                <div style={{
                  position: 'absolute', inset: -3,
                  borderRadius: '50%',
                  border: `2px solid ${lv.hex}`,
                  boxShadow: `0 0 14px ${lv.glow}`,
                  pointerEvents: 'none',
                }} />
              )}
              {/* Pending ring — dashed */}
              {isPending && !isActive && (
                <div style={{
                  position: 'absolute', inset: -3,
                  borderRadius: '50%',
                  border: `2px dashed ${lv.hex}`,
                  opacity: 0.75,
                  pointerEvents: 'none',
                }} />
              )}
            </div>

            {/* Labels */}
            <div style={{ marginTop: 7, textAlign: 'center' }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.2em', fontWeight: 600,
                textTransform: 'uppercase',
                color: isLit ? lv.hex : 'rgba(200,190,178,0.55)',
                textShadow: isLit ? `0 0 8px ${lv.glow}` : 'none',
                transition: 'color 0.25s',
              }}>
                {lv.name}
              </div>
              <div style={{
                marginTop: 2, fontSize: 9,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                color: isLit ? 'rgba(220,210,200,0.88)' : 'rgba(200,190,178,0.3)',
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
        position: 'absolute', bottom: 28, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none', zIndex: 6,
        fontSize: 10, letterSpacing: '0.28em',
        color: N === 0 ? 'rgba(200,190,178,0.3)' : 'transparent',
        transition: 'color 0.3s',
      }}>
        KLIKNUTÍM AKTIVUJEŠ ÚROVEŇ
      </div>
    </div>
  );
}
