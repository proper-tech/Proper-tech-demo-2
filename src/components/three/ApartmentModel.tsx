'use client';

import { useMemo } from 'react';
import { DoubleSide, MeshBasicMaterial, PlaneGeometry, type Material, MeshStandardMaterial } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Finish, Layout, Room } from '@/data/types';
import { maxCeiling, roomEdges, type Edge } from '@/lib/geometry';
import { Furniture } from './Furniture';
import { tileTexture, woodTexture } from './textures';

// The apartment is generated from the layout data. Walls are single-sided planes that
// face into their room, so walls between the camera and a room disappear on their own.
// That gives the open "dollhouse" view from outside and solid rooms from inside, with
// one model for both.

const DOOR_H = 2.1;
const OPENING_H = 2.3;
const SILL_H = 0.9;
const WINDOW_TOP = 2.3;

interface Mats {
  wall: Material;
  wetWall: Material;
  cap: Material;
  frame: Material;
  glass: Material;
  door: Material;
  ceiling: Material;
}

function Panel({ x, y0, y1, w, mat }: { x: number; y0: number; y1: number; w: number; mat: Material }) {
  if (y1 - y0 < 0.01) return null;
  return (
    <mesh position={[x, (y0 + y1) / 2, 0]} material={mat}>
      <planeGeometry args={[w, y1 - y0]} />
    </mesh>
  );
}

