"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import * as THREE from "three";

// ============================================
// THREE.JS - PARALLEL CHAINS VISUALIZATION
// ============================================

function ParallelChains() {
  const groupRef = useRef<THREE.Group>(null);
  const chainCount = 5;
  const nodeRefs = useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.1) * 0.05;
    }
    // Animate individual nodes with wave motion
    nodeRefs.current.forEach((node, i) => {
      if (node) {
        const row = Math.floor(i / 8);
        const col = i % 8;
        node.position.y = Math.sin(t * 1.5 + col * 0.3 + row * 0.5) * 0.08;
        const scale = 1 + Math.sin(t * 2 + i * 0.2) * 0.1;
        node.scale.setScalar(scale);
      }
    });
  });

  const chains = useMemo(() => {
    const result = [];
    for (let chain = 0; chain < chainCount; chain++) {
      const yPos = (chain - (chainCount - 1) / 2) * 0.6;
      const nodes = [];
      const nodeCount = 8;
      for (let n = 0; n < nodeCount; n++) {
        const xPos = (n - (nodeCount - 1) / 2) * 0.7;
        nodes.push({ x: xPos, y: yPos, z: 0 });
      }
      result.push({ nodes, y: yPos });
    }
    return result;
  }, []);

  let nodeIndex = 0;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {chains.map((chain, chainIdx) => (
        <group key={chainIdx}>
          {/* Chain line */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-3, chain.y, 0, 3, chain.y, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color={chainIdx === 2 ? "#0055ff" : "#000000"}
              transparent
              opacity={chainIdx === 2 ? 0.4 : 0.08}
            />
          </line>
          {/* Nodes on chain */}
          {chain.nodes.map((node, nodeIdx) => {
            const idx = nodeIndex++;
            const isCenter = chainIdx === 2;
            return (
              <mesh
                key={nodeIdx}
                ref={(el) => { if (el) nodeRefs.current[idx] = el; }}
                position={[node.x, node.y, node.z]}
              >
                <circleGeometry args={[isCenter ? 0.06 : 0.04, 16]} />
                <meshBasicMaterial
                  color={isCenter ? "#0055ff" : "#000000"}
                  transparent
                  opacity={isCenter ? 0.9 : 0.15}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function FlowingData() {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 60;

  const { positions, velocities, lanes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel: number[] = [];
    const lns: number[] = [];

    for (let i = 0; i < count; i++) {
      const lane = Math.floor(Math.random() * 5);
      const yPos = (lane - 2) * 0.6;
      pos[i * 3] = -4 + Math.random() * 8;
      pos[i * 3 + 1] = yPos;
      pos[i * 3 + 2] = 0;
      vel.push(0.02 + Math.random() * 0.03);
      lns.push(lane);
    }

    return { positions: pos, velocities: vel, lanes: lns };
  }, []);

  useFrame(() => {
    if (!particlesRef.current) return;
    const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      pos[i * 3] += velocities[i];
      if (pos[i * 3] > 4) {
        pos[i * 3] = -4;
      }
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#0055ff"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

function ConvergencePoint() {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.rotation.z = t * 0.5;
      meshRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = -t * 0.3;
      ringRef.current.scale.setScalar(1 + Math.sin(t * 2 + 1) * 0.08);
    }
  });

  return (
    <group position={[3.5, 0, 0]}>
      <mesh ref={meshRef}>
        <ringGeometry args={[0.15, 0.22, 6]} />
        <meshBasicMaterial color="#0055ff" />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.3, 0.32, 32]} />
        <meshBasicMaterial color="#0055ff" transparent opacity={0.3} />
      </mesh>
      {/* Label: Stellar */}
      <mesh position={[0, -0.5, 0]}>
        <planeGeometry args={[0.8, 0.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function SourcePoint() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.rotation.z = t * 0.3;
    }
  });

  return (
    <group position={[-3.5, 0, 0]}>
      <mesh ref={meshRef}>
        <ringGeometry args={[0.12, 0.18, 4]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.6} />
      </mesh>
      <mesh>
        <ringGeometry args={[0.25, 0.27, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ParallelChains />
      <FlowingData />
      <SourcePoint />
      <ConvergencePoint />
    </>
  );
}

// ============================================
// ANIMATION VARIANTS
// ============================================

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

// ============================================
// COMPONENTS
// ============================================

function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 px-8 py-5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white font-bold text-base font-mono">m</span>
          </div>
          <span className="font-semibold text-xl tracking-tight">TVA Protocol</span>
        </div>

        <div className="hidden md:flex items-center gap-10">
          {["How it works", "Developers", "Docs"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
              className="text-[15px] text-[#3d3d3d] hover:text-black transition-colors font-medium"
            >
              {item}
            </a>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-5 py-2.5 text-[15px] font-semibold bg-black text-white rounded-lg"
        >
          Get Started
        </motion.button>
      </div>
    </motion.nav>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section className="relative min-h-screen overflow-hidden bg-white">
      {/* Subtle grid */}
      <div className="absolute inset-0 grid-bg opacity-40" />

      {/* Top section - Text */}
      <motion.div style={{ opacity }} className="relative z-10 pt-32 pb-16 px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-black/10 text-sm font-medium font-mono text-black/60">
              <span className="w-2 h-2 rounded-full bg-[#0055ff]" />
              Parallel EVM execution on Stellar
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-[3.5rem] md:text-[5.5rem] lg:text-[7rem] font-extrabold leading-[0.92] tracking-[-0.04em] mb-8 max-w-5xl"
          >
            One chain to write.
            <br />
            <span className="text-gradient">Another to settle.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-[#3d3d3d] max-w-2xl leading-relaxed font-normal mb-10"
          >
            Write Solidity like you always have. TVA Protocol compiles it to Stellar&apos;s
            Soroban—parallel execution with 5-second deterministic finality.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-start gap-4"
          >
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 bg-black text-white rounded-xl font-semibold text-lg"
            >
              Start Building
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 border-2 border-black/15 rounded-xl font-semibold text-lg hover:border-black/30 transition-colors"
            >
              Read the Docs
            </motion.button>
          </motion.div>
        </div>
      </motion.div>

      {/* Middle section - Visualization */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="relative z-10 px-8 py-12"
      >
        <div className="max-w-6xl mx-auto">
          <div className="relative h-[280px] md:h-[320px] rounded-2xl border border-black/5 bg-[#fafafa] overflow-hidden">
            {/* Labels */}
            <div className="absolute top-6 left-8 z-20">
              <div className="flex items-center gap-2 text-sm font-mono text-black/40">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1.5l-9 5.25v10.5l9 5.25 9-5.25V6.75L12 1.5zm0 2.25l6.75 3.9375L12 11.625 5.25 7.6875 12 3.75zm-7.5 5.4375l6.75 3.9375v7.875l-6.75-3.9375V9.1875zm15 0v7.875l-6.75 3.9375v-7.875l6.75-3.9375z" />
                </svg>
                <span>Solidity</span>
              </div>
            </div>
            <div className="absolute top-6 right-8 z-20">
              <div className="flex items-center gap-2 text-sm font-mono text-[#0055ff]">
                <span>Stellar</span>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14l2.83 2.83m4.48 4.48l2.83 2.83" />
                </svg>
              </div>
            </div>

            {/* Arrow in middle */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
              <div className="flex items-center gap-3 text-sm font-mono text-black/30">
                <span>compile</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span>settle</span>
              </div>
            </div>

            {/* Three.js Canvas */}
            <Canvas camera={{ position: [0, 0, 5], fov: 50 }} className="!absolute inset-0">
              <Suspense fallback={null}>
                <Scene />
              </Suspense>
            </Canvas>
          </div>

          {/* Caption below visualization */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-sm text-[#999] mt-4 font-mono"
          >
            Parallel execution lanes → Single settlement point
          </motion.p>
        </div>
      </motion.div>

      {/* Bottom section - Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="relative z-10 px-8 py-16"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16">
            {[
              { value: "5s", label: "Finality", sub: "Deterministic via SCP" },
              { value: "$0.00001", label: "Per Transaction", sub: "Not per gas unit" },
              { value: "Zero", label: "MEV", sub: "No mempool ordering" },
              { value: "Native", label: "Multi-asset", sub: "XLM, USDC, built-in DEX" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                className="text-left"
              >
                <div className="text-3xl md:text-4xl font-bold font-mono tracking-tight text-black mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-black font-semibold uppercase tracking-wide">
                  {stat.label}
                </div>
                <div className="text-sm text-[#999] mt-1">
                  {stat.sub}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-10 rounded-full border-2 border-black/15 flex justify-center pt-2"
        >
          <div className="w-1.5 h-2 rounded-full bg-black/30" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function Philosophy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 px-8 bg-black text-white">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          className="mb-20"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-4xl leading-[1.1]">
            The Ethereum developer experience.
            <br />
            <span className="text-[#0055ff]">Stellar&apos;s settlement guarantees.</span>
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid md:grid-cols-3 gap-12 md:gap-8"
        >
          {[
            {
              num: "01",
              title: "Compile, don't interpret",
              desc: "Solidity → Soroban WASM via Solang. No EVM runtime overhead. Your contracts run as native WebAssembly.",
            },
            {
              num: "02",
              title: "Translate, don't bridge",
              desc: "Ethereum transactions map to Stellar transactions. No lock-and-mint. No bridge exploits. Just address translation.",
            },
            {
              num: "03",
              title: "Settle, don't sequence",
              desc: "Every transaction settles on Stellar via SCP. 5-second deterministic finality. No challenge periods.",
            },
          ].map((p, i) => (
            <motion.div
              key={p.num}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="border-t border-white/10 pt-8"
            >
              <span className="text-sm font-mono text-[#0055ff] mb-4 block">{p.num}</span>
              <h3 className="text-2xl font-bold mb-4 tracking-tight">{p.title}</h3>
              <p className="text-white/60 leading-relaxed text-[17px]">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const steps = [
    {
      num: "01",
      title: "Write Solidity",
      desc: "Use your existing Ethereum toolchain. Hardhat, Foundry, ethers.js, viem—your workflow stays exactly the same.",
      code: `// Standard Solidity - nothing special
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

    function increment() public {
        count += 1;
    }
}`,
    },
    {
      num: "02",
      title: "Compile to WASM",
      desc: "Solang compiles your Solidity directly to Soroban-compatible WebAssembly. No bytecode interpretation. Native speed.",
      code: `$ TVA Protocol compile Counter.sol

Compiling Counter.sol...
  ✓ Parsed source
  ✓ Type checked
  ✓ Generated Soroban WASM

Output:
  → Counter.wasm    4.2 KB
  → Counter.json    ABI`,
    },
    {
      num: "03",
      title: "Deploy & Settle",
      desc: "Deploy to Stellar. 5-second deterministic finality via SCP consensus. No challenge periods, no rollbacks possible.",
      code: `$ TVA Protocol deploy Counter --network stellar

Deploying to Stellar...
  Contract: CDLZ...K4WE
  Tx Hash:  5a3f...c912

  ✓ Settled in 5.1s
  ✓ Fee: 0.00001 XLM
  ✓ Finality: Deterministic`,
    },
  ];

  return (
    <section id="how-it-works" ref={ref} className="py-32 px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          className="mb-20 max-w-3xl"
        >
          <span className="text-sm font-mono text-[#0055ff] uppercase tracking-wider mb-4 block">
            How it works
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
            From Solidity to Stellar
            <br />
            <span className="text-[#999]">in three commands.</span>
          </h2>
        </motion.div>

        <div className="space-y-24">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial="hidden"
              animate={isInView ? "visible" : "hidden"}
              variants={fadeUp}
              transition={{ delay: 0.15 + i * 0.1 }}
              className={`grid md:grid-cols-2 gap-12 items-start ${i % 2 === 1 ? "" : ""}`}
            >
              <div className={`${i % 2 === 1 ? "md:order-2" : ""}`}>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-12 h-12 rounded-xl bg-black flex items-center justify-center text-white font-bold text-lg font-mono">
                    {step.num}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight">{step.title}</h3>
                </div>
                <p className="text-[#3d3d3d] text-lg leading-relaxed">
                  {step.desc}
                </p>
              </div>
              <div className={`${i % 2 === 1 ? "md:order-1" : ""}`}>
                <div className="code-block">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <pre className="text-sm font-mono overflow-x-auto leading-relaxed">
                    <code className="text-[#999]">{step.code}</code>
                  </pre>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const data = [
    { prop: "Finality", eth: "~12 min", l2: "7 days*", "TVA Protocol": "5 seconds" },
    { prop: "Transaction Fee", eth: "$0.50–50", l2: "$0.01–0.10", "TVA Protocol": "~$0.00001" },
    { prop: "MEV Exposure", eth: "High", l2: "Medium", "TVA Protocol": "None" },
    { prop: "Execution", eth: "EVM bytecode", l2: "EVM bytecode", "TVA Protocol": "Native WASM" },
    { prop: "Bridge Risk", eth: "N/A", l2: "Required", "TVA Protocol": "None" },
    { prop: "Asset Support", eth: "ETH + ERC20", l2: "ETH + ERC20", "TVA Protocol": "Multi-asset native" },
  ];

  return (
    <section ref={ref} className="py-32 px-8 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          className="mb-16 max-w-3xl"
        >
          <span className="text-sm font-mono text-[#0055ff] uppercase tracking-wider mb-4 block">
            Comparison
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Not an L2.
            <br />
            <span className="text-[#999]">A different chain entirely.</span>
          </h2>
          <p className="text-xl text-[#3d3d3d]">
            L2s settle back to Ethereum. TVA Protocol settles on Stellar—a fundamentally different architecture with different tradeoffs.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          transition={{ delay: 0.15 }}
          className="border border-black/8 rounded-2xl overflow-hidden bg-white"
        >
          <div className="grid grid-cols-4 border-b border-black/8">
            <div className="p-5 md:p-6 font-medium text-[#999] text-xs md:text-sm uppercase tracking-wider">
              Property
            </div>
            <div className="p-5 md:p-6 font-medium text-[#999] text-xs md:text-sm uppercase tracking-wider text-center">
              Ethereum L1
            </div>
            <div className="p-5 md:p-6 font-medium text-[#999] text-xs md:text-sm uppercase tracking-wider text-center">
              Rollup L2s
            </div>
            <div className="p-5 md:p-6 font-bold text-[#0055ff] text-xs md:text-sm uppercase tracking-wider text-center bg-[#0055ff]/5">
              TVA Protocol
            </div>
          </div>

          {data.map((row, i) => (
            <motion.div
              key={row.prop}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="grid grid-cols-4 border-b border-black/5 last:border-0"
            >
              <div className="p-5 md:p-6 font-semibold text-sm md:text-[15px]">{row.prop}</div>
              <div className="p-5 md:p-6 text-[#666] text-center text-sm md:text-[15px]">{row.eth}</div>
              <div className="p-5 md:p-6 text-[#666] text-center text-sm md:text-[15px]">{row.l2}</div>
              <div className="p-5 md:p-6 text-black font-semibold text-center text-sm md:text-[15px] bg-[#0055ff]/5">{row["TVA Protocol"]}</div>
            </motion.div>
          ))}
        </motion.div>

        <p className="text-sm text-[#999] mt-4 font-mono">
          * L2 finality includes 7-day challenge period for optimistic rollups
        </p>
      </div>
    </section>
  );
}

function Developers() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const tools = [
    { name: "Hardhat", note: "Full plugin support" },
    { name: "Foundry", note: "forge create & test" },
    { name: "MetaMask", note: "Custom network config" },
    { name: "ethers.js", note: "Standard provider" },
    { name: "Viem", note: "TypeScript native" },
    { name: "OpenZeppelin", note: "Contracts work unmodified" },
  ];

  return (
    <section id="developers" ref={ref} className="py-40 px-8 bg-[#fafafa]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          className="mb-16"
        >
          <h2 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
            Your stack.
            <br />
            <span className="text-[#6b6b6b]">Unchanged.</span>
          </h2>
          <p className="text-xl text-[#3d3d3d] max-w-xl">
            Everything you know works. We abstract the complexity.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-16"
        >
          {tools.map((tool) => (
            <motion.div
              key={tool.name}
              variants={fadeUp}
              whileHover={{ y: -3 }}
              className="p-6 bg-white border border-black/8 rounded-xl"
            >
              <div className="font-bold text-lg mb-1">{tool.name}</div>
              <div className="text-[#6b6b6b] text-sm">{tool.note}</div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={fadeUp}
          transition={{ delay: 0.3 }}
        >
          <div className="code-block">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="font-mono text-xs text-[#666]">hardhat.config.js</span>
            </div>
            <pre className="text-sm font-mono leading-relaxed">
              <code>
                <span className="text-[#c792ea]">require</span>
                <span className="text-[#89ddff]">(</span>
                <span className="text-[#c3e88d]">&quot;@TVA Protocol/hardhat-plugin&quot;</span>
                <span className="text-[#89ddff]">);</span>
                {"\n\n"}
                <span className="text-[#82aaff]">module</span>
                <span className="text-[#89ddff]">.</span>
                <span className="text-[#82aaff]">exports</span>
                <span className="text-[#89ddff]"> = {"{"}</span>
                {"\n"}
                <span className="text-[#f78c6c]">  networks</span>
                <span className="text-[#89ddff]">: {"{"}</span>
                {"\n"}
                <span className="text-[#f78c6c]">    TVA Protocol</span>
                <span className="text-[#89ddff]">: {"{"}</span>
                {"\n"}
                <span className="text-[#f78c6c]">      url</span>
                <span className="text-[#89ddff]">: </span>
                <span className="text-[#c3e88d]">&quot;https://rpc.TVA Protocol.dev&quot;</span>
                <span className="text-[#89ddff]">,</span>
                {"\n"}
                <span className="text-[#f78c6c]">      chainId</span>
                <span className="text-[#89ddff]">: </span>
                <span className="text-[#f78c6c]">0x4d524b4c</span>
                {"\n"}
                <span className="text-[#89ddff]">    {"}"}</span>
                {"\n"}
                <span className="text-[#89ddff]">  {"}"}</span>
                {"\n"}
                <span className="text-[#89ddff]">{"}"};</span>
              </code>
            </pre>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 px-8 bg-black text-white">
      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={fadeUp}
        className="max-w-7xl mx-auto"
      >
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-[1.1]">
              Write once.
              <br />
              <span className="text-[#0055ff]">Settle fast.</span>
            </h2>
            <p className="text-xl text-white/60 mb-10 max-w-md">
              Your existing Solidity skills. Stellar&apos;s 5-second settlement.
              No new language to learn.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 bg-[#0055ff] text-white rounded-xl font-bold text-lg"
              >
                Start Building
              </motion.button>
              <motion.a
                href="#"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 border border-white/20 rounded-xl font-semibold text-lg flex items-center gap-3 hover:border-white/40 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </motion.a>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="code-block !bg-white/5 !border-white/10">
              <pre className="text-sm font-mono leading-relaxed">
                <code>
                  <span className="text-white/40"># Install TVA Protocol CLI</span>
                  {"\n"}
                  <span className="text-[#0055ff]">$</span> <span className="text-white/80">npm install -g @TVA Protocol/cli</span>
                  {"\n\n"}
                  <span className="text-white/40"># Compile your Solidity</span>
                  {"\n"}
                  <span className="text-[#0055ff]">$</span> <span className="text-white/80">TVA Protocol compile contracts/</span>
                  {"\n\n"}
                  <span className="text-white/40"># Deploy to Stellar</span>
                  {"\n"}
                  <span className="text-[#0055ff]">$</span> <span className="text-white/80">TVA Protocol deploy --network stellar</span>
                  {"\n\n"}
                  <span className="text-white/40"># That&apos;s it. You&apos;re live.</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-8 border-t border-black/8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white font-bold text-sm font-mono">m</span>
            </div>
            <span className="font-semibold text-black">TVA Protocol</span>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            {[
              { label: "Documentation", href: "#" },
              { label: "GitHub", href: "#" },
              { label: "Discord", href: "#" },
              { label: "Twitter", href: "#" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[15px] text-[#666] hover:text-black transition-colors font-medium"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-black/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-sm text-[#999]">
            Compile Solidity. Settle on Stellar.
          </p>
          <p className="text-sm text-[#999] font-mono">
            Built for parallel execution
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============================================
// MAIN
// ============================================

export default function Home() {
  return (
    <div className="relative min-h-screen bg-white noise">
      <Navbar />
      <Hero />
      <Philosophy />
      <HowItWorks />
      <Comparison />
      <Developers />
      <CTA />
      <Footer />
    </div>
  );
}
