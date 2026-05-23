/**
 * SpiralMandala — interaktívna rotujúca mandala
 * Nahradza statický obrázok mandaly v Spiral Dynamics Lens appke.
 * Zobrazuje 8 nezávislých prstencov, každý sa dá otočiť.
 *
 * Závislosti: React 18+
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/* Úrovne (zvnútra von) — kľúč + farba                                  */
/* ------------------------------------------------------------------ */
const BASE_LEVELS = [
  { key: 'beige',     color: '#c9b896' },
  { key: 'purple',    color: '#6b4d8a' },
  { key: 'red',       color: '#c8443d' },
  { key: 'blue',      color: '#3e5a96' },
  { key: 'orange',    color: '#d97a2c' },
  { key: 'green',     color: '#4a8a3f' },
  { key: 'yellow',    color: '#d9b441' },
  { key: 'turquoise', color: '#3aa6a0' },
];

/* ------------------------------------------------------------------ */
/* Geometria — hranice prstencov v jednotkách view-box (0..400)         */
/* ------------------------------------------------------------------ */
const VIEW = 800;
const CENTER = VIEW / 2;
const HALF = VIEW / 2;
const RADII = [0, 46, 99, 136, 168, 211, 263, 327, 395];
const IMAGE_EXTENT = 395;
const ROTATION_MS = 2400;

const ringGeom = (i) => {
  const inner = RADII[i];
  const outer = RADII[i + 1];
  const mid = (inner + outer) / 2;
  return { inner, outer, mid };
};

/* ------------------------------------------------------------------ */
/* Jeden prstenec                                                        */
/* ------------------------------------------------------------------ */
const RingLayer = ({ level, idx, rotation, isActive, isDimmed, isHovered, tintColor, mandalaSrc }) => {
  const { inner, outer } = ringGeom(idx);

  const innerPct = (inner / HALF) * 100;
  const outerPct = (outer / HALF) * 100;
  const mask = inner <= 0
    ? `radial-gradient(circle closest-side, black 0%, black ${outerPct}%, transparent ${outerPct}%)`
    : `radial-gradient(circle closest-side, transparent ${innerPct}%, black ${innerPct}%, black ${outerPct}%, transparent ${outerPct}%)`;

  let filterFx = 'none';
  if (isActive) {
    filterFx = `drop-shadow(0 0 18px ${level.color}ee) drop-shadow(0 0 38px ${level.color}88)`;
  } else if (isDimmed) {
    filterFx = 'blur(1.6px) brightness(0.82)';
  } else if (isHovered) {
    filterFx = `drop-shadow(0 0 10px ${level.color}bb)`;
  }
  const brightness = isActive ? 1.22 : isHovered ? 1.12 : 1;
  const scale = isActive ? 1.055 : 1;
  const opacity = isDimmed ? 0.78 : 1;
  const imgWidthPct = (IMAGE_EXTENT * 2 / VIEW) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1 + idx,
        pointerEvents: 'none',
        opacity,
        filter: filterFx,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        transition: 'opacity 900ms ease, filter 900ms ease',
      }}
    >
      <img
        src={mandalaSrc}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${imgWidthPct}%`,
          height: `${imgWidthPct}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
          transformOrigin: 'center center',
          transition: `transform ${ROTATION_MS}ms cubic-bezier(0.45, 0.05, 0.25, 1), filter 900ms ease`,
          filter: `brightness(${brightness})`,
          userSelect: 'none',
          willChange: 'transform',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: tintColor || 'transparent',
          opacity: tintColor ? 0.32 : 0,
          mixBlendMode: 'color',
          pointerEvents: 'none',
          transition: 'opacity 900ms ease, background-color 900ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: tintColor || 'transparent',
          opacity: tintColor ? 0.14 : 0,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          transition: 'opacity 900ms ease, background-color 900ms ease',
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Halo + stred                                                          */
/* ------------------------------------------------------------------ */
const Halo = () => (
  <svg
    viewBox={`0 0 ${VIEW} ${VIEW}`}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
  >
    <defs>
      <radialGradient id="spiralMandalaHaloGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(217, 180, 65, 0.06)" />
        <stop offset="60%" stopColor="rgba(217, 180, 65, 0.02)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>
    <circle cx={CENTER} cy={CENTER} r={RADII[8] + 30} fill="url(#spiralMandalaHaloGrad)" />
  </svg>
);

const CenterDot = () => (
  <svg
    viewBox={`0 0 ${VIEW} ${VIEW}`}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}
  >
    <circle cx={CENTER} cy={CENTER} r={3.5} fill="#3a2208" opacity={0.9} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Hit-overlay — detekcia kliku/hoveru na prstenec                      */
