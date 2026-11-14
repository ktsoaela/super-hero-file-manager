'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatBytes, maxBytes, toCode } from '../lib/format';

const PALETTE = ['#1d3fc4', '#e2911a', '#e3b21c', '#e9c42a', '#c3212d', '#1aa6d8', '#5b4bd0', '#2f9f6a'];
const VISIBLE = 9;
const W = 1.6;
const H = 1.2;
const T = 0.07;
const TURN = 0.62;
const pad = (n) => String(n).padStart(3, '0');

function slotPose(slot) {
  if (slot < 0) return { x: slot * 1.2 - 0.8, y: slot * 0.15 - 0.3, z: -slot * 1.6 + 0.8, fade: 0 };
  return { x: slot * 0.52, y: slot * 0.34, z: -slot * 0.9, fade: slot >= VISIBLE ? 0 : 1 - slot * 0.055 };
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

function drawFace({ name, bytes, error, color, rank }) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, c.width, c.height);
  bg.addColorStop(0, 'rgba(84,88,95,0.93)');
  bg.addColorStop(1, 'rgba(36,39,44,0.95)');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 5;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);

  g.textBaseline = 'top';
  g.fillStyle = '#f5f7f9';
  g.font = '700 70px Bahnschrift, "Segoe UI", sans-serif';
  const lines = fitLines(g, toCode(name), c.width - 90, 2);
  lines.forEach((line, i) => g.fillText(line, 44, 48 + i * 78));

  g.font = '600 42px "Cascadia Mono", Consolas, monospace';
  g.fillStyle = 'rgba(232,238,242,0.78)';
  const sizeText = error ? 'NO_ACCESS' : bytes == null ? 'MEASURING…' : formatBytes(bytes).replace(' ', '_');
  g.fillText(sizeText, 44, 66 + lines.length * 78);

  g.font = '500 32px "Cascadia Mono", Consolas, monospace';
  g.fillStyle = 'rgba(232,238,242,0.5)';
  g.fillText(`RANK_${pad(rank)}`, 44, c.height - 80);

  g.fillStyle = error ? '#6d7177' : color;
  g.fillRect(c.width - 118, c.height - 132, 70, 84);
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
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(text, 18, c.height / 2 + 2);
  return texture(c);
}

function Plate({ folder, slot, rank, color, scale, hovered, onHover, onPick }) {
  const group = useRef();
  const materials = useRef(new Set());
  const fade = useRef(0);

  const face = useMemo(
    () => drawFace({ name: folder.name, bytes: folder.bytes, error: folder.error, color, rank }),
    [folder.name, folder.bytes, folder.error, color, rank]
  );
  const tag = useMemo(() => drawTag({ name: folder.name, color, rank }), [folder.name, color, rank]);
  useEffect(() => () => face.dispose(), [face]);
  useEffect(() => () => tag.dispose(), [tag]);

  const start = useMemo(() => {
    const p = slotPose(VISIBLE + 1);
    return [p.x, p.y, p.z];
  }, []);

  useFrame((_, dt) => {
    const node = group.current;
    if (!node) return;
    const pose = slotPose(slot);
    const k = 1 - Math.exp(-dt * 7);
    node.position.x += (pose.x - node.position.x) * k;
    node.position.y += (pose.y + (hovered ? 0.06 : 0) - node.position.y) * k;
    node.position.z += (pose.z - node.position.z) * k;
    const target = hovered ? scale * 1.03 : scale;
    node.scale.setScalar(node.scale.x + (target - node.scale.x) * k);
    fade.current += (pose.fade - fade.current) * k;
    materials.current.forEach((m) => {
      m.opacity = m.userData.base * fade.current;
    });
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
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(folder.path);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0.1, 0.07, -0.14]}>
        <boxGeometry args={[W * 1.03, H * 1.06, 0.025]} />
        <meshStandardMaterial ref={keep(0.38)} color="#a7adb3" transparent depthWrite={false} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[-W / 2 + 0.36, H * 0.53 + 0.1, -0.14]}>
        <boxGeometry args={[0.56, 0.16, 0.025]} />
        <meshStandardMaterial ref={keep(0.38)} color="#a7adb3" transparent depthWrite={false} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial ref={keep(0.88)} color="#30343a" transparent roughness={0.3} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0, T / 2 + 0.002]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial ref={keep(1)} map={face} transparent toneMapped={false} />
      </mesh>
      <group position={[W * 0.08, -H / 2 - 0.15, 0.06]} rotation={[0, -TURN, 0]}>
        <mesh position={[0.6, 0, 0]}>
          <planeGeometry args={[1.2, 0.135]} />
          <meshBasicMaterial ref={keep(1)} map={tag} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export default function FolderStack({ folders, focusIndex, onFocus, onOpen }) {
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
      <directionalLight position={[6, -2, 3]} intensity={0.4} color="#bfe3f0" />
      <group position={[-1.7, -1.55, 0]}>
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
              hovered={hovered === folder.path}
              onHover={setHovered}
              onPick={(picked, slot) => (slot === 0 ? onOpen(picked.path) : onFocus(index))}
            />
          );
        })}
      </group>
    </Canvas>
  );
}
