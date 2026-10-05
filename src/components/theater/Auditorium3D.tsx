'use client';

// The projector beam in 3D: a soft cone of light from the booth to the screen, with dust drifting
// through it. Small on purpose: one cone (a custom shader for the soft falloff and flicker) and a
// few hundred points. Pixel ratio capped at 2; it stops drawing when off screen or in a hidden tab.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const coneVertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const coneFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // brighter toward the axis (facing the camera), fading along the throw
    float facing = pow(abs(dot(vNormal, vView)), 1.6);
    float along = clamp((vPos.y + uLength * 0.5) / uLength, 0.0, 1.0);
    float flicker = 0.92 + 0.08 * sin(uTime * 47.0) * sin(uTime * 13.0);
    float a = facing * (0.12 + 0.22 * along) * flicker;
    gl_FragColor = vec4(1.0, 0.86, 0.62, a);
  }
`;

export default function Auditorium3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);

    // the cone: apex at the booth (top, behind the viewer), opening onto the screen
    const length = 13;
    const geo = new THREE.CylinderGeometry(4.6, 0.05, length, 48, 1, true);
    const uniforms = { uTime: { value: 0 }, uLength: { value: length } };
    const cone = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: coneVertex,
        fragmentShader: coneFragment,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    cone.position.set(0, 3.2, 3.5);
    cone.rotation.x = -Math.PI / 2 + 0.38;
    scene.add(cone);

    // dust: points drifting in the beam's volume
    const N = 320;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffe2b0,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(dust);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true,
      raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      dust.rotation.y = t * 0.02;
      dust.position.y = Math.sin(t * 0.3) * 0.15;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && visible) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVis);
    canvas.style.opacity = '1';

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      geo.dispose();
      dustGeo.dispose();
      (cone.material as THREE.Material).dispose();
      (dust.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="beam" aria-hidden="true" />;
}
