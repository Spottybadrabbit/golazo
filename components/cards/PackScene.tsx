"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";

/**
 * The pack. A glossy foil brick — GOLAZO gold with a volt rim-light — that
 * floats with idle sway and pointer tilt, then rips open on tap: a shake, a
 * spin, a bloom of light, and it's gone, handing off to the card walkout.
 *
 * Vanilla three.js (the app's convention — no react-three-fiber) + gsap for the
 * open timeline. Falls back to a static CSS pack when WebGL or motion is out.
 */
export default function PackScene({
  onOpen,
  busy = false,
}: {
  onOpen: () => void;
  busy?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<() => void>(() => {});
  const [flash, setFlash] = useState(false);
  const [opening, setOpening] = useState(false);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebgl(false);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "pointer";

    // --- foil face texture, drawn procedurally ---
    const tex = makeFoilTexture();

    const pack = new THREE.Group();
    scene.add(pack);

    const bodyMat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.82,
      roughness: 0.28,
      color: 0xffffff,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x9c7a1e,
      metalness: 0.9,
      roughness: 0.35,
    });
    const geo = new THREE.BoxGeometry(3, 4.3, 0.32);
    // face texture on front/back (materialIndex 4/5), foil on the sides
    const brick = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, bodyMat, bodyMat]);
    pack.add(brick);

    // volt rim glow — a slightly larger dark shell behind that catches emissive
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(3.12, 4.42, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        emissive: new THREE.Color(0xafff00),
        emissiveIntensity: 0.35,
        metalness: 0.4,
        roughness: 0.6,
      }),
    );
    rim.position.z = -0.06;
    pack.add(rim);

    // lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.PointLight(0xffffff, 90, 40);
    key.position.set(4, 6, 8);
    scene.add(key);
    const volt = new THREE.PointLight(0xafff00, 60, 40);
    volt.position.set(-5, -2, 6);
    scene.add(volt);
    const cyan = new THREE.PointLight(0x00d4ff, 26, 40);
    cyan.position.set(3, -4, 5);
    scene.add(cyan);

    // resize
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // pointer tilt
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.6;
    };
    mount.addEventListener("pointermove", onPointer);

    let raf = 0;
    let t = 0;
    let spinning = false;
    const render = () => {
      t += 0.016;
      if (!spinning) {
        pack.position.y = reduced ? 0 : Math.sin(t * 1.3) * 0.16;
        pack.rotation.y += (target.x - pack.rotation.y) * 0.08 + (reduced ? 0 : 0.004);
        pack.rotation.x += (target.y - pack.rotation.x) * 0.08;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    // open timeline, exposed to the click handler
    openRef.current = () => {
      if (spinning) return;
      spinning = true;
      setOpening(true);
      if (reduced) {
        setFlash(true);
        window.setTimeout(() => onOpen(), 220);
        return;
      }
      const tl = gsap.timeline({ onComplete: () => onOpen() });
      tl.to(pack.rotation, { z: 0.16, duration: 0.06, yoyo: true, repeat: 5, ease: "sine.inOut" })
        .to(rim.material, { emissiveIntensity: 1.4, duration: 0.3 }, 0)
        .to(pack.rotation, { y: pack.rotation.y + Math.PI * 3, duration: 0.7, ease: "power2.in" })
        .to(pack.scale, { x: 1.35, y: 1.35, z: 1.35, duration: 0.5, ease: "power2.in" }, "-=0.5")
        .add(() => setFlash(true), "-=0.18")
        .to(pack.scale, { x: 0.1, y: 0.1, z: 0.1, duration: 0.22, ease: "power2.out" }, "-=0.02")
        .to(brick.material as THREE.Material[], { opacity: 0, duration: 0.2 }, "<");
      (brick.material as THREE.Material[]).forEach((m) => (m.transparent = true));
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("pointermove", onPointer);
      renderer.dispose();
      geo.dispose();
      tex.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // onOpen is stable from the parent for the lifetime of a pack
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trigger = () => {
    if (busy || opening) return;
    openRef.current();
  };

  if (!webgl) {
    return (
      <button
        onClick={trigger}
        disabled={busy}
        className="pack-glow relative mx-auto flex aspect-[3/4.3] w-40 items-center justify-center rounded-xl bg-gradient-to-b from-[#fff2b8] via-[#e9c65a] to-[#7a5a12] font-mono text-xs font-bold uppercase tracking-widest text-[#1c1600]"
      >
        GOLAZO
      </button>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mountRef}
        onClick={trigger}
        role="button"
        tabIndex={0}
        aria-label="Open pack"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && trigger()}
        className="mx-auto h-72 w-full max-w-sm sm:h-80"
      />
      {flash && (
        <span className="rip-flash pointer-events-none absolute inset-0 z-10 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.95),rgba(175,255,0,0.5)_35%,transparent_70%)]" />
      )}
    </div>
  );
}

/** Draws the GOLAZO gold foil pack face onto a canvas → three texture. */
function makeFoilTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 720;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // gold gradient
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, "#fff4bf");
  g.addColorStop(0.35, "#e9c65a");
  g.addColorStop(0.7, "#c79a2f");
  g.addColorStop(1, "#7a5a12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // faint oversized chevrons / numerals watermark
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#3a2a05";
  ctx.font = "bold 220px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("26", W / 2, H * 0.42);
  ctx.strokeStyle = "#3a2a05";
  ctx.lineWidth = 22;
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 90, H * 0.62);
    ctx.lineTo(i * 90 + 70, H * 0.7);
    ctx.lineTo(i * 90, H * 0.78);
    ctx.stroke();
  }
  ctx.restore();

  // serrated top & bottom edges
  ctx.fillStyle = "#b9922e";
  const teeth = 26;
  const tw = W / teeth;
  for (const yTop of [true, false]) {
    ctx.beginPath();
    for (let i = 0; i <= teeth; i++) {
      const x = i * tw;
      const y = yTop ? (i % 2 ? 26 : 6) : H - (i % 2 ? 26 : 6);
      if (i === 0) ctx.moveTo(x, yTop ? 0 : H);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, yTop ? 0 : H);
    ctx.closePath();
    ctx.fill();
  }

  // centered white ring + monogram
  const cx = W / 2;
  const cy = H * 0.44;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 130px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("G", cx, cy + 4);

  // wordmark
  ctx.fillStyle = "#2a1e04";
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText("GOLAZO", cx, H * 0.66);
  ctx.font = "bold 22px monospace";
  ctx.fillStyle = "#5a4408";
  ctx.fillText("MATCHDAY PACK · 26", cx, H * 0.71);

  // top gloss band
  const gloss = ctx.createLinearGradient(0, 0, W, H * 0.4);
  gloss.addColorStop(0, "rgba(255,255,255,0.5)");
  gloss.addColorStop(0.25, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, W, H * 0.4);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
