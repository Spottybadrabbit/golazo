"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A 3D football for the Tomorrow screen: a glossy dark ball with glowing volt
 * panel-seams, floating with idle spin, pointer tilt, and scroll-driven
 * parallax. Renders a single static frame under prefers-reduced-motion.
 */
export default function FootballScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // glossy dark ball body
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 3),
      new THREE.MeshStandardMaterial({
        color: 0x121212,
        roughness: 0.34,
        metalness: 0.5,
        flatShading: true,
      }),
    );
    group.add(body);

    // glowing volt seams (paneled look)
    const seams = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.42, 1)),
      new THREE.LineBasicMaterial({ color: 0xafff00, transparent: true, opacity: 0.85 }),
    );
    group.add(seams);

    // soft volt glow shell
    const glow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.72, 2),
      new THREE.MeshBasicMaterial({ color: 0xafff00, transparent: true, opacity: 0.07 }),
    );
    group.add(glow);

    // orbit ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.011, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 }),
    );
    ring.rotation.x = Math.PI / 2.3;
    scene.add(ring);

    // lights
    scene.add(new THREE.AmbientLight(0x404040, 1.4));
    const volt = new THREE.PointLight(0xafff00, 90, 40);
    volt.position.set(-4, 3, 5);
    scene.add(volt);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(5, 2, 2);
    scene.add(rim);

    // dust field
    const dustCount = 200;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 3.4 + Math.random() * 3;
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
      new THREE.PointsMaterial({ color: 0xafff00, size: 0.03, transparent: true, opacity: 0.5 }),
    );
    scene.add(dust);

    let targetX = 0;
    let targetY = 0;
    const onPointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      targetY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.8;
      targetX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.5;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let scrollSpin = 0;
    const onScroll = () => {
      scrollSpin = window.scrollY * 0.0016;
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
      group.rotation.y = t * 0.35 + scrollSpin;
      group.rotation.x += (targetX - group.rotation.x) * 0.05;
      group.rotation.z += (targetY * 0.3 - group.rotation.z) * 0.05;
      group.position.y = Math.sin(t * 1.1) * 0.14;
      ring.rotation.z = t * 0.12;
      dust.rotation.y = -t * 0.04;
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
      dustGeo.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" aria-hidden="true" />;
}
