import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Video,
  Play,
  Pause,
  RotateCcw,
  Camera,
  Maximize,
  Minimize,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Gauge,
  Zap,
  Flame,
  Layers,
  Eye,
  X,
  Sliders,
  Box,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Compass,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMachines, useSummary, useProductionTokens } from '../hooks/usePolling';
import { api } from '../services/api';
import type { MachineTelemetry, MachineStatus, ScenarioRunResult } from '../types';
import { Link } from 'react-router-dom';
import {
  INDUSTRIAL_PALETTE,
  createFactoryMaterials,
  buildFactoryEnvironment,
  buildContinuousConveyor,
  buildParallelConveyorBranch,
  buildStampingPress,
  buildCncMill,
  buildWeldingRobot,
  buildInspectionTunnel,
  buildPackagingGantry,
  type BuiltMachineNodes,
  type FactoryMaterials,
} from './factory3dModels';
import { PartsFlowManager } from './factory3dFlow';
import './FactoryFloor3DPage.css';

// -----------------------------------------------------------------------------
// Machine Layout Positions & Camera Anchors
// -----------------------------------------------------------------------------
interface StationMeta {
  id: string;
  name: string;
  role: string;
  xPos: number;
  zPos?: number;
  camPos: [number, number, number];
  lookAt: [number, number, number];
  description: string;
}

const BASE_STATION_METAS: StationMeta[] = [
  {
    id: 'STAMPING-01',
    name: 'Stamping Press',
    role: 'Blank Forming',
    xPos: -20,
    zPos: 0,
    camPos: [-20, 6.5, 12],
    lookAt: [-20, 2.5, 0],
    description: '1200-ton hydraulic blank stamping press with 4 precision guide columns, cast crown, dual rams, bolsters, and safety light curtains.',
  },
  {
    id: 'CNC-01',
    name: '5-Axis CNC Mill #1',
    role: 'Precision Milling',
    xPos: -10,
    zPos: 0,
    camPos: [-10, 5.8, 11],
    lookAt: [-10, 2.2, 0],
    description: 'High-speed vertical CNC machining center with chamfered sheet-metal enclosure, angled viewing window, tool carousel, and chip conveyor.',
  },
  {
    id: 'WELDING-01',
    name: 'Robotic Weld Cell',
    role: 'Structural Joining',
    xPos: 0,
    zPos: 0,
    camPos: [0, 5.8, 11],
    lookAt: [0, 2.2, 0],
    description: '6-axis articulated industrial robotic welding cell with counterbalance cylinder, cable dress pack, rotary positioner fixture, and arc shield.',
  },
  {
    id: 'INSPECTION-01',
    name: 'Optical QA Tunnel',
    role: 'Quality Assurance',
    xPos: 10,
    zPos: 0,
    camPos: [10, 5.8, 11],
    lookAt: [10, 2.2, 0],
    description: 'Precision optical machine vision cell with black granite surface plate, dual telecentric cameras, laser scanner, and reject diverter gate.',
  },
  {
    id: 'PACKAGING-01',
    name: 'Palletizing Gantry',
    role: 'Pallet Packaging',
    xPos: 20,
    zPos: 0,
    camPos: [20, 6.8, 13],
    lookAt: [20, 2.5, 0],
    description: 'Heavy Cartesian pick-and-place packaging cell with structural box-beam gantry, linear guide rails, vacuum gripper, and Euro-pallets.',
  },
];

const CNC_02_META: StationMeta = {
  id: 'CNC-02',
  name: 'Parallel 5-Axis CNC Mill #2',
  role: 'Parallel Milling',
  xPos: -10,
  zPos: 5.5,
  camPos: [-10, 6.2, 16.5],
  lookAt: [-10, 2.2, 5.5],
  description: 'Duplicate 5-axis vertical machining center operating in a load-sharing parallel cell on the secondary spur conveyor. Relieves the 42s CNC line bottleneck down to 21s cadence with 0 thermal penalty.',
};

// Color palette for machines & status (matching workspace design system)
const STATUS_COLORS = {
  RUNNING: { hex: 0x4a7c59, css: '#4a7c59', label: 'RUNNING' }, // --status-good
  IDLE: { hex: 0x9a9a9a, css: '#9a9a9a', label: 'IDLE' },       // --status-neutral
  WARNING: { hex: 0xc49a3b, css: '#c49a3b', label: 'WARNING' }, // --status-warn
  DEGRADED: { hex: 0xc47b3b, css: '#c47b3b', label: 'DEGRADED' }, // --accent-copper
  FAULT: { hex: 0xb85c4a, css: '#b85c4a', label: 'FAULT' },     // --status-error
  MAINTENANCE: { hex: 0x5b7b94, css: '#5b7b94', label: 'MAINT' }, // --accent-blue
  OFFLINE: { hex: 0x64748b, css: '#64748b', label: 'OFFLINE' },
};

