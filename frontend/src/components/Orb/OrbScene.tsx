/**
 * WebGL AI core orb — the heavy half of the kit.
 *
 * Only ever reached through React.lazy from Orb.tsx, so three + @react-three/
 * fiber stay in their own chunk and never load on machines that get the CSS
 * fallback.
 *
 * Budget: one THREE.Points draw call for 900 particles plus two ring meshes.
 * Everything the frame loop touches is pre-allocated at module or mount time
 * — a single `new` inside useFrame is 60 garbage objects a second.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stepEnvelope, useOrbEnvelope } from './useOrbEnvelope';

const PARTICLE_COUNT = 900;
const GOLDEN_ANGLE = Math.PI * (1 + Math.sqrt(5));

/** Same two hues the CSS orb uses (`--orb-core` / `--orb-rim` in hud.css). */
const IDLE_HEX = '#39ff14';
const SPEAKING_HEX = '#00ffff';
const IDLE_COLOR = new THREE.Color(IDLE_HEX);
const SPEAKING_COLOR = new THREE.Color(SPEAKING_HEX);

/** Group scale by state — the orb leans in as it wakes up and talks. */
const SCALE_DISCONNECTED = 0.44;
const SCALE_CONNECTED = 0.62;
const SCALE_SPEAKING = 0.72;

interface OrbSceneProps {
  connected: boolean;
  speaking: boolean;
  size: number;
}

/**
 * Fibonacci sphere: even coverage without the pole bunching a lat/long grid
 * gives you. Returns unit directions; the frame loop scales them radially.
 */
function buildDirections(): Float32Array {
  const dirs = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
    const theta = GOLDEN_ANGLE * i;
    const sinPhi = Math.sin(phi);
    dirs[i * 3] = sinPhi * Math.cos(theta);
    dirs[i * 3 + 1] = Math.cos(phi);
    dirs[i * 3 + 2] = sinPhi * Math.sin(theta);
  }
  return dirs;
}

/**
 * Static per-particle brightness. Deterministic so the field does not shimmer
 * between mounts, and static so the colour buffer is uploaded once — the hue
 * itself rides on the material tint, which multiplies against these.
 */
function buildShades(): Float32Array {
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const noise = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const shade = 0.72 + 0.28 * noise;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  return colors;
}

interface OrbCoreProps {
  connected: boolean;
  speaking: boolean;
  /** False while the tab is hidden — the frame loop no-ops rather than burning GPU. */
  activeRef: RefObject<boolean>;
}

function OrbCore({ connected, speaking, activeRef }: OrbCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const ringARef = useRef<THREE.Group>(null);
  const ringBRef = useRef<THREE.Group>(null);

  const envelopeRef = useOrbEnvelope();
  const scaleRef = useRef(SCALE_DISCONNECTED);

  const { directions, positions, shades } = useMemo(() => {
    const dirs = buildDirections();
    return {
      directions: dirs,
      // Displaced copy the geometry actually renders from.
      positions: new Float32Array(dirs),
      shades: buildShades(),
    };
  }, []);

  useFrame((state, delta) => {
    if (!activeRef.current) return;

    const t = state.clock.elapsedTime;
    const env = stepEnvelope(envelopeRef.current, speaking, t);
    envelopeRef.current = env;

    const points = pointsRef.current;
    if (points) {
      const attr = points.geometry.attributes.position as THREE.BufferAttribute;
      const array = attr.array as Float32Array;
      const amplitude = env * 0.18;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const j = i * 3;
        const r = 1 + amplitude * Math.sin(t * 3 + i * 0.37);
        array[j] = directions[j] * r;
        array[j + 1] = directions[j + 1] * r;
        array[j + 2] = directions[j + 2] * r;
      }
      attr.needsUpdate = true;
    }

    // Uniform tint on the material rather than 2700 floats re-uploaded per
    // frame; the colour attribute carries the static per-particle brightness
    // this multiplies against.
    const material = materialRef.current;
    if (material) material.color.copy(IDLE_COLOR).lerp(SPEAKING_COLOR, env);

    const group = groupRef.current;
    if (group) {
      const target = speaking
        ? SCALE_SPEAKING
        : connected
          ? SCALE_CONNECTED
          : SCALE_DISCONNECTED;
      // Clamped so a long frame eases in rather than overshooting.
      scaleRef.current += (target - scaleRef.current) * Math.min(1, delta * 3);
      group.scale.setScalar(scaleRef.current);
      group.rotation.y += delta * 0.08;
    }

    if (ringARef.current) ringARef.current.rotation.y += delta * 0.35;
    if (ringBRef.current) ringBRef.current.rotation.y -= delta * 0.22;
  });

  return (
    <group ref={groupRef} scale={SCALE_DISCONNECTED}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[shades, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          vertexColors
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Rings are tilted inside a group that spins about Y: spinning a torus
          about its own axis of symmetry would be invisible. */}
      <group ref={ringARef}>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[1.35, 0.008, 8, 96]} />
          <meshBasicMaterial
            color={IDLE_HEX}
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group ref={ringBRef}>
        <mesh rotation={[Math.PI / 1.7, 0.5, 0]}>
          <torusGeometry args={[1.6, 0.006, 8, 96]} />
          <meshBasicMaterial
            color={SPEAKING_HEX}
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function OrbScene({ connected, speaking, size }: OrbSceneProps) {
  // Ref rather than state: the frame loop reads it, and flipping it must not
  // remount the canvas.
  const activeRef = useRef(true);

  useEffect(() => {
    const sync = () => {
      activeRef.current = document.visibilityState !== 'hidden';
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return (
    <Canvas
      style={{ width: size, height: size }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      gl={{ antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }}
    >
      <OrbCore connected={connected} speaking={speaking} activeRef={activeRef} />
    </Canvas>
  );
}
