"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial, Float, MeshDistortMaterial } from "@react-three/drei";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import * as THREE from "three";

// ============================================
// THREE.JS COMPONENTS
// ============================================

function ParticleField({ count = 3000 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2 + Math.random() * 3;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = state.clock.elapsedTime * 0.02;
      ref.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#00d4ff"
        size={0.015}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function CentralCore() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <MeshDistortMaterial
          color="#00d4ff"
          emissive="#00d4ff"
          emissiveIntensity={0.4}
          roughness={0.2}
          metalness={0.8}
          distort={0.3}
          speed={2}
          transparent
          opacity={0.8}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshBasicMaterial color="#00d4ff" wireframe transparent opacity={0.1} />
      </mesh>
    </Float>
  );
}

function OrbitingNodes() {
  const groupRef = useRef<THREE.Group>(null);
  const nodeCount = 6;

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => {
        const angle = (i / nodeCount) * Math.PI * 2;
        const radius = 2.5;
        return (
          <group key={i} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}>
            <mesh>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.9} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshBasicMaterial color="#00d4ff" transparent opacity={0.2} />
            </mesh>
            {/* Connection line to center */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={2}
                  array={new Float32Array([0, 0, 0, -Math.cos(angle) * radius, -Math.sin(angle) * radius, 0])}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#00d4ff" transparent opacity={0.15} />
            </line>
          </group>
        );
      })}
    </group>
  );
}

function DataStreams() {
  const particles = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const velocities: number[] = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.5;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      velocities.push(0.02 + Math.random() * 0.03);
    }

    return { positions, velocities };
  }, []);

  const ref = useRef<THREE.Points>(null);

  useFrame(() => {
    if (ref.current) {
      const positions = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const currentRadius = Math.sqrt(x * x + y * y);
        const newRadius = currentRadius - particles.velocities[i];

        if (newRadius < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          positions[i * 3] = Math.cos(angle) * 2.5;
          positions[i * 3 + 1] = Math.sin(angle) * 2.5;
        } else {
          const angle = Math.atan2(y, x);
          positions[i * 3] = Math.cos(angle) * newRadius;
          positions[i * 3 + 1] = Math.sin(angle) * newRadius;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={ref} positions={particles.positions} stride={3}>
      <PointMaterial
        transparent
        color="#00ffaa"
        size={0.03}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#00d4ff" />
      <ParticleField />
      <CentralCore />
      <OrbitingNodes />
      <DataStreams />
    </>
  );
}

// ============================================
// ANIMATION VARIANTS
// ============================================

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0 },
};

const fadeInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
};

// ============================================
// UI COMPONENTS
// ============================================

function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <motion.div
          className="flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#0099b8] flex items-center justify-center">
            <span className="text-black font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-xl tracking-tight">Astraeus</span>
        </motion.div>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "How It Works", "Docs", "GitHub"].map((item, i) => (
            <motion.a
              key={item}
              href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors relative group"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-[#00d4ff] group-hover:w-full transition-all duration-300" />
            </motion.a>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-5 py-2 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-medium hover:bg-[#00d4ff]/20 transition-colors"
        >
          Launch App
        </motion.button>
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Three.js Canvas */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 6], fov: 60 }}>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#030308]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#030308_70%)]" />

      {/* Content */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 max-w-5xl mx-auto px-6 text-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-pulse" />
            Built on Stellar
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
        >
          <span className="gradient-text">Proof of Money</span>
          <br />
          <span className="text-white/90">Settlement Layer</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Parallel financial execution anchored to Stellar. Where computation occurs in
          isolated subnets while money safety is enforced by liquidity constraints.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(0, 212, 255, 0.4)" }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 rounded-full bg-[#00d4ff] text-black font-semibold text-lg glow transition-all"
          >
            Get Started
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 rounded-full border border-white/20 text-white font-medium text-lg hover:border-white/40 hover:bg-white/5 transition-all"
          >
            Read Whitepaper
          </motion.button>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2"
          >
            <motion.div className="w-1 h-2 rounded-full bg-[#00d4ff]" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function PhilosophySection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 px-6 relative">
      <div className="absolute inset-0 grid-bg opacity-50" />

      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-4xl mx-auto text-center relative"
      >
        <motion.div variants={fadeInUp} className="mb-8">
          <span className="text-[#00d4ff] font-mono text-sm tracking-widest uppercase">
            Core Philosophy
          </span>
        </motion.div>

        <motion.blockquote
          variants={fadeInUp}
          className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-8"
        >
          <span className="text-zinc-500">&ldquo;</span>
          Execution may be wrong.
          <br />
          <span className="gradient-text">Money must never be.</span>
          <span className="text-zinc-500">&rdquo;</span>
        </motion.blockquote>

        <motion.p
          variants={fadeInUp}
          className="text-zinc-400 text-lg max-w-2xl mx-auto"
        >
          Astraeus replaces complex execution proofs with a simpler, stronger invariant:
          no execution may settle unless it is provably payable by real on-chain funds.
        </motion.p>
      </motion.div>
    </section>
  );
}

function FeaturesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const features = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
      title: "Parallel Execution",
      description: "Run complex financial logic in isolated on-chain subnets with private internal state and deterministic commitments.",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: "Proof of Money",
      description: "Liquidity-based settlement constraints ensure execution is always payable, independent of execution correctness.",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ),
      title: "Structural Privacy",
      description: "Internal balances never touch L1. Privacy achieved structurally, not cryptographically. Only net flows revealed.",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: "Absolute Safety",
      description: "No attack path to insolvency. Malicious execution cannot mint funds. Bugs reduce liveness, not safety.",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Stellar Settlement",
      description: "Leverages Stellar&apos;s SCP consensus for final settlement with multisig vault protection and atomic transactions.",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      title: "No Heavy Crypto",
      description: "No ZK-proofs, no fraud proofs, no complex cryptography. Just SHA-256 hashes and liquidity mathematics.",
    },
  ];

  return (
    <section id="features" ref={ref} className="py-32 px-6 relative">
      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-7xl mx-auto"
      >
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="text-[#00d4ff] font-mono text-sm tracking-widest uppercase">
            Features
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mt-4">
            Built for Financial Truth
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              variants={fadeInUp}
              custom={i}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="group p-8 rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] hover:border-[#00d4ff]/30 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-xl bg-[#00d4ff]/10 flex items-center justify-center text-[#00d4ff] mb-6 group-hover:glow transition-all">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3 group-hover:text-[#00d4ff] transition-colors">
                {feature.title}
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function HowItWorksSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const steps = [
    {
      number: "01",
      title: "Execute in Subnets",
      description: "Financial logic runs in isolated parallel subnets. Internal balances and state remain private. Only withdrawal queues are produced.",
    },
    {
      number: "02",
      title: "Generate State Root",
      description: "Each epoch produces a deterministic state root: R = H(B, W, n). This binds withdrawals to specific execution snapshots.",
    },
    {
      number: "03",
      title: "Verify Proof of Money",
      description: "For each asset, verify that total withdrawals ≤ vault balance. This is the only constraint required for settlement safety.",
    },
    {
      number: "04",
      title: "Settle on Stellar",
      description: "Multisig signers authorize atomic transactions. Settlement includes replay protection via memo encoding. Finality via SCP.",
    },
  ];

  return (
    <section id="how-it-works" ref={ref} className="py-32 px-6 relative overflow-hidden">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00d4ff]/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-6xl mx-auto relative"
      >
        <motion.div variants={fadeInUp} className="text-center mb-20">
          <span className="text-[#00d4ff] font-mono text-sm tracking-widest uppercase">
            How It Works
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mt-4">
            From Execution to Settlement
          </h2>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="absolute left-[39px] top-0 bottom-0 w-px bg-gradient-to-b from-[#00d4ff]/50 via-[#00d4ff]/20 to-transparent hidden md:block" />

          <div className="space-y-12">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                variants={fadeInLeft}
                custom={i}
                className="flex gap-8 items-start group"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="relative z-10 w-20 h-20 rounded-2xl bg-[#0f0f1a] border border-[#00d4ff]/30 flex items-center justify-center shrink-0 group-hover:border-[#00d4ff] group-hover:glow transition-all"
                >
                  <span className="text-[#00d4ff] font-mono font-bold text-xl">{step.number}</span>
                </motion.div>
                <div className="pt-2">
                  <h3 className="text-2xl font-semibold mb-3 group-hover:text-[#00d4ff] transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function ComparisonSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const comparisons = [
    { property: "Proves Execution", rollups: "Yes", astraeus: "No" },
    { property: "Proves Solvency", rollups: "Indirect", astraeus: "Direct" },
    { property: "Cryptographic Complexity", rollups: "High", astraeus: "Low" },
    { property: "Failure Mode", rollups: "Funds Frozen", astraeus: "Funds Safe" },
    { property: "Suitable for Finance", rollups: "Mixed", astraeus: "Native" },
  ];

  return (
    <section ref={ref} className="py-32 px-6 relative">
      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-4xl mx-auto"
      >
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="text-[#00d4ff] font-mono text-sm tracking-widest uppercase">
            Comparison
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mt-4">
            Astraeus vs Rollups
          </h2>
          <p className="text-zinc-400 mt-4 max-w-xl mx-auto">
            Optimized for financial truth, not computational truth.
          </p>
        </motion.div>

        <motion.div
          variants={scaleIn}
          className="rounded-2xl border border-white/[0.06] overflow-hidden"
        >
          <div className="grid grid-cols-3 bg-white/[0.02]">
            <div className="p-6 border-b border-r border-white/[0.06]">
              <span className="text-zinc-500 text-sm font-medium">Property</span>
            </div>
            <div className="p-6 border-b border-r border-white/[0.06] text-center">
              <span className="text-zinc-400 font-medium">Rollups</span>
            </div>
            <div className="p-6 border-b border-white/[0.06] text-center">
              <span className="text-[#00d4ff] font-semibold">Astraeus</span>
            </div>
          </div>

          {comparisons.map((row, i) => (
            <motion.div
              key={row.property}
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.1 * i }}
              className="grid grid-cols-3 group hover:bg-white/[0.02] transition-colors"
            >
              <div className="p-6 border-b border-r border-white/[0.06]">
                <span className="font-medium">{row.property}</span>
              </div>
              <div className="p-6 border-b border-r border-white/[0.06] text-center">
                <span className="text-zinc-500">{row.rollups}</span>
              </div>
              <div className="p-6 border-b border-white/[0.06] text-center">
                <span className="text-[#00d4ff] font-medium">{row.astraeus}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08)_0%,transparent_70%)]" />

      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-4xl mx-auto text-center relative"
      >
        <motion.h2
          variants={fadeInUp}
          className="text-4xl md:text-6xl font-bold mb-6"
        >
          Ready to Build on
          <br />
          <span className="gradient-text">Proof of Money?</span>
        </motion.h2>

        <motion.p
          variants={fadeInUp}
          className="text-xl text-zinc-400 mb-10 max-w-xl mx-auto"
        >
          Join the next generation of financial infrastructure.
          Parallel execution, absolute safety, Stellar settlement.
        </motion.p>

        <motion.div
          variants={fadeInUp}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: "0 0 60px rgba(0, 212, 255, 0.5)" }}
            whileTap={{ scale: 0.95 }}
            className="px-10 py-5 rounded-full bg-[#00d4ff] text-black font-semibold text-lg glow-intense transition-all"
          >
            Start Building
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-10 py-5 rounded-full border border-white/20 text-white font-medium text-lg hover:border-[#00d4ff]/50 hover:bg-[#00d4ff]/5 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </motion.button>
        </motion.div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00d4ff] to-[#0099b8] flex items-center justify-center">
            <span className="text-black font-bold text-xs">A</span>
          </div>
          <span className="font-medium text-zinc-400">Astraeus</span>
        </div>

        <div className="flex items-center gap-6">
          {["Docs", "GitHub", "Discord", "Twitter"].map((link) => (
            <motion.a
              key={link}
              href="#"
              whileHover={{ color: "#00d4ff" }}
              className="text-sm text-zinc-500 hover:text-[#00d4ff] transition-colors"
            >
              {link}
            </motion.a>
          ))}
        </div>

        <p className="text-sm text-zinc-600 font-mono">
          Built on Stellar
        </p>
      </div>
    </footer>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#030308] noise-overlay">
      <Navbar />
      <HeroSection />
      <PhilosophySection />
      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <CTASection />
      <Footer />
    </div>
  );
}