/* ------------------------------------------------------------------ */
const HitOverlay = ({ onClick, onHover }) => {
  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radiusPx = Math.sqrt(dx * dx + dy * dy);
    const radiusVbu = radiusPx * (VIEW / rect.width);
    if (radiusVbu > RADII[8] + 25) return null;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < BASE_LEVELS.length; i++) {
      const { mid } = ringGeom(i);
      const d = Math.abs(radiusVbu - mid);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  };

  return (
    <div
      onMouseMove={(e) => onHover(pick(e))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        const idx = pick(e);
        if (idx !== null) onClick(idx);
      }}
      style={{ position: 'absolute', inset: 0, zIndex: 60, cursor: 'pointer' }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Hlavný komponent                                                      */
/* ------------------------------------------------------------------ */
export default function SpiralMandala({
  mandalaSrc = '/assets/mandala.png',
  size = 'min(86vw, 520px)',

  // mode: 'single' | 'integrative' (controlled zvonku)
  mode = 'integrative',

  // Callbacky
  onSelect,           // (level | null) => void — naposledy kliknutá úroveň
  onSelectionChange,  // (levels[]) => void — pole všetkých svietiacich úrovní
  onRotate,           // (level, idx) => void — začiatok rotácie
  onRotateComplete,   // (level, idx) => void — koniec rotácie (~2.4s)
  onDeselect,         // () => void — keď je výber prázdny

  className,
  style,
}) {
  const [selectedList, setSelectedList] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [rotations, setRotations] = useState(BASE_LEVELS.map(() => 0));
  const rotateTimerRef = useRef(null);

  const lastSelected = selectedList.length > 0 ? selectedList[selectedList.length - 1] : null;

  // Notifikuj parent pri zmene výberu
  useEffect(() => {
    if (onSelect) onSelect(lastSelected !== null ? BASE_LEVELS[lastSelected] : null);
    if (onSelectionChange) onSelectionChange(selectedList.map((i) => BASE_LEVELS[i]));
    if (selectedList.length === 0 && onDeselect) onDeselect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedList.join(',')]);

  // Reset výberu pri zmene módu
  useEffect(() => { setSelectedList([]); }, [mode]);

  useEffect(() => () => {
    if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
  }, []);

  const triggerRotation = useCallback((idx) => {
    const level = BASE_LEVELS[idx];
    if (onRotate) onRotate(level, idx);
    if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
    rotateTimerRef.current = setTimeout(() => {
      if (onRotateComplete) onRotateComplete(level, idx);
    }, ROTATION_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRotate, onRotateComplete]);

  const handleRingClick = useCallback((idx) => {
    const selDir = idx % 2 === 0 ? 1 : -1;  // párne = doprava, nepárne = doľava

    if (mode === 'single') {
      setSelectedList((prev) => {
        if (prev.includes(idx)) return prev.filter((x) => x !== idx);
        return [...prev, idx];
      });
      setRotations((prev) => {
        const next = prev.slice();
        next[idx] = next[idx] + 360 * selDir;
        return next;
      });
      triggerRotation(idx);
      return;
    }

    // Integrative: klik na N → rozsvieti 0..N; klik na už označenú = zhasne všetko
    const isDeselect = lastSelected === idx;
    if (isDeselect) {
      setSelectedList([]);
      setRotations((prev) => {
        const next = prev.slice();
        for (let i = 0; i <= idx; i++) next[i] = next[i] + 360 * selDir;
        return next;
      });
      return;
    }
    const list = [];
    for (let i = 0; i <= idx; i++) list.push(i);
    setSelectedList(list);
    setRotations((prev) => {
      const next = prev.slice();
      for (let i = 0; i <= idx; i++) next[i] = next[i] + 360 * selDir;
      return next;
    });
    triggerRotation(idx);
  }, [selectedList, lastSelected, mode, triggerRotation]);

  const isActive  = (i) => selectedList.includes(i);
  const isDimmed  = (i) => selectedList.length > 0 && !isActive(i);
  const isHovered = (i) => hovered === i && !isActive(i);

  const tintColorFor = (i) => {
    if (!isActive(i)) return null;
    if (mode === 'single') return BASE_LEVELS[i].color;
    return lastSelected !== null ? BASE_LEVELS[lastSelected].color : null;
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        aspectRatio: '1 / 1',
        margin: '0 auto',
        ...style,
      }}
    >
      <Halo />

      {BASE_LEVELS.map((level, i) => (
        <RingLayer
          key={level.key}
          level={level}
          idx={i}
          rotation={rotations[i]}
          isActive={isActive(i)}
          isDimmed={isDimmed(i)}
          isHovered={isHovered(i)}
          tintColor={tintColorFor(i)}
          mandalaSrc={mandalaSrc}
        />
      ))}

      <CenterDot />
      <HitOverlay onClick={handleRingClick} onHover={setHovered} />
    </div>
  );
}

export const SPIRAL_LEVEL_KEYS = BASE_LEVELS.map((l) => l.key);
export const SPIRAL_LEVEL_COLORS = Object.fromEntries(BASE_LEVELS.map((l) => [l.key, l.color]));
export const ROTATION_DURATION_MS = ROTATION_MS;
