'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatBytes, maxBytes, toCode } from '../lib/format';

const PALETTE = ['#1d3fc4', '#e2911a', '#e3b21c', '#e9c42a', '#c3212d', '#1aa6d8', '#5b4bd0', '#2f9f6a'];
const VISIBLE = 9;
const W = 1.6;
const H = 1.2;
const T = 0.07;
const TURN = 0.82;
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
  tex.anisotropy = 8;
  return tex;
}

function drawFace({ name, bytes, error, color, rank, share }) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, c.width, c.height);
  bg.addColorStop(0, 'rgba(98,102,110,0.94)');
  bg.addColorStop(0.55, 'rgba(58,62,69,0.95)');
  bg.addColorStop(1, 'rgba(32,35,40,0.96)');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);

  // faint scanlines + top sheen, like backlit smoked glass
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
  const sheen = g.createLinearGradient(0, 0, 0, c.height * 0.45);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, c.width, c.height * 0.45);

  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, c.width - 4, c.height - 4);

  g.textBaseline = 'top';
  g.fillStyle = '#f5f7f9';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 6;
  g.font = '700 72px Bahnschrift, "Segoe UI", sans-serif';
  const lines = fitLines(g, toCode(name), c.width - 90, 2);
  lines.forEach((line, i) => g.fillText(line, 44, 44 + i * 78));
  g.shadowBlur = 0;

  g.font = '600 42px "Cascadia Mono", Consolas, monospace';
  g.fillStyle = 'rgba(232,238,242,0.8)';
  const sizeText = error ? 'NO_ACCESS' : bytes == null ? 'MEASURING…' : formatBytes(bytes).replace(' ', '_');
  g.fillText(sizeText, 44, 62 + lines.length * 78);

  // size share meter
  const meterY = c.height - 128;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(44, meterY, 380, 6);
  g.fillStyle = error ? '#6d7177' : color;
  g.fillRect(44, meterY, Math.max(4, 380 * (share || 0)), 6);

  g.font = '500 30px "Cascadia Mono", Consolas, monospace';
  g.fillStyle = 'rgba(232,238,242,0.5)';
  g.fillText(`RANK_${pad(rank)}`, 44, c.height - 86);

  g.fillStyle = error ? '#6d7177' : color;
  g.fillRect(c.width - 118, c.height - 132, 70, 84);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(c.width - 118, c.height - 132, 70, 6);
  return texture(c);
}

function drawTag({ name, color, rank }) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 72;
  const g = c.getContext('2d');
  g.font = '600 38px "Cascadia Mono", Consolas, monospace';
  const label = `${pad(rank)}_${toCode(name)}`;
  const text = fitLines(g, label, c.width - 40, 1)[0] || label;
  const width = Math.min(c.width, g.measureText(text).width + 36);
  g.fillStyle = color;
  g.fillRect(0, 0, width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 0, width, 4);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(text, 18, c.height / 2 + 2);
  return texture(c);
}

const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, T));