function Bar({ p, s, mat }: { p: [number, number, number]; s: [number, number, number]; mat: Material }) {
  return (
    <mesh position={p} material={mat}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function WallEdge({ edge, H, wall, mats }: { edge: Edge; H: number; wall: Material; mats: Mats }) {
  return (
    <group position={[edge.start[0], 0, edge.start[1]]} rotation={[0, edge.rotY, 0]}>
      {edge.segments.map((seg, i) => {
        const w = seg.to - seg.from;
        const x = (seg.from + seg.to) / 2;
        switch (seg.kind) {
          case 'open':
            return null;
          case 'solid':
            return <Panel key={i} x={x} y0={0} y1={H} w={w} mat={wall} />;
          case 'opening':
            return <Panel key={i} x={x} y0={OPENING_H} y1={H} w={w} mat={wall} />;
          case 'door':
          case 'entry':
            return (
              <group key={i}>
                <Panel x={x} y0={DOOR_H} y1={H} w={w} mat={wall} />
                <Bar p={[seg.from + 0.025, DOOR_H / 2, 0]} s={[0.05, DOOR_H, 0.14]} mat={mats.frame} />
                <Bar p={[seg.to - 0.025, DOOR_H / 2, 0]} s={[0.05, DOOR_H, 0.14]} mat={mats.frame} />
                <Bar p={[x, DOOR_H - 0.025, 0]} s={[w, 0.05, 0.14]} mat={mats.frame} />
                {seg.kind === 'entry' && <Bar p={[x, DOOR_H / 2, 0]} s={[w - 0.1, DOOR_H - 0.05, 0.05]} mat={mats.door} />}
              </group>
            );
          case 'window':
            return (
              <group key={i}>
                <Panel x={x} y0={0} y1={SILL_H} w={w} mat={wall} />
                <Panel x={x} y0={WINDOW_TOP} y1={H} w={w} mat={wall} />
                <mesh position={[x, (SILL_H + WINDOW_TOP) / 2, 0]} material={mats.glass}>
                  <planeGeometry args={[w, WINDOW_TOP - SILL_H]} />
                </mesh>
                <Bar p={[x, SILL_H, 0]} s={[w, 0.05, 0.18]} mat={mats.frame} />
                <Bar p={[x, WINDOW_TOP, 0]} s={[w, 0.05, 0.1]} mat={mats.frame} />
                {[seg.from + 0.025, x, seg.to - 0.025].map((px) => (
                  <Bar key={px} p={[px, (SILL_H + WINDOW_TOP) / 2, 0]} s={[0.05, WINDOW_TOP - SILL_H, 0.1]} mat={mats.frame} />
                ))}
              </group>
            );
        }
      })}
      {/* Dark line along the top of the wall: the "cut" outline seen from above. */}
      {edge.segments
        .filter((seg) => seg.kind !== 'open')
        .map((seg, i) => (
          <Bar key={`cap${i}`} p={[(seg.from + seg.to) / 2, H + 0.05, 0.03]} s={[seg.to - seg.from, 0.04, 0.06]} mat={mats.cap} />
        ))}
    </group>
  );
}

function RoomFloor({
  room,
  color,
  selected,
  onSelect,
}: {
  room: Room;
  color: string;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  // Scale the UVs so the texture keeps its real-world size in every room.
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(room.w, room.d);
    const repeat = room.wet ? 1.2 : 2;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * room.w) / repeat, (uv.getY(i) * room.d) / repeat);
    return g;
  }, [room.w, room.d, room.wet]);

  const handleClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 4) return; // a drag, not a click
        e.stopPropagation();
        onSelect(room.id);
      }
    : undefined;

  return (
    <group position={[room.x + room.w / 2, 0, room.z + room.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry} onClick={handleClick}>
        <meshStandardMaterial color={color} map={room.wet ? tileTexture() : woodTexture()} roughness={room.wet ? 0.4 : 0.75} />
      </mesh>
      {selected && (
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[room.w, room.d]} />
          <meshBasicMaterial color="#2F6FDE" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export interface ApartmentModelProps {
  layout: Layout;
  finish: Finish;
  /** Grey massing model without furniture (sold and reserved apartments). */
  muted?: boolean;
  selectedRoom?: string | null;
  onSelectRoom?: (id: string) => void;
}

export function ApartmentModel({ layout, finish, muted, selectedRoom, onSelectRoom }: ApartmentModelProps) {
  const H = maxCeiling(layout);

  const mats = useMemo<Mats>(() => {
    const std = (color: string, roughness = 0.95) => new MeshStandardMaterial({ color, roughness });
    return {
      wall: std(finish.wall),
      wetWall: std(muted ? finish.wall : '#E7EDF0', 0.5),
      cap: std(muted ? '#8A95A3' : '#14233B'),
      frame: std(muted ? '#E3E7EB' : '#FBFBF9', 0.6),
      glass: new MeshStandardMaterial({ color: '#A9CBEA', transparent: true, opacity: 0.28, roughness: 0.1, side: DoubleSide, depthWrite: false }),
      door: std(finish.wood, 0.7),
      // Unlit, so ceilings stay bright when seen from inside the room.
      ceiling: new MeshBasicMaterial({ color: muted ? finish.wall : '#F6F6F3' }),
    };
  }, [finish.wall, finish.wood, muted]);

  const edges = useMemo(
    () => layout.rooms.map((room) => ({ room, edges: roomEdges(room, layout.openings) })),
    [layout],
  );

  return (
    <group>
      {edges.map(({ room, edges: roomWalls }) => (
        <group key={room.id}>
          <RoomFloor
            room={room}
            color={room.wet && !muted ? '#DCE3E6' : finish.floor}
            selected={selectedRoom === (room.partOf ?? room.id)}
            onSelect={onSelectRoom}
          />
          <mesh position={[room.x + room.w / 2, room.h, room.z + room.d / 2]} rotation={[Math.PI / 2, 0, 0]} material={mats.ceiling}>
            <planeGeometry args={[room.w, room.d]} />
          </mesh>
          {roomWalls.map((edge, i) => (
            <WallEdge key={i} edge={edge} H={H} wall={room.wet ? mats.wetWall : mats.wall} mats={mats} />
          ))}
        </group>
      ))}
      {!muted && <Furniture items={layout.furniture} finish={finish} />}
    </group>
  );
}
