// SpiralLensV5.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

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

const HEIGHT   = 360;
const ROW_TOP  = 88;
const ROW_BOT  = 238;
const MID_Y    = (ROW_TOP + ROW_BOT) / 2;
const ICO_MAIN = 64;
const ICO_AXIS = 44;
const MIN_SLOT = 96;   // minimum px per icon column before scroll kicks in

function polyPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

export default function SpiralLensV5({ icons = {}, axisIcons = {}, activeKeys = [], pendingKeys = [], onLevelClick, integrated = false }) {
  const [hover, setHover]               = useState(null);
  const outerRef                        = useRef(null);  // viewport width
  const scrollRef                       = useRef(null);  // scrollable track
  const [viewportW, setViewportW]       = useState(860);
  const [canScrollLeft,  setCanLeft]    = useState(false);
  const [canScrollRight, setCanRight]   = useState(false);

  // Observe outer (viewport) width
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setViewportW(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Content width: at least MIN_SLOT × 8; otherwise fill container
  const contentW = Math.max(viewportW, LEVELS.length * MIN_SLOT);
  const slot     = contentW / LEVELS.length;
  const needsScroll = contentW > viewportW;

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [viewportW, contentW, updateScrollState]);

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * slot * 2.5, behavior: 'smooth' });
  };

  const active   = useMemo(() => new Set(activeKeys),  [activeKeys]);
  const pending  = useMemo(() => new Set(pendingKeys), [pendingKeys]);
  const selected = useMemo(() => new Set([...activeKeys, ...pendingKeys]), [activeKeys, pendingKeys]);

  const connected = useMemo(() => {
    if (!integrated || selected.size === 0) return selected;
    let maxIdx = -1;
    LEVELS.forEach((lv, i) => { if (selected.has(lv.id)) maxIdx = i; });
    if (maxIdx === -1) return selected;
    return new Set(LEVELS.slice(0, maxIdx + 1).map(lv => lv.id));
  }, [selected, integrated]);

  const items = useMemo(() => LEVELS.map((lv, i) => {
    const cx     = (i + 0.5) * slot;
    const iconsY = lv.polarity === 'express' ? ROW_TOP : ROW_BOT;
    const axisY  = lv.polarity === 'express' ? ROW_BOT : ROW_TOP;
    return { lv, cx, iconsY, axisY };
  }), [slot]);

  const connItems   = items.filter(it => connected.has(it.lv.id));
  const connAnchors = connItems.map(it => ({ x: it.cx, y: it.iconsY }));
  const N           = connItems.length;
  const outerToInner = Array.from({ length: N }, (_, i) => N - 1 - i);

  // Arrow button
  const ArrowBtn = ({ dir }) => (
    <button
      onClick={() => scrollBy(dir === 'left' ? -1 : 1)}
      style={{
        position: 'absolute',
        top: '50%', transform: 'translateY(-50%)',
        [dir]: 2,
        zIndex: 30,
        width: 28, height: 28,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.13)',
        color: 'rgba(255,255,255,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        transition: 'background 0.18s, color 0.18s',
        padding: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left'
          ? <polyline points="15 18 9 12 15 6" />
          : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );

  return (
    <div ref={outerRef} style={{ position: 'relative', width: '100%', fontFamily: "'DM Sans', Georgia, sans-serif" }}>

      {/* Zone labels — fixed over the viewport, not scrolling */}
      <div style={{ position: 'absolute', top: MID_Y - 16, left: 0, right: 0, textAlign: 'center', fontSize: 8, letterSpacing: '0.32em', color: 'rgba(255,180,100,0.28)', pointerEvents: 'none', zIndex: 25 }}>
        EXPRESS SELF · JA
      </div>
      <div style={{ position: 'absolute', top: MID_Y + 5, left: 0, right: 0, textAlign: 'center', fontSize: 8, letterSpacing: '0.32em', color: 'rgba(96,165,250,0.28)', pointerEvents: 'none', zIndex: 25 }}>
        DENY SELF · MY
      </div>

      {/* Scroll arrows — only on mobile/narrow */}
      {needsScroll && canScrollLeft  && <ArrowBtn dir="left"  />}
      {needsScroll && canScrollRight && <ArrowBtn dir="right" />}

      {/* Edge fade overlays */}
      {needsScroll && canScrollLeft && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: 48, height: HEIGHT, background: 'linear-gradient(to right, rgba(0,0,0,0.35), transparent)', pointerEvents: 'none', zIndex: 20 }} />
      )}
      {needsScroll && canScrollRight && (
        <div style={{ position: 'absolute', right: 0, top: 0, width: 48, height: HEIGHT, background: 'linear-gradient(to left, rgba(0,0,0,0.35), transparent)', pointerEvents: 'none', zIndex: 20 }} />
      )}

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        style={{
          overflowX: needsScroll ? 'auto' : 'visible',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ position: 'relative', width: contentW, height: HEIGHT, overflow: 'visible' }}>

          <svg width={contentW} height={HEIGHT} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
            <defs>
              <filter id="slv5-halo" x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="26" />
              </filter>
              <filter id="slv5-band" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <filter id="slv5-core" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="1.5" />
              </filter>
              <linearGradient id="slv5-sep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="white" stopOpacity="0" />
                <stop offset="20%"  stopColor="white" stopOpacity="0.12" />
                <stop offset="50%"  stopColor="white" stopOpacity="0.18" />
                <stop offset="80%"  stopColor="white" stopOpacity="0.12" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Separator line */}
            <line x1="0" y1={MID_Y} x2={contentW} y2={MID_Y}
              stroke="url(#slv5-sep)" strokeWidth="1" />

            {/* Glowing zigzag */}
            {N >= 2 && (
              <>
                <g style={{ mixBlendMode: 'screen' }}>
                  {connItems.map((it, k) => (
                    <path key={`halo-${it.lv.id}`} d={polyPath(connAnchors.slice(k))}
                      fill="none" stroke={it.lv.hex}
                      strokeWidth={11 + k * 13} strokeLinecap="round" strokeLinejoin="round"
                      strokeOpacity="0.38" filter="url(#slv5-halo)" />
                  ))}
                </g>
                <g>
                  {outerToInner.map(k => {
                    const it = connItems[k];
                    return (
                      <path key={`band-${it.lv.id}`} d={polyPath(connAnchors.slice(k))}
                        fill="none" stroke={it.lv.hex}
                        strokeWidth={11 + k * 13} strokeLinecap="round" strokeLinejoin="round"
                        strokeOpacity="0.85" filter="url(#slv5-band)" />
                    );
                  })}
                </g>
                <g style={{ mixBlendMode: 'screen' }}>
                  <path d={polyPath(connAnchors)} fill="none" stroke="#ffffff"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    strokeOpacity="0.6" filter="url(#slv5-core)" />
                </g>
              </>
            )}

            {connAnchors.map((a, idx) => (
              <circle key={`spark-${idx}`} cx={a.x} cy={a.y} r="2.5" fill="#fff" opacity="0.85" />
            ))}
          </svg>

          {/* Icon badges */}
          {items.map(({ lv, cx, iconsY, axisY }) => {
            const isHover  = hover === lv.id;
            const isActive = active.has(lv.id);
            const isSel    = selected.has(lv.id);
            const src1     = icons[lv.id];
            const src2     = axisIcons[lv.id];

            const glowOpacity  = isHover ? 0.72 : isSel ? 0.88 : 0.28;
            const imgOpacity   = isHover ? 1    : isSel ? 1    : 0.82;
            const glowBlur     = isHover ? 8    : isSel ? 12   : 4;
            const axisOpacity  = isHover ? 0.95 : isSel ? 0.85 : 0.55;
            const axisGlowBlur = isHover ? 8    : isSel ? 8    : 2;

            return (
              <React.Fragment key={lv.id}>
                {/* Main icon */}
                <div
                  onMouseEnter={() => setHover(lv.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onLevelClick && onLevelClick(lv.id)}
                  style={{
                    position: 'absolute',
                    left: cx - ICO_MAIN / 2 - 14,
                    top: iconsY - ICO_MAIN / 2 - 4,
                    width: ICO_MAIN + 28,
                    cursor: 'pointer',
                    zIndex: isHover ? 50 : 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    transform: isHover ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.22s cubic-bezier(.2,.7,.2,1)',
                  }}
                >
                  <div style={{ position: 'relative', width: ICO_MAIN, height: ICO_MAIN }}>
                    <div style={{
                      position: 'absolute', inset: -(ICO_MAIN * 0.22),
                      background: `radial-gradient(circle, ${lv.hex}99 0%, ${lv.glow} 30%, transparent 65%)`,
                      opacity: glowOpacity,
                      transition: 'opacity 0.22s', pointerEvents: 'none', filter: 'blur(5px)',
                    }} />
                    {src1 && (
                      <img src={src1} alt={lv.name} style={{
                        position: 'relative', width: '100%', height: '100%',
                        borderRadius: '50%', objectFit: 'cover',
                        filter: `drop-shadow(0 0 ${glowBlur}px ${lv.glow})`,
                        opacity: imgOpacity,
                        transition: 'filter 0.22s, opacity 0.22s',
                      }} />
                    )}
                    {isActive && (
                      <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${lv.hex}`, boxShadow: `0 0 12px ${lv.glow}`, pointerEvents: 'none' }} />
                    )}
                    {!isActive && isSel && (
                      <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `1.5px solid ${lv.hex}bb`, pointerEvents: 'none' }} />
                    )}
                  </div>
                  <div style={{ marginTop: 5, textAlign: 'center' }}>
                    <div style={{
                      fontSize: 8, letterSpacing: '0.18em', fontWeight: 600, textTransform: 'uppercase',
                      color: (isHover || isSel) ? lv.hex : 'rgba(200,190,178,0.55)',
                      textShadow: (isHover || isSel) ? `0 0 8px ${lv.glow}` : 'none',
                      transition: 'color 0.22s', whiteSpace: 'nowrap',
                    }}>{lv.name}</div>
                    <div style={{
                      marginTop: 1, fontSize: 7.5,
                      fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic',
                      color: (isHover || isSel) ? 'rgba(220,210,200,0.85)' : 'rgba(200,190,178,0.4)',
                      transition: 'color 0.22s', whiteSpace: 'nowrap',
                    }}>{lv.motto}</div>
                  </div>
                </div>

                {/* Axis icon */}
                {src2 && (
                  <div
                    onMouseEnter={() => setHover(lv.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onLevelClick && onLevelClick(lv.id)}
                    style={{
                      position: 'absolute',
                      left: cx - ICO_AXIS / 2,
                      top: axisY - ICO_AXIS / 2,
                      width: ICO_AXIS, height: ICO_AXIS,
                      cursor: 'pointer', zIndex: isHover ? 50 : 10,
                      transform: isHover ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 0.22s cubic-bezier(.2,.7,.2,1)',
                    }}
                  >
                    <img src={src2} alt={lv.name} style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%', objectFit: 'cover',
                      filter: `drop-shadow(0 0 ${axisGlowBlur}px ${lv.glow})`,
                      opacity: axisOpacity,
                      transition: 'filter 0.22s, opacity 0.22s',
                    }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Bottom hint */}
      <div style={{
        textAlign: 'center', pointerEvents: 'none',
        fontSize: 9, letterSpacing: '0.28em',
        marginTop: 8,
        color: N === 0 ? 'rgba(200,190,178,0.22)' : 'transparent',
        transition: 'color 0.3s',
      }}>
        KLIKNUTÍM AKTIVUJEŠ ÚROVEŇ
      </div>
    </div>
  );
}
