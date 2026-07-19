"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The hero mascot: Golo rendered in a Three.js scene as layered 2.5D parallax.
 * Volt glow, floating particles, contact shadow, and the mascot cutout each
 * sit at a different depth and move at a different rate on scroll and pointer,
 * so Golo drifts and tilts as you scroll the page. Static under reduced motion.
 *
 * A plain <Image> of Golo sits underneath as a guaranteed fallback: if WebGL is
 * unavailable or the texture never loads, the mascot is still visible. The
 * fallback fades out only once the 3D scene has actually painted the mascot.
 */
export default function HeroMascot() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable — the static fallback image stays visible
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 8;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ---- procedural textures ----
    const radial = (inner: string, outer: string) => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    // volt glow behind the mascot
    const glowTex = radial("rgba(175,255,0,0.55)", "rgba(175,255,0,0)");
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }),
    );
    glow.scale.set(7.5, 7.5, 1);
    glow.position.z = -2;
    scene.add(glow);

    // contact shadow
    const shadowTex = radial("rgba(0,0,0,0.5)", "rgba(0,0,0,0)");
    const shadow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.scale.set(4.2, 1.3, 1);
    shadow.position.set(0, -3, -0.5);
    scene.add(shadow);

    // floating particles (two depth bands)
    const makeDust = (count: number, color: number, spread: number, z: number, size: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
        pos[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      scene.add(pts);
      return { pts, geo };
    };
    const dustBack = makeDust(70, 0x00d4ff, 12, -1.5, 0.05);
    const dustFront = makeDust(50, 0xafff00, 10, 1.5, 0.06);

    // ---- mascot cutout plane ----
    const mascot = new THREE.Group();
    scene.add(mascot);
    const loader = new THREE.TextureLoader();
    loader.load(
      "/assets/golo-hero.png",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const img = tex.image as HTMLImageElement;
        const aspect = img.width / img.height;
        const h = 5.4;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(h * aspect, h),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: false }),
        );
        mascot.add(plane);
        setReady(true);
        if (reduced) renderFrame(); // static mode: paint the mascot once it's in
      },
      undefined,
      () => {
        // texture failed to load — leave the static <Image> fallback showing
      },
    );

    // ---- interaction state ----
    let pointerX = 0;
    let pointerY = 0;
    const onPointer = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let scrollP = 0;
    const onScroll = () => {
      scrollP = Math.min(1.6, window.scrollY / Math.max(1, window.innerHeight));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const s = Math.min(1, w / 460);
      scene.scale.setScalar(s);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const renderFrame = () => {
      const t = clock.getElapsedTime();
      // idle float + sway
      const bob = Math.sin(t * 1.2) * 0.16;
      const sway = Math.sin(t * 0.8) * 0.05;
      // scroll parallax: mascot drifts up and rotates, layers move at their own rate
      mascot.position.y = bob + scrollP * 3.4 + pointerY * 0.35;
      mascot.position.x = pointerX * 0.5;
      mascot.rotation.z = sway - pointerX * 0.06;
      mascot.rotation.y = pointerX * 0.14;
      mascot.rotation.x = pointerY * 0.06 + scrollP * 0.12;
      mascot.scale.setScalar(1 - scrollP * 0.12);

      glow.position.y = bob * 0.5 + scrollP * 2.2 + pointerY * 0.18;
      glow.position.x = pointerX * 0.3;
      const glowPulse = 7.5 + Math.sin(t * 1.6) * 0.35;
      glow.scale.set(glowPulse, glowPulse, 1);

      shadow.position.y = -3 + scrollP * 3.4;
      shadow.material.opacity = Math.max(0, 0.5 - scrollP * 0.4);

      dustBack.pts.rotation.z = t * 0.02 + pointerX * 0.05;
      dustBack.pts.position.y = scrollP * 1.2;
      dustFront.pts.rotation.z = -t * 0.03 - pointerX * 0.08;
      dustFront.pts.position.y = scrollP * -1.6;

      renderer.render(scene, camera);
    };

    if (reduced) {
      renderFrame();
    } else {
      const loop = () => {
        renderFrame();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      renderer.dispose();
      glowTex.dispose();
      shadowTex.dispose();
      dustBack.geo.dispose();
      dustFront.geo.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <Image
        src="/assets/golo-hero.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 90vw, 40vw"
        className={`pointer-events-none object-contain object-bottom transition-opacity duration-500 ${
          ready ? "opacity-0" : "opacity-100"
        }`}
      />
      <div ref={mountRef} className="relative h-full w-full" />
    </div>
  );
}
