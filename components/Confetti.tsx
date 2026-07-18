"use client";

import { useEffect, useState } from "react";

const COLORS = ["#afff00", "#f7f7f4", "#00d4ff", "#ff6b35", "#9a9a92"];

/** Confetti burst; retriggers whenever `burst` changes to a new truthy value. */
export default function Confetti({ burst }: { burst: number }) {
  const [pieces, setPieces] = useState<
    { left: number; color: string; delay: number; drift: number }[]
  >([]);

  useEffect(() => {
    if (!burst) return;
    setPieces(
      Array.from({ length: 44 }, () => ({
        left: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.25,
        drift: (Math.random() - 0.5) * 60,
      })),
    );
    const id = setTimeout(() => setPieces([]), 2100);
    return () => clearTimeout(id);
  }, [burst]);

  if (!pieces.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={`${burst}-${i}`}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            marginLeft: p.drift,
          }}
        />
      ))}
    </div>
  );
}
