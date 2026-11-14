'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatBytes, maxBytes, statusOf, tabColor, toCode } from '../lib/format';

const VISIBLE = 9;
const AHEAD = 2; // hidden cards mounted past the visible tail so scrolling never builds on demand
const W = 1.6;
const H = 1.2;
const T = 0.07;
const TURN = 0.82;
const FACE_W = 512;
const FACE_H = 384;
const pad = (n) => String(n).padStart(3, '0');
const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function slotPose(slot) {
  if (slot < 0) return { x: slot * 1.1 - 0.9, y: slot * 0.2 - 0.35, z: -slot * 1.8 + 1.2, fade: 0 };
  return { x: slot * 0.44, y: slot * 0.3, z: -slot * 0.78, fade: slot >= VISIBLE ? 0 : 1 - slot * 0.06 };
}

function fitLines(g, text, width, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > width && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines) lines.push(line);
  else if (line) lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  return lines.filter(Boolean);
}

function texture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/* ───────── texture cache: every face/tag is drawn once and reused ───────── */

const CACHE_MAX = 160;
const cache = new Map();

function cached(key, draw) {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const tex = draw();
  cache.set(key, tex);
  if (cache.size > CACHE_MAX) {
    const [oldKey, old] = cache.entries().next().value;
    cache.delete(oldKey);
    // Safe even if still on screen: three re-uploads a disposed texture on next use.
    old.dispose();
  }
  return tex;
}

function drawLock(g, x, y) {
  g.save();
  g.strokeStyle = '#ff5a5f';
  g.fillStyle = '#c3212d';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(x + 18, y + 15, 12, Math.PI, 0);
  g.stroke();
  g.fillRect(x, y + 15, 36, 29);
  g.fillStyle = '#fff';
  g.fillRect(x + 15, y + 23, 5, 11);
  g.restore();
}

function faceKey(e, color, dark) {
  return `f|${e.path}|${e.bytes}|${e.error ? 1 : 0}|${e.locked ? 1 : 0}|${statusOf(e)}|${color}|${dark ? 1 : 0}`;
}

function drawFace(entry, color, dark) {
  const { name, bytes, error, locked, kind, ext } = entry;
  const isFile = entry.type === 'file';
  const status = statusOf(entry);
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, c.width, c.height);
  if (dark) {
    bg.addColorStop(0, 'rgba(118,128,140,0.95)');
    bg.addColorStop(0.55, 'rgba(74,82,94,0.95)');
    bg.addColorStop(1, 'rgba(46,52,62,0.96)');
  } else {
    bg.addColorStop(0, 'rgba(98,102,110,0.94)');
    bg.addColorStop(0.55, 'rgba(58,62,69,0.95)');
    bg.addColorStop(1, 'rgba(32,35,40,0.96)');
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
  const sheen = g.createLinearGradient(0, 0, 0, c.height * 0.45);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, c.width, c.height * 0.45);

  g.strokeStyle = dark ? 'rgba(170,230,245,0.45)' : 'rgba(255,255,255,0.28)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);

  if (isFile) {
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.moveTo(c.width - 56, 0);
    g.lineTo(c.width, 56);
    g.lineTo(c.width - 56, 56);
    g.closePath();
    g.fill();
    g.fillStyle = dark ? '#2b3138' : '#1d2024';
    g.beginPath();
    g.moveTo(c.width - 56, 0);
    g.lineTo(c.width, 0);
    g.lineTo(c.width, 56);
    g.closePath();
    g.fill();
  }

  g.textBaseline = 'top';
  g.fillStyle = '#f5f7f9';
  g.font = '700 58px Bahnschrift, "Segoe UI", sans-serif';
  const lines = fitLines(g, toCode(name), c.width - 72, 2);
  lines.forEach((line, i) => g.fillText(line, 35, 35 + i * 62));

  g.font = '600 34px "Cascadia Mono", Consolas, monospace';
  g.fillStyle = 'rgba(232,238,242,0.8)';
  const sizeText =
    error || locked ? 'LOCKED' : bytes == null ? (entry.where != null ? 'FOLDER' : 'MEASURING…') : formatBytes(bytes).replace(' ', '_');
  g.fillText(sizeText, 35, 50 + lines.length * 62);
  if (isFile || status !== 'normal') {
    g.font = '500 22px "Cascadia Mono", Consolas, monospace';
    g.fillStyle = 'rgba(232,238,242,0.55)';
    const labels = { sensitive: 'SENSITIVE', readonly: 'READ_ONLY', locked: 'LOCKED' };
    const kindText = isFile ? `FILE · ${toCode(ext || kind || '')}` : 'FOLDER';
    g.fillText(status !== 'normal' ? `${kindText} · ${labels[status]}` : kindText, 35, 93 + lines.length * 62);
  }
  if (error || locked) drawLock(g, c.width - 184, c.height - 106);

  // meter track; the fill is a separate mesh so size changes never redraw this canvas
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(35, c.height - 102, 304, 5);

  g.fillStyle = color;
  g.fillRect(c.width - 94, c.height - 106, 56, 67);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(c.width - 94, c.height - 106, 56, 5);
  return texture(c);
}