function Plate({ folder, slot, rank, color, scale, share, hovered, onHover, onPick, onOpen }) {
  const group = useRef();
  const edge = useRef();
  const materials = useRef(new Set());
  const fade = useRef(0);

  const face = useMemo(
    () => drawFace({ name: folder.name, bytes: folder.bytes, error: folder.error, color, rank, share }),
    [folder.name, folder.bytes, folder.error, color, rank, share]
  );
  const tag = useMemo(() => drawTag({ name: folder.name, color, rank }), [folder.name, color, rank]);
  useEffect(() => () => face.dispose(), [face]);
  useEffect(() => () => tag.dispose(), [tag]);

  const start = useMemo(() => {
    const p = slotPose(VISIBLE + 1);
    return [p.x, p.y, p.z];
  }, []);

  useFrame((state, dt) => {
    const node = group.current;
    if (!node) return;
    const pose = slotPose(slot);
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 7);
    const lift = (hovered ? 0.07 : 0) + (slot === 0 && !reduceMotion ? Math.sin(state.clock.elapsedTime * 1.4) * 0.015 : 0);
    node.position.x += (pose.x - node.position.x) * k;
    node.position.y += (pose.y + lift - node.position.y) * k;
    node.position.z += (pose.z - node.position.z) * k;
    const target = hovered ? scale * 1.03 : scale;
    node.scale.setScalar(node.scale.x + (target - node.scale.x) * k);
    fade.current += (pose.fade - fade.current) * k;
    materials.current.forEach((m) => {
      m.opacity = m.userData.base * fade.current;
    });
    if (edge.current) {
      const glow = slot === 0 ? 0.75 + Math.sin(state.clock.elapsedTime * 3) * 0.2 : hovered ? 0.6 : 0;
      edge.current.opacity += (glow * fade.current - edge.current.opacity) * k;
    }
    node.visible = fade.current > 0.01;
  });

  const keep = (base) => (m) => {
    if (!m) return;
    m.userData.base = base;
    materials.current.add(m);
  };

  return (
    <group
      ref={group}
      position={start}
      scale={scale}
      rotation={[0, TURN, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (slot >= 0 && slot < VISIBLE) onPick(folder, slot);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (slot === 0) onOpen(folder.path);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(folder.path);
      }}
      onPointerOut={() => onHover(null)}
    >
      {/* folder back cover + tab, peeking out behind the plate */}
      <mesh position={[-0.12, 0.08, -0.16]}>
        <boxGeometry args={[W * 1.06, H * 1.08, 0.025]} />
        <meshStandardMaterial ref={keep(0.42)} color="#aab1b7" transparent depthWrite={false} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[-W / 2 + 0.24, H * 0.54 + 0.14, -0.16]}>
        <boxGeometry args={[0.5, 0.14, 0.025]} />
        <meshStandardMaterial ref={keep(0.42)} color="#aab1b7" transparent depthWrite={false} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial ref={keep(0.9)} color="#30343a" transparent roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, T / 2 + 0.002]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial ref={keep(1)} map={face} transparent toneMapped={false} />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial ref={edge} color="#5fd4ee" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <group position={[W * 0.1, -H / 2 - 0.15, 0.06]} rotation={[0, -TURN, 0]}>
        <mesh position={[0.6, 0, 0]}>
          <planeGeometry args={[1.2, 0.135]} />
          <meshBasicMaterial ref={keep(1)} map={tag} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

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
    const k = 1 - Math.exp(-dt * 3);
    const g = group.current.position;
    g.x += (targetX - g.x) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 6));
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

export default function FolderStack({ folders, focusIndex, shifted, onFocus, onPreview, onOpen }) {
  const [hovered, setHovered] = useState(null);
  const max = maxBytes(folders);
  const first = Math.max(0, focusIndex - 2);
  const shown = folders.slice(first, focusIndex + VISIBLE + 1);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  return (
    <Canvas
      className="stack-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0.4, 0.9, 9], fov: 30 }}
      onPointerMissed={() => setHovered(null)}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[-5, 6, 7]} intensity={1.6} />
      <directionalLight position={[6, -2, 3]} intensity={0.5} color="#bfe3f0" />
      <Rig shifted={shifted}>
        {shown.map((folder, i) => {
          const index = first + i;
          const share = max && folder.bytes ? Math.sqrt(folder.bytes / max) : 0;
          return (
            <Plate
              key={folder.path}
              folder={folder}
              slot={index - focusIndex}
              rank={index + 1}
              color={PALETTE[index % PALETTE.length]}
              scale={folder.bytes == null ? 0.88 : 0.8 + share * 0.22}
              share={max && folder.bytes ? folder.bytes / max : 0}
              hovered={hovered === folder.path}
              onHover={setHovered}
              onPick={(_, slot) => (slot === 0 ? onPreview() : onFocus(index))}
              onOpen={onOpen}
            />
          );
        })}
      </Rig>
    </Canvas>
  );
}
