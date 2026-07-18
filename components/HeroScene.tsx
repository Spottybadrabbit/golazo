"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The GOLAZO match ball: a chalk-line wireframe sphere with a volt core
 * and a confetti dust field. Responds to pointer (tilt) and scroll (spin).
 * Renders a single static frame under prefers-reduced-motion.
 */
export default function HeroScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.z = 7.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // chalk wireframe shell
    const shellGeo = new THREE.IcosahedronGeometry(2.5, 1);
    const shell = new THREE.LineSegments(
      new THREE.WireframeGeometry(shellGeo),
      new THREE.LineBasicMaterial({ color: 0xf7f7f4, transparent: true, opacity: 0.62 }),
    );
    group.add(shell);

    // inner volt core
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 2),
      new THREE.MeshBasicMaterial({ color: 0xafff00, transparent: true, opacity: 0.9 }),
    );
    group.add(core);

    const glow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, 2),
      new THREE.MeshBasicMaterial({ color: 0xafff00, transparent: true, opacity: 0.16 }),
    );
    group.add(glow);

    // orbit ring, tilted like a chalk center circle
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xf7f7f4, transparent: true, opacity: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);

    // confetti dust
    const dustCount = 260;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 3.1 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x00d4ff, size: 0.035, transparent: true, opacity: 0.55 }),
    );
    scene.add(dust);

    let targetX = 0;
    let targetY = 0;
    const onPointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      targetY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.7;
      targetX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.5;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let scrollSpin = 0;
    const onScroll = () => {
      scrollSpin = window.scrollY * 0.0012;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const clock = new THREE.Clock();
    const renderFrame = () => {
      const t = clock.getElapsedTime();
      group.rotation.y = t * 0.16 + scrollSpin;
      group.rotation.x += (targetX - group.rotation.x) * 0.05;
      group.rotation.z += (targetY * 0.4 - group.rotation.z) * 0.05;
      dust.rotation.y = -t * 0.03;
      const pulse = 1 + Math.sin(t * 2.1) * 0.045;
      core.scale.setScalar(pulse);
      glow.scale.setScalar(pulse * 1.03);
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
      shellGeo.dispose();
      dustGeo.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" aria-hidden="true" />;
}