function drawTag(name, color, rank) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 58;
  const g = c.getContext('2d');
  g.font = '600 30px "Cascadia Mono", Consolas, monospace';
  const label = `${pad(rank)}_${toCode(name)}`;
  const text = fitLines(g, label, c.width - 32, 1)[0] || label;
  const width = Math.min(c.width, g.measureText(text).width + 28);
  g.fillStyle = color;
  g.fillRect(0, 0, width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 0, width, 3);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(text, 14, c.height / 2 + 2);
  return texture(c);
}

const faceFor = (entry, color, dark) => cached(faceKey(entry, color, dark), () => drawFace(entry, color, dark));
const tagFor = (entry, color, rank) => cached(`t|${entry.name}|${color}|${rank}`, () => drawTag(entry.name, color, rank));

/* shared geometry: built once for every card */
const geo = {
  edge: new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, T)),
  body: new THREE.BoxGeometry(W, H, T),
  face: new THREE.PlaneGeometry(W, H),
  back: new THREE.BoxGeometry(W * 1.06, H * 1.08, 0.025),
  tab: new THREE.BoxGeometry(0.5, 0.14, 0.025),
  tag: new THREE.PlaneGeometry(1.2, 0.135),
  meter: new THREE.PlaneGeometry(1, 0.016),
};
const METER_W = (304 / FACE_W) * W;
const METER_X = -W / 2 + (35 / FACE_W) * W;
const METER_Y = H / 2 - ((FACE_H - 99.5) / FACE_H) * H;

const Plate = memo(function Plate({ entry, index, slot, rank, scale, share, hovered, dark, onHover, onPick, onOpen, onMenu }) {
  const group = useRef();
  const edge = useRef();
  const materials = useRef(new Set());
  const fade = useRef(0);
  const isFile = entry.type === 'file';
  const color = tabColor(entry);

  const face = faceFor(entry, color, dark);
  const tag = tagFor(entry, color, rank);

  const start = useMemo(() => {
    const p = slotPose(VISIBLE + 1);
    return [p.x, p.y, p.z];
  }, []);

  useFrame((state, dt) => {
    const node = group.current;
    if (!node) return;
    const pose = slotPose(slot);
    const k = reduceMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    const lift = (hovered ? 0.07 : 0) + (slot === 0 && !reduceMotion ? Math.sin(state.clock.elapsedTime * 1.4) * 0.015 : 0);
    const p = node.position;
    p.x += (pose.x - p.x) * k;
    p.y += (pose.y + lift - p.y) * k;
    p.z += (pose.z - p.z) * k;
    const target = hovered ? scale * 1.03 : scale;
    node.scale.setScalar(node.scale.x + (target - node.scale.x) * k);
    const f = fade.current + (pose.fade - fade.current) * k;
    if (Math.abs(f - fade.current) > 0.0005) {
      fade.current = f;
      materials.current.forEach((m) => {
        m.opacity = m.userData.base * f;
      });
    }
    if (edge.current) {
      const glow = slot === 0 ? 0.75 + Math.sin(state.clock.elapsedTime * 3) * 0.2 : hovered ? 0.6 : 0;
      edge.current.opacity += (glow * fade.current - edge.current.opacity) * k;
    }
    node.visible = fade.current > 0.01;
  });

  const keep = useCallback(
    (base) => (m) => {
      if (!m) return;
      m.userData.base = base;
      m.opacity = base * fade.current;
      materials.current.add(m);
    },
    []
  );

  const backColor = dark ? '#6b7783' : '#aab1b7';

  return (
    <group
      ref={group}
      position={start}
      scale={scale}
      rotation={[0, TURN, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (slot >= 0 && slot < VISIBLE) onPick(index, slot);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (slot === 0) onOpen(index);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        if (slot >= 0 && slot < VISIBLE) onMenu(index, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(entry.path);
      }}
      onPointerOut={() => onHover(null)}
    >
      {!isFile && (
        <>
          <mesh geometry={geo.back} position={[-0.12, 0.08, -0.16]}>
            <meshStandardMaterial ref={keep(0.42)} color={backColor} transparent depthWrite={false} roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh geometry={geo.tab} position={[-W / 2 + 0.24, H * 0.54 + 0.14, -0.16]}>
            <meshStandardMaterial ref={keep(0.42)} color={backColor} transparent depthWrite={false} roughness={0.3} metalness={0.2} />
          </mesh>
        </>
      )}
      <mesh geometry={geo.body}>
        <meshStandardMaterial ref={keep(0.9)} color={dark ? '#4a535d' : '#30343a'} transparent roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh geometry={geo.face} position={[0, 0, T / 2 + 0.002]}>
        <meshBasicMaterial ref={keep(1)} map={face} transparent toneMapped={false} />
      </mesh>
      {share > 0 && (
        <mesh
          geometry={geo.meter}
          position={[METER_X + (METER_W * share) / 2, METER_Y, T / 2 + 0.004]}
          scale={[METER_W * share, 1, 1]}
        >
          <meshBasicMaterial ref={keep(1)} color={color} transparent toneMapped={false} />
        </mesh>
      )}
      <lineSegments geometry={geo.edge}>
        <lineBasicMaterial ref={edge} color="#5fd4ee" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <group position={[W * 0.1, -H / 2 - 0.15, 0.06]} rotation={[0, -TURN, 0]}>
        <mesh geometry={geo.tag} position={[0.6, 0, 0]}>
          <meshBasicMaterial ref={keep(1)} map={tag} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
});

/** Keeps the stack framed for any panel size and adds a slight pointer parallax. */
function Rig({ children, shifted }) {
  const group = useRef();
  const { viewport, camera } = useThree();
  const halfW = viewport.width / 2;
  const baseY = -viewport.height * 0.2;
  const targetX = shifted ? halfW * 0.46 : -halfW * 0.4;
  const initial = useRef([targetX, baseY, 0]).current;

  useFrame((state, dt) => {
    if (!group.current) return;
    const d = Math.min(dt, 0.05);
    const k = 1 - Math.exp(-d * 3);
    const g = group.current.position;
    g.x += (targetX - g.x) * (reduceMotion ? 1 : 1 - Math.exp(-d * 7));
    g.y = baseY;
    const px = reduceMotion ? 0 : state.pointer.x;
    const py = reduceMotion ? 0 : state.pointer.y;
    camera.position.x += (0.4 + px * 0.35 - camera.position.x) * k;
    camera.position.y += (0.9 + py * 0.2 - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });

  const fit = Math.min(1, viewport.width / 4.6);
  return (
    <group ref={group} position={initial} scale={fit}>
      {children}
    </group>
  );
}

/** Draws textures for the next cards during idle time so they are ready before they scroll in. */
function usePrewarm(entries, focusIndex, dark) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const queue = entries.slice(focusIndex, focusIndex + VISIBLE + 14).map((e, i) => [e, focusIndex + i]);
    let handle = idle(function work(deadline) {
      while (queue.length && deadline.timeRemaining() > 4) {
        const [entry, index] = queue.shift();
        const color = tabColor(entry);
        faceFor(entry, color, dark);
        tagFor(entry, color, index + 1);
      }
      if (queue.length) handle = idle(work);
    });
    return () => cancel(handle);
  }, [entries, focusIndex, dark]);
}