export default function FactoryFloor3DPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const { data: machines } = useMachines(1000);
  const { data: summary } = useSummary(1000);
  const { data: tokens } = useProductionTokens(1500, 20);

  // UI State
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'free' | 'cinematic' | 'overview' | 'topdown' | 'isometric' | string>('free');
  const [videoMode, setVideoMode] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTags, setShowTags] = useState<boolean>(true);

  // Parallel Twin & Simulation Controls State
  const [parallelCncEnabled, setParallelCncEnabled] = useState<boolean>(false);
  const [isSimPaused, setIsSimPaused] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [cnc2Fault, setCnc2Fault] = useState<string | null>(null);
  const [whatIfScenario, setWhatIfScenario] = useState<ScenarioRunResult | null>(null);
  const [showWhatIfBanner, setShowWhatIfBanner] = useState<boolean>(true);
  const [isWhatIfCardOpen, setIsWhatIfCardOpen] = useState<boolean>(true);
  const [isCameraCardOpen, setIsCameraCardOpen] = useState<boolean>(false);
  const [isToolsCardOpen, setIsToolsCardOpen] = useState<boolean>(false);

  // Auto-close collapsible HUD dropdown menus on outside click
  useEffect(() => {
    const onOutsideClick = (e: globalThis.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.f3d-collapsible-menu') && !target.closest('.f3d-whatif-container')) {
        setIsCameraCardOpen(false);
        setIsToolsCardOpen(false);
      }
    };
    window.addEventListener('pointerdown', onOutsideClick);
    return () => window.removeEventListener('pointerdown', onOutsideClick);
  }, []);

  // Floating label DOM element references (zero React re-render overhead during 60 FPS animation)
  const labelElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [webglError, setWebglError] = useState<string | null>(null);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const matsRef = useRef<FactoryMaterials | null>(null);
  const parallelGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const flowManagerRef = useRef<PartsFlowManager | null>(null);

  const animatedNodesRef = useRef<BuiltMachineNodes>({
    beacons: {},
    machineRoots: {},
  });

  const targetCamPosRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const cinematicAngleRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const startTimeRef = useRef<number>(performance.now());
  const cameraModeRef = useRef<'free' | 'cinematic' | 'overview' | 'topdown' | 'isometric' | string>('free');

  const machinesRef = useRef<MachineTelemetry[] | null>(null);
  const isSimPausedRef = useRef<boolean>(false);
  const simSpeedRef = useRef<number>(1);
  const parallelCncRef = useRef<boolean>(false);

  // Active Station Metadata (Includes CNC-02 when parallel cell active)
  const currentStationMetas = useMemo(() => {
    if (!parallelCncEnabled) return BASE_STATION_METAS;
    return [
      BASE_STATION_METAS[0], // STAMPING-01
      BASE_STATION_METAS[1], // CNC-01
      CNC_02_META,           // CNC-02
      BASE_STATION_METAS[2], // WELDING-01
      BASE_STATION_METAS[3], // INSPECTION-01
      BASE_STATION_METAS[4], // PACKAGING-01
    ];
  }, [parallelCncEnabled]);

  const currentStationMetasRef = useRef<StationMeta[]>(BASE_STATION_METAS);

  useEffect(() => {
    currentStationMetasRef.current = currentStationMetas;
  }, [currentStationMetas]);

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    isSimPausedRef.current = isSimPaused;
  }, [isSimPaused]);

  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);

  useEffect(() => {
    parallelCncRef.current = parallelCncEnabled;
  }, [parallelCncEnabled]);

  // Fullscreen change listener (prevents isFullscreen desync when pressing Esc)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Current selected machine data
  const selectedMachine = useMemo(() => {
    if (!selectedMachineId) return null;
    if (selectedMachineId === 'CNC-02') {
      const cnc01 = machines?.find(m => m.machine_id === 'CNC-01');
      const isFaulted = cnc2Fault !== null;
      return {
        machine_id: 'CNC-02',
        status: (isFaulted ? 'FAULT' : cnc01 ? cnc01.status : 'RUNNING') as MachineStatus,
        rpm: isFaulted ? 0 : cnc01 && cnc01.status === 'RUNNING' ? 3420 + Math.sin(Date.now() / 900) * 15 : 3400,
        temperature: isFaulted ? 78.5 : cnc01 ? Math.min(54.2, cnc01.temperature * 0.88) : 52.4,
        vibration: isFaulted ? 4.8 : cnc01 ? Math.min(0.95, cnc01.vibration * 0.75) : 0.82,
        current: isFaulted ? 2.1 : cnc01 ? cnc01.current * 0.95 : 14.1,
        health: isFaulted ? 38.0 : cnc01 ? Math.max(92, cnc01.health) : 96.5,
        production_count: cnc01 ? Math.floor(cnc01.production_count / 2) : 180,
        wip_count: 1,
        is_starved: false,
        is_blocked: false,
        timestamp: new Date().toISOString(),
      } as MachineTelemetry;
    }
    if (!machines) return null;
    return machines.find(m => m.machine_id === selectedMachineId) || null;
  }, [machines, selectedMachineId, cnc2Fault]);

  // Notice helper
  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleToggleParallelCnc = async () => {
    const nextState = !parallelCncEnabled;
    setParallelCncEnabled(nextState);
    parallelCncRef.current = nextState;

    if (flowManagerRef.current) {
      flowManagerRef.current.setParallelCncActive(nextState);
    }

    const scene = sceneRef.current;
    const mats = matsRef.current;
    const nodes = animatedNodesRef.current;

    if (scene && mats) {
      if (nextState) {
        if (!parallelGroupRef.current) {
          const parGroup = new THREE.Group();
          parGroup.name = 'PARALLEL_CNC_CELL_GROUP';
          buildCncMill(parGroup, mats, nodes, -10, 5.5, 'CNC-02', 'Parallel CNC Mill #2');
          buildParallelConveyorBranch(parGroup, mats);
          scene.add(parGroup);
          parallelGroupRef.current = parGroup;
        }

        showNotice('Parallel Twin Deployed: CNC-02 active (+100% capacity)');
        setShowWhatIfBanner(true);
        setIsWhatIfCardOpen(true);

        try {
          const scenario = await api.runScenarioPreset('cnc_parallel_cell', 120);
          setWhatIfScenario(scenario);
        } catch (err) {
          console.warn('What-If scenario preset call warning:', err);
        }
      } else {
        if (parallelGroupRef.current && scene) {
          scene.remove(parallelGroupRef.current);
          parallelGroupRef.current = null;
        }
        delete nodes.cncSpindle2;
        delete nodes.cncTable2;
        delete nodes.machineRoots['CNC-02'];
        delete nodes.beacons['CNC-02'];

        if (selectedMachineId === 'CNC-02') {
          setSelectedMachineId(null);
          focusOverview();
        }
        showNotice('Reverted to Baseline (Single CNC-01 line)');
        setWhatIfScenario(null);
        setIsWhatIfCardOpen(false);
      }
    }
  };

  const handleInjectFault = async (machineId: string, faultType: string, severity: 'Warning' | 'Critical') => {
    setActionBusy(true);
    try {
      if (machineId === 'CNC-02') {
        setCnc2Fault(faultType);
        showNotice(`Injected ${severity} ${faultType} on CNC-02`);
        const beacon2 = animatedNodesRef.current.beacons['CNC-02'];
        if (beacon2) {
          (beacon2.red.material as THREE.MeshStandardMaterial).emissive.setHex(0xb85c4a);
          (beacon2.green.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          beacon2.light.color.setHex(0xb85c4a);
        }
      } else {
        await api.injectFault(machineId, faultType, severity);
        showNotice(`Injected ${severity} ${faultType} on ${machineId}`);
      }
    } catch (err: unknown) {
      showNotice(`Fault injection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleResetMachine = async (machineId: string) => {
    setActionBusy(true);
    try {
      if (machineId === 'CNC-02') {
        setCnc2Fault(null);
        showNotice(`Machine CNC-02 reset to nominal`);
        const beacon2 = animatedNodesRef.current.beacons['CNC-02'];
        if (beacon2) {
          (beacon2.red.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          (beacon2.green.material as THREE.MeshStandardMaterial).emissive.setHex(0x4a7c59);
          beacon2.light.color.setHex(0x4a7c59);
        }
      } else {
        await api.resetMachine(machineId);
        showNotice(`Machine ${machineId} reset to nominal`);
      }
    } catch (err: unknown) {
      showNotice(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDegradeCnc = async () => {
    setActionBusy(true);
    try {
      await api.simDegradeCnc();
      showNotice('CNC tool degradation simulation triggered');
    } catch (err: unknown) {
      showNotice(`Degrade failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleResetLine = async () => {
    setActionBusy(true);
    try {
      await api.simResetAll();
      setCnc2Fault(null);
      showNotice('Entire manufacturing line reset to nominal state');
    } catch (err: unknown) {
      showNotice(`Reset line failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Camera preset selectors
  const focusStation = useCallback((stationId: string) => {
    const meta = stationId === 'CNC-02' ? CNC_02_META : BASE_STATION_METAS.find(s => s.id === stationId);
    if (!meta) return;
    setSelectedMachineId(stationId);
    setCameraMode(stationId);
    targetCamPosRef.current = new THREE.Vector3(...meta.camPos);
    targetLookAtRef.current = new THREE.Vector3(...meta.lookAt);
  }, []);

  const focusOverview = useCallback(() => {
    setSelectedMachineId(null);
    setCameraMode('overview');
    targetCamPosRef.current = new THREE.Vector3(0, 21, 36);
    targetLookAtRef.current = new THREE.Vector3(0, 1.8, 0);
  }, []);

  const focusTopDown = useCallback(() => {
    setSelectedMachineId(null);
    setCameraMode('topdown');
    targetCamPosRef.current = new THREE.Vector3(0, 44, 0.1);
    targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
  }, []);

  const focusIsometric = useCallback(() => {
    setSelectedMachineId(null);
    setCameraMode('isometric');
    targetCamPosRef.current = new THREE.Vector3(-28, 22, 28);
    targetLookAtRef.current = new THREE.Vector3(0, 1.8, 0);
  }, []);

  const toggleCinematicOrbit = useCallback(() => {
    setSelectedMachineId(null);
    setCameraMode(prev => (prev === 'cinematic' ? 'free' : 'cinematic'));
  }, []);

  // ---------------------------------------------------------------------------
  // Three.js Scene Initialization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const getViewportSize = () => {
      const rect = container.getBoundingClientRect();
      const w = container.clientWidth || rect.width || (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth - 220 : 1200);
      const h = container.clientHeight || rect.height || (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight - 48 : 800);
      return {
        width: Math.max(Math.round(w), 320),
        height: Math.max(Math.round(h), 320),
      };
    };

    const { width: initWidth, height: initHeight } = getViewportSize();

    // 1. Scene & Authentic Industrial Fog
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x16181c); // Grounded charcoal slate matching workspace
    scene.fog = new THREE.FogExp2(0x16181c, 0.014);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, initWidth / initHeight, 0.2, 500);
    cameraRef.current = camera;
    camera.position.set(0, 21, 36);
    camera.lookAt(0, 1.8, 0);

    // 3. Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err: unknown) {
      console.error('Failed to create WebGLRenderer:', err);
      setWebglError(err instanceof Error ? err.message : 'WebGL hardware acceleration is not supported or enabled.');
      return;
    }
    rendererRef.current = renderer;
    renderer.setSize(initWidth, initHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.target.set(0, 1.8, 0);

    // 5. Build Factory Architecture & Materials
    const mats = createFactoryMaterials();
    matsRef.current = mats;
    buildFactoryEnvironment(scene, mats);
    buildContinuousConveyor(scene, mats);

    // 6. Build the 5 Authentic Industrial Machines
    const nodes = animatedNodesRef.current;
    nodes.beacons = {};
    nodes.machineRoots = {};

    buildStampingPress(scene, mats, nodes);
    buildCncMill(scene, mats, nodes);
    buildWeldingRobot(scene, mats, nodes);
    buildInspectionTunnel(scene, mats, nodes);
    buildPackagingGantry(scene, mats, nodes);

    // If parallel CNC is active on mount, construct CNC-02 and the conveyor branch
    if (parallelCncRef.current) {
      const parGroup = new THREE.Group();
      parGroup.name = 'PARALLEL_CNC_CELL_GROUP';
      buildCncMill(parGroup, mats, nodes, -10, 5.5, 'CNC-02', 'Parallel CNC Mill #2');
      buildParallelConveyorBranch(parGroup, mats);
      scene.add(parGroup);
      parallelGroupRef.current = parGroup;
    }

    // 7. Initialize Real-Time Synchronized Parts Flow Manager
    const flowManager = new PartsFlowManager(scene, mats);
    if (parallelCncRef.current) {
      flowManager.setParallelCncActive(true);
    }
    flowManagerRef.current = flowManager;

    // -------------------------------------------------------------------------
    // Raycasting & Click-to-Select
    // -------------------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;

    const onPointerDown = (event: PointerEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY };
      pointerDownTime = performance.now();
    };

    const onPointerUp = (event: PointerEvent) => {
      const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
      const duration = performance.now() - pointerDownTime;
      if (dist > 6 || duration > 350) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const clickableObjects: THREE.Object3D[] = [];
      Object.values(nodes.machineRoots).forEach(grp => {
        clickableObjects.push(...grp.children);
      });

      const intersects = raycaster.intersectObjects(clickableObjects, true);
      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent && current.parent !== scene) {
          if (currentStationMetasRef.current.some(s => s.id === current?.name)) {
            focusStation(current.name);
            return;
          }
          current = current.parent;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // -------------------------------------------------------------------------
    // Window Resize Handling
    // -------------------------------------------------------------------------
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const { width, height } = getViewportSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.round(width || container.clientWidth || 320);
        const h = Math.round(height || container.clientHeight || 320);
        if (w > 0 && h > 0 && renderer && camera) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // -------------------------------------------------------------------------
    // Master Animation Loop (60 FPS Performance Timer Driven)
    // -------------------------------------------------------------------------
    let reqId: number;

    const animate = () => {
      reqId = requestAnimationFrame(animate);

      const now = performance.now();
      const rawDelta = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const speedMult = isSimPausedRef.current ? 0 : simSpeedRef.current;
      const delta = rawDelta * speedMult;
      const time = ((now - startTimeRef.current) / 1000) * (isSimPausedRef.current ? 1 : simSpeedRef.current);

      // 1. Camera interpolation
      if (cameraModeRef.current === 'cinematic') {
        cinematicAngleRef.current += rawDelta * 0.1;
        const radius = 35;
        camera.position.x = Math.sin(cinematicAngleRef.current) * radius;
        camera.position.z = Math.cos(cinematicAngleRef.current) * radius;
        camera.position.y = 15 + Math.sin(cinematicAngleRef.current * 1.4) * 3.5;
        controls.target.set(0, 2.0, 0);
      } else if (targetCamPosRef.current && targetLookAtRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.05);
        controls.target.lerp(targetLookAtRef.current, 0.05);

        if (camera.position.distanceTo(targetCamPosRef.current) < 0.1) {
          targetCamPosRef.current = null;
          targetLookAtRef.current = null;
        }
      }

      controls.update();

      // 2. Machine Kinematics & Mechanics (Synchronized with live operational status & workpiece presence)
      const liveMachines = machinesRef.current;
      const getStationStatus = (id: string) => {
        const m = liveMachines?.find(item => item.machine_id === id);
        return {
          isRunning: m ? m.status === 'RUNNING' && !m.is_starved && !m.is_blocked : true,
          isStarved: !!m?.is_starved,
          isBlocked: !!m?.is_blocked,
          isFaulted: m ? m.status === 'FAULT' || m.status === 'OFFLINE' : false,
        };
      };

      const stampingStatus = getStationStatus('STAMPING-01');
      const cncStatus = getStationStatus('CNC-01');
      const weldingStatus = getStationStatus('WELDING-01');
      const inspectionStatus = getStationStatus('INSPECTION-01');

      // STAMPING-01: Sinusoidal Platen Press Cycle
      if (nodes.stampingRam) {
        if (stampingStatus.isRunning && delta > 0) {
          nodes.stampingRam.position.y = 3.5 + Math.sin(time * 3.0) * 0.75;
        } else {
          nodes.stampingRam.position.y = THREE.MathUtils.lerp(nodes.stampingRam.position.y, 4.2, rawDelta * 3.0);
        }
      }

      // CNC-01: High-Speed Spindle Rotation & Milling Table Motion
      if (nodes.cncSpindle && delta > 0) {
        if (cncStatus.isRunning) {
          nodes.cncSpindle.rotation.y += delta * 32.0;
        }
      }
      if (nodes.cncTable) {
        if (cncStatus.isRunning && delta > 0) {
          nodes.cncTable.position.x = Math.sin(time * 1.8) * 0.15;
          nodes.cncTable.position.z = Math.cos(time * 2.4) * 0.10;
        } else {
          nodes.cncTable.position.x = THREE.MathUtils.lerp(nodes.cncTable.position.x, 0, rawDelta * 3.0);
          nodes.cncTable.position.z = THREE.MathUtils.lerp(nodes.cncTable.position.z, 0, rawDelta * 3.0);
        }
      }

      // CNC-02: Parallel Spindle Rotation & Milling Table Motion
      if (nodes.cncSpindle2 && delta > 0) {
        nodes.cncSpindle2.rotation.y += delta * 32.0;
      }
      if (nodes.cncTable2) {
        if (delta > 0) {
          nodes.cncTable2.position.x = Math.sin(time * 1.8) * 0.15;
          nodes.cncTable2.position.z = Math.cos(time * 2.4) * 0.10;
        } else {
          nodes.cncTable2.position.x = THREE.MathUtils.lerp(nodes.cncTable2.position.x, 0, rawDelta * 3.0);
          nodes.cncTable2.position.z = THREE.MathUtils.lerp(nodes.cncTable2.position.z, 0, rawDelta * 3.0);
        }
      }

      // WELDING-01: Robot Articulation, Arc Spark Flicker & Particles
      const isWeldingWorkpiece = flowManagerRef.current?.stationOccupied[2] ?? false;
      const isWeldingActive = weldingStatus.isRunning && isWeldingWorkpiece && delta > 0;

      if (nodes.weldingArmUpper && nodes.weldingArmFore) {
        if (isWeldingActive) {
          nodes.weldingArmUpper.rotation.z = Math.sin(time * 1.5) * 0.16;
          nodes.weldingArmFore.rotation.x = Math.cos(time * 1.8) * 0.18;
        } else {
          nodes.weldingArmUpper.rotation.z = THREE.MathUtils.lerp(nodes.weldingArmUpper.rotation.z, 0, rawDelta * 3.0);
          nodes.weldingArmFore.rotation.x = THREE.MathUtils.lerp(nodes.weldingArmFore.rotation.x, 0, rawDelta * 3.0);
        }
      }
      if (nodes.weldingLight) {
        if (isWeldingActive) {
          const sparkJitter = Math.sin(time * 48) * Math.cos(time * 36);
          const isSparking = sparkJitter > 0.1;
          nodes.weldingLight.intensity = isSparking ? 4.5 : 0.6;

          if (nodes.weldingSparks && nodes.weldingSparks.children[0]) {
            const points = nodes.weldingSparks.children[0] as THREE.Points;
            (points.material as THREE.PointsMaterial).opacity = isSparking ? 0.9 : 0.0;
          }
        } else {
          nodes.weldingLight.intensity = 0.0;
          if (nodes.weldingSparks && nodes.weldingSparks.children[0]) {
            const points = nodes.weldingSparks.children[0] as THREE.Points;
            (points.material as THREE.PointsMaterial).opacity = 0.0;
          }
        }
      }

      // INSPECTION-01: Sweeping Planar Laser Line
      if (nodes.inspectionLaser) {
        if (inspectionStatus.isRunning && delta > 0) {
          nodes.inspectionLaser.visible = true;
          nodes.inspectionLaser.position.z = Math.sin(time * 2.8) * 0.75;
        } else {
          nodes.inspectionLaser.visible = false;
        }
      }

      // 3. Update Synchronized Workpiece Flow & Gantry Coordinates
      if (flowManagerRef.current) {
        flowManagerRef.current.update(delta, nodes.inspectionDiverter, {
          carriage: nodes.packagingCarriage,
          mast: nodes.packagingMast,
          gripper: nodes.packagingGripper,
        });
      }

      // 4. Project 2D HUD Badges to DOM elements
      if (camera && container) {
        const { width: currentW, height: currentH } = getViewportSize();
        const halfW = currentW / 2;
        const halfH = currentH / 2;
        const projVec = new THREE.Vector3();

        for (const meta of currentStationMetasRef.current) {
          const el = labelElementRefs.current[meta.id];
          if (!el) continue;

          projVec.set(meta.xPos, 5.2, meta.zPos || 0);
          projVec.project(camera);

          const isBehind = projVec.z > 1.0;
          const x = projVec.x * halfW + halfW;
          const y = -(projVec.y * halfH) + halfH;
          const visible = !isBehind && x > 20 && x < currentW - 20 && y > 20 && y < currentH - 20;

          if (visible) {
            el.style.display = 'block';
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          } else {
            el.style.display = 'none';
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      if (parallelGroupRef.current && sceneRef.current) {
        sceneRef.current.remove(parallelGroupRef.current);
        parallelGroupRef.current = null;
      }
      flowManager.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [focusStation]);

  // ---------------------------------------------------------------------------
  // Sync Telemetry & Tokens with Parts Flow & Andon Beacons
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!machines) return;

    // 1. Update Parts Flow with Live Telemetry
    if (flowManagerRef.current) {
      flowManagerRef.current.updateFromTelemetry(machines, tokens ?? undefined);
    }

    // 2. Update 3D Andon Beacons
    machines.forEach(m => {
      const beacon = animatedNodesRef.current.beacons[m.machine_id];
      if (!beacon) return;

      const isFault = m.status === 'FAULT' || m.status === 'WARNING' || m.status === 'DEGRADED';
      const isStarvedOrBlocked = m.is_starved || m.is_blocked;

      if (isFault) {
        (beacon.red.material as THREE.MeshStandardMaterial).emissive.setHex(0xb85c4a);
        (beacon.amber.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (beacon.green.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        beacon.light.color.setHex(0xb85c4a);
        beacon.light.intensity = 2.2;
      } else if (isStarvedOrBlocked) {
        (beacon.red.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (beacon.amber.material as THREE.MeshStandardMaterial).emissive.setHex(0xc49a3b);
        (beacon.green.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        beacon.light.color.setHex(0xc49a3b);
        beacon.light.intensity = 1.8;
      } else {
        (beacon.red.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (beacon.amber.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (beacon.green.material as THREE.MeshStandardMaterial).emissive.setHex(0x4a7c59);
        beacon.light.color.setHex(0x4a7c59);
        beacon.light.intensity = 1.5;
      }
    });
  }, [machines, tokens]);

  const oeeDisplay = summary
    ? (summary.oee > 1 ? summary.oee.toFixed(1) : (summary.oee * 100).toFixed(1)) + '%'
    : '--';

  return (
    <div
      className="factory-floor-3d-root"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 48px)',
        backgroundColor: '#16181c',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* =====================================================================
          1. 3D WebGL Canvas Viewport
          ===================================================================== */}
      <div
        ref={mountRef}
        className="factory-canvas-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />

      {/* WebGL Context Unavailable Fallback Screen */}
      {webglError && (
        <div className="f3d-webgl-error">
          <AlertTriangle size={36} color="#c49a3b" />
          <div className="f3d-webgl-title">WebGL Acceleration Unavailable</div>
          <p className="f3d-webgl-desc">
            Your browser could not initialize hardware-accelerated 3D graphics ({webglError}).
            Please ensure WebGL is enabled in your browser settings or try using Chrome/Edge.
          </p>
          <button className="f3d-btn active-cam" onClick={() => window.location.reload()}>
            <RotateCcw size={14} /> Retry Initialization
          </button>
        </div>
      )}

      {/* =====================================================================
          2. Floating 3D Machine Badges
          ===================================================================== */}
      {showTags &&
        !videoMode &&
        currentStationMetas.map(station => {
          let liveMachine = machines?.find(m => m.machine_id === station.id);
          if (station.id === 'CNC-02') {
            const isFaulted = cnc2Fault !== null;
            const cnc01 = machines?.find(m => m.machine_id === 'CNC-01');
            liveMachine = {
              machine_id: 'CNC-02',
              status: isFaulted ? 'FAULT' : cnc01 ? cnc01.status : 'RUNNING',
              rpm: isFaulted ? 0 : 3410,
              temperature: isFaulted ? 78.5 : 52.4,
            } as MachineTelemetry;
          }

          const status = liveMachine?.status || 'RUNNING';
          const isSelected = selectedMachineId === station.id;
          const isFault = status === 'FAULT' || status === 'WARNING' || status === 'DEGRADED';
          const isStarved = liveMachine?.is_starved;
          const isBlocked = liveMachine?.is_blocked;

          const badgeClass = [
            'f3d-station-badge',
            isSelected ? 'is-selected' : '',
            isFault ? 'is-warning' : '',
            isStarved ? 'is-starved' : '',
            isBlocked ? 'is-blocked' : '',
          ].filter(Boolean).join(' ');

          const dotClass = [
            'f3d-status-dot',
            isFault ? 'dot-warning' : isStarved ? 'dot-starved' : isBlocked ? 'dot-blocked' : '',
          ].filter(Boolean).join(' ');

          const arrowClass = [
            'f3d-pointer-arrow',
            isSelected ? 'is-selected' : isFault ? 'is-warning' : isStarved ? 'is-starved' : isBlocked ? 'is-blocked' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={station.id}
              ref={el => {
                labelElementRefs.current[station.id] = el;
              }}
              onClick={() => focusStation(station.id)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                display: 'none',
                willChange: 'transform',
                transform: 'translate3d(-9999px, -9999px, 0)',
              }}
              className={`f3d-station-label ${isSelected ? 'is-selected' : ''}`}
            >
              <div className={badgeClass}>
                <span className={dotClass} />
                <div className="f3d-badge-info">
                  <div className="f3d-badge-header">
                    <span>{station.id}</span>
                    {station.id === 'CNC-02' && <span className="f3d-tag-pill parallel">PARALLEL</span>}
                    {isStarved && <span className="f3d-tag-pill starved">STARVED</span>}
                    {isBlocked && <span className="f3d-tag-pill blocked">BLOCKED</span>}
                  </div>
                  <div className="f3d-badge-telemetry">
                    <span>{liveMachine ? `${Math.round(liveMachine.rpm)} RPM` : '--'}</span>
                    <span>•</span>
                    <span>{liveMachine ? `${liveMachine.temperature.toFixed(1)}°C` : '--'}</span>
                  </div>
                </div>
              </div>
              <div className={arrowClass} />
            </div>
          );
        })}

      {/* =====================================================================
          3. Notification Pill
          ===================================================================== */}
      {actionNotice && (
        <div className="f3d-notice-pill">
          <Activity size={14} color="#5b7b94" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* =====================================================================
          4. Top HUD Bar
          ===================================================================== */}
      {!videoMode && (
        <div className="f3d-hud-top">
          {/* Left: Summary Metrics Pill */}
          <div className="f3d-panel f3d-summary-panel">
            <div className="f3d-brand">
              <Box color="#5b7b94" size={17} />
              <div className="f3d-brand-text">
                <span className="f3d-brand-label">3D Digital Twin</span>
                <span className="f3d-brand-title">Full Line View</span>
              </div>
            </div>

            <div className="f3d-metrics-group">
              <div className="f3d-metric-item">
                <span className="f3d-metric-key">OEE</span>
                <span className="f3d-metric-val oee">{oeeDisplay}</span>
              </div>
              <div className="f3d-metric-item">
                <span className="f3d-metric-key">OUTPUT</span>
                <span className="f3d-metric-val output">
                  {summary ? `${summary.total_output} units` : '--'}
                </span>
              </div>
              <div className="f3d-metric-item">
                <span className="f3d-metric-key">WIP</span>
                <span className="f3d-metric-val wip">
                  {summary ? `${summary.total_wip ?? 0} pcs` : '--'}
                </span>
              </div>
              <div className="f3d-metric-item">
                <span className="f3d-metric-key">FLEET</span>
                <span className="f3d-metric-val online">
                  {parallelCncEnabled ? '6/6 Cells' : `${summary?.machines_online ?? 5}/${summary?.machines_total ?? 5}`}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Collapsible What-If Digital Twin Scenario Card */}
          <div className="f3d-whatif-container">
            <button
              onClick={() => {
                if (parallelCncEnabled) {
                  setIsWhatIfCardOpen(prev => !prev);
                } else {
                  handleToggleParallelCnc();
                }
              }}
              disabled={actionBusy}
              className={`f3d-parallel-btn ${parallelCncEnabled ? 'active' : ''}`}
              title={
                parallelCncEnabled
                  ? (isWhatIfCardOpen ? 'Click to collapse What-If impact report' : 'Click to expand What-If impact report')
                  : 'Add parallel CNC-02 machine in 3D environment to simulate relieved line bottleneck'
              }
            >
              {parallelCncEnabled ? (
                <Zap size={14} color="#fdba74" className="spinning-slow" />
              ) : (
                <Layers size={14} />
              )}
              <div className="f3d-parallel-btn-text">
                <span className="f3d-parallel-btn-title">
                  {parallelCncEnabled ? 'Parallel CNC: Active' : 'Add Parallel Machine'}
                </span>
                <span className="f3d-parallel-btn-sub">
                  {parallelCncEnabled ? 'Dual Cell · 2x Flow' : 'Simulate Twin Spur'}
                </span>
              </div>
              <span className={`f3d-parallel-badge ${parallelCncEnabled ? 'active' : ''}`}>
                {parallelCncEnabled ? '2x Flow' : 'What-If'}
              </span>
              {parallelCncEnabled && (
                <ChevronDown size={13} className={`f3d-dropdown-chevron ${isWhatIfCardOpen ? 'open' : ''}`} />
              )}
            </button>

            {/* Collapsible Impact Card Anchored Under Trigger */}
            <AnimatePresence>
              {parallelCncEnabled && isWhatIfCardOpen && !videoMode && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ type: 'spring', duration: 0.28, bounce: 0 }}
                  className="f3d-whatif-dropdown-card"
                >
                  <div className="f3d-whatif-card-header">
                    <div className="f3d-whatif-tag">
                      <Zap size={12} color="#fdba74" />
                      <span>DIGITAL TWIN WHAT-IF IMPACT</span>
                    </div>
                    <button
                      onClick={() => setIsWhatIfCardOpen(false)}
                      className="f3d-whatif-card-close"
                      title="Collapse Card"
                    >
                      <ChevronUp size={14} />
                    </button>
                  </div>

                  <div className="f3d-whatif-card-grid">
                    <div className="f3d-whatif-stat">
                      <span className="label">CNC Effective Cadence</span>
                      <span className="value good">42.0s → 21.0s (-50%)</span>
                    </div>
                    <div className="f3d-whatif-stat">
                      <span className="label">Hourly Line Throughput</span>
                      <span className="value good">85.7 → 171.4 pcs/hr (+100%)</span>
                    </div>
                    <div className="f3d-whatif-stat">
                      <span className="label">Bottleneck Relocation</span>
                      <span className="value warn">CNC-01 → WELDING-01 (15.0s)</span>
                    </div>
                    <div className="f3d-whatif-stat">
                      <span className="label">Spindle Thermal Strain</span>
                      <span className="value good">0 Penalty (Load-shared 3,400 RPM)</span>
                    </div>
                  </div>

                  <div className="f3d-whatif-card-footer">
                    <button
                      onClick={handleToggleParallelCnc}
                      disabled={actionBusy}
                      className="f3d-whatif-btn revert"
                      title="Remove parallel cell and return to baseline single CNC line"
                    >
                      Revert to Baseline
                    </button>
                    <button
                      onClick={() => setIsWhatIfCardOpen(false)}
                      className="f3d-whatif-btn collapse"
                    >
                      Hide Card
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Collapsible Camera, Simulation Pace & View Tools */}
          <div className="f3d-hud-controls">
            {/* Collapsible Camera Presets Card */}
            <div className="f3d-collapsible-menu">
              <button
                onClick={() => {
                  setIsCameraCardOpen(prev => !prev);
                  setIsToolsCardOpen(false);
                }}
                className={`f3d-trigger-btn ${isCameraCardOpen ? 'active' : ''}`}
                title="Camera Presets"
              >
                {cameraMode === 'overview' ? <Camera size={13} color="#5b7b94" /> :
                 cameraMode === 'topdown' ? <Compass size={13} color="#5b7b94" /> :
                 cameraMode === 'isometric' ? <Box size={13} color="#5b7b94" /> :
                 <Video size={13} color="#c47b3b" />}
                <span>
                  {cameraMode === 'overview' ? 'Wide' :
                   cameraMode === 'topdown' ? 'Top-Down' :
                   cameraMode === 'isometric' ? 'Isometric' : 'Cinematic'}
                </span>
                <ChevronsUpDown size={12} className="f3d-trigger-chevron" />
              </button>

              <AnimatePresence>
                {isCameraCardOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="f3d-menu-dropdown"
                  >
                    <div className="f3d-menu-header">CAMERA PRESETS</div>
                    <button
                      onClick={() => { focusOverview(); setIsCameraCardOpen(false); }}
                      className={`f3d-menu-item ${cameraMode === 'overview' ? 'selected' : ''}`}
                    >
                      <Camera size={13} />
                      <div className="item-text">
                        <span className="item-title">Wide Overview</span>
                        <span className="item-sub">Default plant perspective</span>
                      </div>
                      {cameraMode === 'overview' && <Check size={12} className="check-icon" />}
                    </button>
                    <button
                      onClick={() => { focusTopDown(); setIsCameraCardOpen(false); }}
                      className={`f3d-menu-item ${cameraMode === 'topdown' ? 'selected' : ''}`}
                    >
                      <Compass size={13} />
                      <div className="item-text">
                        <span className="item-title">Top-Down Bird's-Eye</span>
                        <span className="item-sub">Inspect parallel spur conveyor</span>
                      </div>
                      {cameraMode === 'topdown' && <Check size={12} className="check-icon" />}
                    </button>
                    <button
                      onClick={() => { focusIsometric(); setIsCameraCardOpen(false); }}
                      className={`f3d-menu-item ${cameraMode === 'isometric' ? 'selected' : ''}`}
                    >
                      <Box size={13} />
                      <div className="item-text">
                        <span className="item-title">Isometric Angle</span>
                        <span className="item-sub">Close-up machining cells</span>
                      </div>
                      {cameraMode === 'isometric' && <Check size={12} className="check-icon" />}
                    </button>
                    <button
                      onClick={() => { toggleCinematicOrbit(); setIsCameraCardOpen(false); }}
                      className={`f3d-menu-item ${cameraMode === 'cinematic' ? 'selected' : ''}`}
                    >
                      <Video size={13} />
                      <div className="item-text">
                        <span className="item-title">Cinematic Orbit</span>
                        <span className="item-sub">Smooth 360° demonstration</span>
                      </div>
                      {cameraMode === 'cinematic' && <Check size={12} className="check-icon" />}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Simulation Playback & Speed Controls */}
            <div className="f3d-panel f3d-sim-panel">
              <button
                onClick={() => setIsSimPaused(prev => !prev)}
                className={`f3d-icon-btn ${isSimPaused ? 'active-warn' : ''}`}
                title={isSimPaused ? 'Resume Simulation Playback' : 'Pause 3D Simulation'}
              >
                {isSimPaused ? <Play size={13} color="#e5a91e" /> : <Pause size={13} />}
              </button>

              <div className="f3d-speed-group">
                {[1, 2, 3].map(spd => (
                  <button
                    key={spd}
                    onClick={() => setSimSpeed(spd)}
                    className={`f3d-speed-btn ${simSpeed === spd ? 'active' : ''}`}
                    title={`Set conveyor simulation speed to ${spd}x`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Collapsible View Utilities Card */}
            <div className="f3d-collapsible-menu">
              <button
                onClick={() => {
                  setIsToolsCardOpen(prev => !prev);
                  setIsCameraCardOpen(false);
                }}
                className={`f3d-trigger-btn ${isToolsCardOpen ? 'active' : ''}`}
                title="Scene View Tools"
              >
                <Sliders size={13} color="#94a3b8" />
                <span>Tools</span>
                <ChevronsUpDown size={12} className="f3d-trigger-chevron" />
              </button>

              <AnimatePresence>
                {isToolsCardOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="f3d-menu-dropdown tools-menu"
                  >
                    <div className="f3d-menu-header">VIEW UTILITIES</div>
                    <button
                      onClick={() => setShowTags(prev => !prev)}
                      className="f3d-menu-item"
                    >
                      <Eye size={13} color={showTags ? '#86efac' : '#94a3b8'} />
                      <div className="item-text">
                        <span className="item-title">Machine Labels</span>
                        <span className="item-sub">Floating 3D world tags</span>
                      </div>
                      <span className={`status-pill ${showTags ? 'on' : 'off'}`}>
                        {showTags ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <button
                      onClick={() => { setVideoMode(true); setIsToolsCardOpen(false); }}
                      className="f3d-menu-item"
                    >
                      <Video size={13} color="#b85c4a" />
                      <div className="item-text">
                        <span className="item-title">Clean Record Mode</span>
                        <span className="item-sub">Hide HUD for screen capture</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { handleResetLine(); setIsToolsCardOpen(false); }}
                      disabled={actionBusy}
                      className="f3d-menu-item"
                    >
                      <RotateCcw size={13} className={actionBusy ? 'spinning' : ''} />
                      <div className="item-text">
                        <span className="item-title">Reset Line Baseline</span>
                        <span className="item-sub">Calibrate nominal state</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { toggleFullscreen(); setIsToolsCardOpen(false); }}
                      className="f3d-menu-item"
                    >
                      {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                      <div className="item-text">
                        <span className="item-title">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                        <span className="item-sub">Toggle canvas view</span>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. Floating Exit Clean Record Button
          ===================================================================== */}
      {videoMode && (
        <div className="f3d-exit-record-pill">
          <button onClick={() => setVideoMode(false)} className="f3d-exit-btn">
            <X size={14} color="#b85c4a" />
            Exit Clean Record Mode
          </button>
        </div>
      )}

      {/* =====================================================================
          6. Interactive Machine Control & Telemetry Drawer
          ===================================================================== */}
      {selectedMachine && !videoMode && (
        <div className="f3d-drawer">
          {/* Header */}
          <div className="f3d-drawer-header">
            <div className="f3d-drawer-title-group">
              <div className="f3d-drawer-mid-badge">
                <span className="f3d-drawer-mid">{selectedMachine.machine_id}</span>
                <span
                  className={`f3d-status-pill ${
                    selectedMachine.status === 'RUNNING'
                      ? 'running'
                      : selectedMachine.status === 'FAULT'
                      ? 'fault'
                      : 'warning'
                  }`}
                >
                  {selectedMachine.status}
                </span>
              </div>
              <div className="f3d-drawer-station-name">
                {currentStationMetas.find(s => s.id === selectedMachine.machine_id)?.name}
              </div>
            </div>

            <button
              onClick={() => setSelectedMachineId(null)}
              className="f3d-drawer-close"
              title="Close drawer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <div className="f3d-drawer-desc">
            {currentStationMetas.find(s => s.id === selectedMachine.machine_id)?.description}
          </div>

          {/* Scrollable Content */}
          <div className="f3d-drawer-body">
            {/* Real-time Telemetry Grid */}
            <div className="f3d-telemetry-grid">
              <div className="f3d-telemetry-card">
                <div className="f3d-card-label">
                  <Activity size={12} color="#5b7b94" />
                  SPEED (RPM)
                </div>
                <div className="f3d-card-val">
                  {Math.round(selectedMachine.rpm).toLocaleString()}
                </div>
              </div>

              <div className="f3d-telemetry-card">
                <div className="f3d-card-label">
                  <Flame size={12} color="#c47b3b" />
                  TEMPERATURE
                </div>
                <div className="f3d-card-val">
                  {selectedMachine.temperature.toFixed(1)}°C
                </div>
              </div>

              <div className="f3d-telemetry-card">
                <div className="f3d-card-label">
                  <Gauge size={12} color="#4a7c59" />
                  VIBRATION
                </div>
                <div className="f3d-card-val">
                  {selectedMachine.vibration.toFixed(2)} mm/s
                </div>
              </div>

              <div className="f3d-telemetry-card">
                <div className="f3d-card-label">
                  <Zap size={12} color="#c49a3b" />
                  CURRENT
                </div>
                <div className="f3d-card-val">
                  {selectedMachine.current.toFixed(1)} A
                </div>
              </div>
            </div>

            {/* Health & State Metrics */}
            <div className="f3d-health-card">
              <div className="f3d-health-row">
                <span className="f3d-health-title">Machine Health:</span>
                <span
                  className={`f3d-health-pct ${
                    selectedMachine.health > 80
                      ? 'good'
                      : selectedMachine.health > 50
                      ? 'warn'
                      : 'crit'
                  }`}
                >
                  {selectedMachine.health.toFixed(1)}%
                </span>
              </div>
              <div className="f3d-progress-bar">
                <div
                  className={`f3d-progress-fill ${
                    selectedMachine.health > 80
                      ? 'good'
                      : selectedMachine.health > 50
                      ? 'warn'
                      : 'crit'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, selectedMachine.health))}%` }}
                />
              </div>

              <div className="f3d-meta-grid">
                <div>
                  <div className="f3d-meta-label">Total Output:</div>
                  <div className="f3d-meta-val">{selectedMachine.production_count} units</div>
                </div>
                <div>
                  <div className="f3d-meta-label">WIP Queue:</div>
                  <div className="f3d-meta-val">{selectedMachine.wip_count ?? 0} pcs</div>
                </div>
                <div>
                  <div className="f3d-meta-label">Line Starved:</div>
                  <div className={`f3d-meta-val ${selectedMachine.is_starved ? 'starved' : ''}`}>
                    {selectedMachine.is_starved ? 'YES (Upstream Lag)' : 'NO'}
                  </div>
                </div>
                <div>
                  <div className="f3d-meta-label">Line Blocked:</div>
                  <div className={`f3d-meta-val ${selectedMachine.is_blocked ? 'blocked' : ''}`}>
                    {selectedMachine.is_blocked ? 'YES (Downstream Full)' : 'NO'}
                  </div>
                </div>
              </div>
            </div>

            {/* Fault Injection & Digital Twin Experiments */}
            <div className="f3d-controls-section">
              <div className="f3d-controls-title">
                <Sliders size={13} color="#5b7b94" />
                Real-Time Twin Controls
              </div>

              <div className="f3d-action-grid">
                <button
                  onClick={() => handleInjectFault(selectedMachine.machine_id, 'VIBRATION_SPIKE', 'Critical')}
                  disabled={actionBusy}
                  className="f3d-btn-fault"
                  title="Inject sudden vibration spike"
                >
                  <span>Vibration Spike</span>
                  <AlertTriangle size={12} />
                </button>

                <button
                  onClick={() => handleInjectFault(selectedMachine.machine_id, 'BEARING_OVERHEAT', 'Critical')}
                  disabled={actionBusy}
                  className="f3d-btn-warning"
                  title="Inject bearing thermal run-away"
                >
                  <span>Overheat Bearing</span>
                  <Flame size={12} />
                </button>
              </div>

              {(selectedMachine.machine_id === 'CNC-01' || selectedMachine.machine_id === 'CNC-02') && (
                <button
                  onClick={handleDegradeCnc}
                  disabled={actionBusy}
                  className="f3d-btn-degrade"
                  title="Simulate accelerated cutter wear"
                >
                  <span>Simulate Tool Wear Degradation</span>
                  <Gauge size={12} />
                </button>
              )}

              <button
                onClick={() => handleResetMachine(selectedMachine.machine_id)}
                disabled={actionBusy}
                className="f3d-btn-reset"
                title="Clear faults and restore nominal parameters"
              >
                <RotateCcw size={13} className={actionBusy ? 'spinning' : ''} />
                Reset Machine to Nominal
              </button>
            </div>
          </div>

          {/* Pinned Drawer Footer Links */}
          <div className="f3d-drawer-footer">
            <Link
              to={`/machines/${selectedMachine.machine_id === 'CNC-02' ? 'CNC-01' : selectedMachine.machine_id}`}
              className="f3d-link-btn telemetry"
            >
              <span>Telemetry Charts</span>
              <ExternalLink size={12} />
            </Link>

            <Link
              to="/twin"
              className="f3d-link-btn twin"
            >
              <span>Twin Studio</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. Bottom Quick-Select Dock
          ===================================================================== */}
      {!videoMode && (
        <div className={`f3d-dock-wrapper ${selectedMachine ? 'drawer-open' : ''}`}>
          <div className="f3d-dock">
            {currentStationMetas.map(station => {
              let live = machines?.find(m => m.machine_id === station.id);
              if (station.id === 'CNC-02') {
                live = {
                  machine_id: 'CNC-02',
                  status: cnc2Fault !== null ? 'FAULT' : 'RUNNING',
                  is_starved: false,
                } as MachineTelemetry;
              }
              const isSelected = selectedMachineId === station.id;
              const isFault = live?.status === 'FAULT' || live?.status === 'WARNING';
              const isStarved = live?.is_starved;

              const dotClass = [
                'f3d-dock-dot',
                isFault ? 'dot-fault' : isStarved ? 'dot-starved' : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={station.id}
                  onClick={() => focusStation(station.id)}
                  className={`f3d-dock-item ${isSelected ? 'active' : ''} ${station.id === 'CNC-02' ? 'parallel-dock' : ''}`}
                  title={`Select ${station.name}`}
                >
                  <div className={dotClass} />
                  <div>
                    <div className="f3d-dock-id">
                      <span>{station.id}</span>
                      {station.id === 'CNC-02' && <span className="f3d-dock-badge-dual">DUAL</span>}
                    </div>
                    <div className="f3d-dock-role">{station.role}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