export default function FolderStack({ folders: entries, focusIndex, shifted, dark, onFocus, onPreview, onOpen, onMenu }) {
  const [hovered, setHovered] = useState(null);
  const max = maxBytes(entries);
  const first = Math.max(0, focusIndex - 2);
  const shown = entries.slice(first, focusIndex + VISIBLE + AHEAD);

  usePrewarm(entries, focusIndex, dark);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  // Stable handlers so memoised cards only re-render when their own data changes.
  const latest = useRef({});
  latest.current = { entries, onFocus, onPreview, onOpen, onMenu };
  const pick = useCallback((index, slot) => {
    const l = latest.current;
    if (slot === 0) l.onPreview(l.entries[index]);
    else l.onFocus(index);
  }, []);
  const open = useCallback((index) => latest.current.onOpen(latest.current.entries[index]), []);
  const menu = useCallback((index, x, y) => latest.current.onMenu?.(latest.current.entries[index], x, y), []);

  return (
    <Canvas
      className="stack-canvas"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0.4, 0.9, 9], fov: 30 }}
      onPointerMissed={() => setHovered(null)}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[-5, 6, 7]} intensity={1.6} />
      <directionalLight position={[6, -2, 3]} intensity={0.5} color="#bfe3f0" />
      <Rig shifted={shifted}>
        {shown.map((entry, i) => {
          const index = first + i;
          const known = max && entry.bytes ? entry.bytes / max : 0;
          return (
            <Plate
              key={entry.path}
              entry={entry}
              index={index}
              slot={index - focusIndex}
              rank={index + 1}
              scale={entry.bytes == null ? 0.88 : 0.8 + Math.sqrt(known) * 0.22}
              share={known}
              hovered={hovered === entry.path}
              dark={dark}
              onHover={setHovered}
              onPick={pick}
              onOpen={open}
              onMenu={menu}
            />
          );
        })}
      </Rig>
    </Canvas>
  );
}
