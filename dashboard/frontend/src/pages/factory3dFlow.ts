import * as THREE from 'three';
import type { MachineTelemetry, ProductionToken } from '../types';
import { INDUSTRIAL_PALETTE, type FactoryMaterials } from './factory3dModels';

export type WorkpieceState =
  | 'moving'
  | 'queued'
  | 'processing'
  | 'diverting'
  | 'palletizing'
  | 'palletized';

export interface Workpiece {
  id: string;
  x: number;
  y: number;
  z: number;
  state: WorkpieceState;
  speed: number;
  currentStationIndex: number;
  targetStationIndex: number;
  isDefective: boolean;
  parallelBranch?: boolean; // When true, routed along parallel spur to CNC-02 at z = 5.5
  divertProgress: number; // 0 to 1 when deflecting down scrap chute
  palletizeProgress: number; // 0 to 1 when gantry picks and palletizes
  processElapsed: number; // local cycle time tracker
  mesh: THREE.Group;
  blankMesh: THREE.Mesh;
  milledMesh: THREE.Mesh;
  weldedMesh: THREE.Mesh;
  inspectedMesh: THREE.Mesh;
  cartonMesh: THREE.Mesh;
}

export interface StationLayout {
  id: string;
  name: string;
  index: number;
  xPos: number;
  bufferStopX: number;
  exitX: number;
}

export const STATIONS_LAYOUT: StationLayout[] = [
  { id: 'STAMPING-01', name: 'Stamping Press', index: 0, xPos: -20, bufferStopX: -21.4, exitX: -18.6 },
  { id: 'CNC-01', name: '5-Axis CNC Mill', index: 1, xPos: -10, bufferStopX: -11.4, exitX: -8.6 },
  { id: 'WELDING-01', name: 'Robotic Weld Cell', index: 2, xPos: 0, bufferStopX: -1.4, exitX: 1.4 },
  { id: 'INSPECTION-01', name: 'Optical QA Tunnel', index: 3, xPos: 10, bufferStopX: 8.6, exitX: 11.4 },
  { id: 'PACKAGING-01', name: 'Palletizing Gantry', index: 4, xPos: 20, bufferStopX: 18.6, exitX: 21.4 },
];

export interface GantryKinematicNodes {
  carriage?: THREE.Object3D;
  mast?: THREE.Object3D;
  gripper?: THREE.Object3D;
}

export class PartsFlowManager {
  private scene: THREE.Scene;
  private mats: FactoryMaterials;
  public workpieces: Workpiece[] = [];
  private lastCounts: Record<string, number> = {};
  public stationOccupied: boolean[] = [false, false, false, false, false];
  public stationBlocked: boolean[] = [false, false, false, false, false];
  public stationStarved: boolean[] = [false, false, false, false, false];
  public stationFaulted: boolean[] = [false, false, false, false, false];
  public stationWip: number[] = [0, 0, 0, 0, 0];
  public parallelCncActive = false;
  public cnc2Occupied = false;
  private nextBranchParallel = false;
  private diverterGateAngle = 0;
  private targetDiverterAngle = 0;
  private workpieceCounter = 0;
  private baseConveyorSpeed = 2.2; // meters / sec
  public gantryTargetZ = 0;
  public gantryTargetY = 0;
  private palletCartonCount = 0;

  constructor(scene: THREE.Scene, mats: FactoryMaterials) {
    this.scene = scene;
    this.mats = mats;
    this.initializeBaselineWorkpieces();
  }

  public setParallelCncActive(active: boolean) {
    this.parallelCncActive = active;
    if (!active) {
      this.cnc2Occupied = false;
      // Re-route any parts on parallel branch back to main
      this.workpieces.forEach(w => {
        if (w.x < -18) {
          w.parallelBranch = false;
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Build Multi-Stage Workpiece Mesh Group (Visual Morphing along the Line)
  // ---------------------------------------------------------------------------
  private createWorkpieceMesh(): {
    group: THREE.Group;
    blank: THREE.Mesh;
    milled: THREE.Mesh;
    welded: THREE.Mesh;
    inspected: THREE.Mesh;
    carton: THREE.Mesh;
  } {
    const group = new THREE.Group();

    // 1. Stage 0: Stamped Sheet Blank (Thin cold-rolled steel plate)
    const blankGeo = new THREE.BoxGeometry(0.55, 0.10, 0.45);
    const blankMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.85,
      roughness: 0.35,
    });
    const blank = new THREE.Mesh(blankGeo, blankMat);
    blank.position.y = 0.05;
    blank.castShadow = true;
    group.add(blank);

    // 2. Stage 1: Precision CNC Milled Component (Pocketed billet housing)
    const milledGroup = new THREE.Group();
    const milledBaseGeo = new THREE.BoxGeometry(0.55, 0.22, 0.45);
    const milledBase = new THREE.Mesh(milledBaseGeo, this.mats.groundSteel);
    milledBase.position.y = 0.11;
    milledBase.castShadow = true;
    milledGroup.add(milledBase);

    // Bored center pocket
    const boreGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 16);
    const boreMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
    const bore = new THREE.Mesh(boreGeo, boreMat);
    bore.position.y = 0.18;
    milledGroup.add(bore);
    milledGroup.visible = false;
    group.add(milledGroup as unknown as THREE.Mesh);

    // 3. Stage 2: Structural Welded Assembly (With bracket & copper weld seams)
    const weldedGroup = new THREE.Group();
    const weldedBase = new THREE.Mesh(milledBaseGeo, this.mats.groundSteel);
    weldedBase.position.y = 0.11;
    weldedBase.castShadow = true;
    weldedGroup.add(weldedBase);

    // Welded vertical bracket upright
    const bracketGeo = new THREE.BoxGeometry(0.12, 0.26, 0.35);
    const bracket = new THREE.Mesh(bracketGeo, this.mats.accentCopper);
    bracket.position.set(-0.16, 0.24, 0);
    weldedGroup.add(bracket);

    // Dark heat-affected weld bead seam
    const beadGeo = new THREE.BoxGeometry(0.04, 0.05, 0.36);
    const beadMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.65 });
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.position.set(-0.1, 0.13, 0);
    weldedGroup.add(bead);
    weldedGroup.visible = false;
    group.add(weldedGroup as unknown as THREE.Mesh);

    // 4. Stage 3: Inspected QA-Verified Assembly (Laser pass mark)
    const inspectedGroup = new THREE.Group();
    const inspectedBase = new THREE.Mesh(milledBaseGeo, this.mats.groundSteel);
    inspectedBase.position.y = 0.11;
    inspectedBase.castShadow = true;
    inspectedGroup.add(inspectedBase);

    const inspectedBracket = new THREE.Mesh(bracketGeo, this.mats.accentCopper);
    inspectedBracket.position.set(-0.16, 0.24, 0);
    inspectedGroup.add(inspectedBracket);

    // Green QA Pass Indicator Ring
    const qaRingGeo = new THREE.RingGeometry(0.04, 0.08, 16);
    const qaRingMat = new THREE.MeshBasicMaterial({ color: 0x4a7c59, side: THREE.DoubleSide });
    const qaRing = new THREE.Mesh(qaRingGeo, qaRingMat);
    qaRing.rotation.x = -Math.PI / 2;
    qaRing.position.set(0.12, 0.23, 0);
    inspectedGroup.add(qaRing);
    inspectedGroup.visible = false;
    group.add(inspectedGroup as unknown as THREE.Mesh);

    // 5. Stage 4: Packaged Corrugated Shipping Carton
    const cartonGeo = new THREE.BoxGeometry(0.62, 0.44, 0.52);
    const carton = new THREE.Mesh(cartonGeo, this.mats.cardboardBox);
    carton.position.y = 0.22;
    carton.castShadow = true;

    // Sealing tape seam
    const tapeGeo = new THREE.BoxGeometry(0.63, 0.01, 0.06);
    const tapeMat = new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.cardboardTape,
      roughness: 0.6,
    });
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.y = 0.445;
    carton.add(tape);

    carton.visible = false;
    group.add(carton);

    return {
      group,
      blank,
      milled: milledGroup as unknown as THREE.Mesh,
      welded: weldedGroup as unknown as THREE.Mesh,
      inspected: inspectedGroup as unknown as THREE.Mesh,
      carton,
    };
  }

  // ---------------------------------------------------------------------------
  // Spawn a Workpiece with explicit Station Tracking
  // ---------------------------------------------------------------------------
  public spawnWorkpiece(
    x: number,
    state: WorkpieceState = 'moving',
    currentStationIndex = -1,
    targetStationIndex = 0,
    isDefective = false
  ): Workpiece {
    this.workpieceCounter += 1;
    const meshes = this.createWorkpieceMesh();
    meshes.group.position.set(x, 1.25, 0);
    this.scene.add(meshes.group);

    const wp: Workpiece = {
      id: `wp-${this.workpieceCounter}`,
      x,
      y: 1.25,
      z: 0,
      state,
      speed: this.baseConveyorSpeed,
      currentStationIndex,
      targetStationIndex,
      isDefective,
      divertProgress: 0,
      palletizeProgress: 0,
      processElapsed: 0,
      mesh: meshes.group,
      blankMesh: meshes.blank,
      milledMesh: meshes.milled,
      weldedMesh: meshes.welded,
      inspectedMesh: meshes.inspected,
      cartonMesh: meshes.carton,
    };

    this.updateWorkpieceVisuals(wp);
    this.workpieces.push(wp);
    return wp;
  }

  // ---------------------------------------------------------------------------
  // Initialize Authentic Realistic Distribution of Workpieces
  // ---------------------------------------------------------------------------
  private initializeBaselineWorkpieces() {
    // 1. Infeed approaching Stamping
    this.spawnWorkpiece(-24.5, 'moving', -1, 0);

    // 2. In Stamping Press
    this.spawnWorkpiece(-20.0, 'processing', 0, 1);
    this.stationOccupied[0] = true;

    // 3. In transit from Stamping to CNC
    this.spawnWorkpiece(-15.5, 'moving', 0, 1);

    // 4. Queued at CNC Buffer Stop
    this.spawnWorkpiece(-11.4, 'queued', 0, 1);

    // 5. In CNC Machining Center
    this.spawnWorkpiece(-10.0, 'processing', 1, 2);
    this.stationOccupied[1] = true;

    // 6. In transit from CNC to Welding
    this.spawnWorkpiece(-5.0, 'moving', 1, 2);

    // 7. In Welding Robot Cell
    this.spawnWorkpiece(0.0, 'processing', 2, 3);
    this.stationOccupied[2] = true;

    // 8. In transit from Welding to Inspection
    this.spawnWorkpiece(5.0, 'moving', 2, 3);

    // 9. In Inspection Optical Tunnel
    this.spawnWorkpiece(10.0, 'processing', 3, 4);
    this.stationOccupied[3] = true;

    // 10. In transit from Inspection to Packaging
    this.spawnWorkpiece(15.0, 'moving', 3, 4);

    // 11. At Packaging Station
    this.spawnWorkpiece(20.0, 'processing', 4, 5);
    this.stationOccupied[4] = true;
  }

  // ---------------------------------------------------------------------------
  // Update Visual Sub-Meshes based on X Coordinate along the Line
  // ---------------------------------------------------------------------------
  private updateWorkpieceVisuals(wp: Workpiece) {
    const x = wp.x;

    wp.blankMesh.visible = x < -10;
    wp.milledMesh.visible = x >= -10 && x < 0;
    wp.weldedMesh.visible = x >= 0 && x < 10;
    wp.inspectedMesh.visible = x >= 10 && x < 20;
    wp.cartonMesh.visible = x >= 20;

    // If marked as defective at/after Inspection
    if (wp.isDefective && x >= 10 && wp.inspectedMesh.visible) {
      const ring = wp.inspectedMesh.children.find(c => c instanceof THREE.Mesh && (c.material as THREE.MeshBasicMaterial).color) as THREE.Mesh | undefined;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.color.setHex(0xb85c4a); // Error red
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Synchronize with Live Telemetry (Delta production, WIP queues, Faults)
  // ---------------------------------------------------------------------------
  public updateFromTelemetry(
    machines: MachineTelemetry[] | undefined,
    tokens?: ProductionToken[]
  ) {
    if (!machines || machines.length === 0) return;

    machines.forEach(m => {
      const st = STATIONS_LAYOUT.find(s => s.id === m.machine_id);
      if (!st) return;

      const idx = st.index;
      const isFaulted = m.status === 'FAULT' || m.status === 'OFFLINE';
      const isBlocked = !!m.is_blocked;
      const isStarved = !!m.is_starved;

      this.stationBlocked[idx] = isBlocked;
      this.stationStarved[idx] = isStarved;
      this.stationFaulted[idx] = isFaulted;
      this.stationWip[idx] = m.wip_count ?? 0;

      const prevCount = this.lastCounts[m.machine_id];
      const currentCount = m.production_count;

      if (prevCount !== undefined && currentCount > prevCount) {
        const delta = Math.min(currentCount - prevCount, 3);
        this.handleMachineProduction(idx, delta);
      }

      this.lastCounts[m.machine_id] = currentCount;
    });

    // Check recent production tokens for quality defects
    if (tokens && tokens.length > 0) {
      const recentFail = tokens.find(t => t.quality === 'fail');
      if (recentFail) {
        // Flag workpiece heading towards or currently at Inspection
        const candidate = this.workpieces.find(
          w => w.x >= 0 && w.x <= 11.0 && !w.isDefective && w.state !== 'diverting' && w.state !== 'palletized'
        );
        if (candidate) {
          candidate.isDefective = true;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Smoothly Advance Finished Workpiece Downstream without Teleportation
  // ---------------------------------------------------------------------------
  private handleMachineProduction(stationIdx: number, delta: number) {
    const station = STATIONS_LAYOUT[stationIdx];
    if (!station) return;

    for (let d = 0; d < delta; d++) {
      // 1. Release the workpiece currently inside this station
      const inStationWp = this.workpieces.find(
        w => w.currentStationIndex === stationIdx && w.state === 'processing'
      );

      if (inStationWp) {
        inStationWp.state = 'moving';
        inStationWp.targetStationIndex = stationIdx + 1;
        this.stationOccupied[stationIdx] = false;
        // Do NOT teleport `w.x`! Workpiece smoothly rolls forward at conveyor speed.
      }

      // 2. If STAMPING-01 produces, replenish a fresh cold-rolled blank on infeed
      if (stationIdx === 0) {
        const infeedWp = this.workpieces.find(w => w.x < -23.5);
        if (!infeedWp) {
          this.spawnWorkpiece(-25.5, 'moving', -1, 0);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Master Kinematics & Physics Loop (Runs each animation frame)
  // ---------------------------------------------------------------------------
  public update(
    delta: number,
    diverterMesh?: THREE.Object3D,
    gantryNodes?: GantryKinematicNodes
  ) {
    const dt = Math.min(delta, 0.08);
    const speed = this.baseConveyorSpeed;
    const safeGap = 0.95; // Minimum physical spacing between consecutive workpieces

    // Animate reject diverter gate swing arm
    if (diverterMesh) {
      this.diverterGateAngle = THREE.MathUtils.lerp(
        this.diverterGateAngle,
        this.targetDiverterAngle,
        dt * 6.0
      );
      diverterMesh.rotation.y = this.diverterGateAngle;
    }

    // Animate Packaging Gantry Mast and Carriage
    if (gantryNodes) {
      if (gantryNodes.carriage) {
        gantryNodes.carriage.position.z = THREE.MathUtils.lerp(
          gantryNodes.carriage.position.z,
          this.gantryTargetZ,
          dt * 3.5
        );
      }
      if (gantryNodes.mast) {
        gantryNodes.mast.position.y = THREE.MathUtils.lerp(
          gantryNodes.mast.position.y,
          this.gantryTargetY,
          dt * 4.0
        );
      }
    }

    // Sort workpieces by X descending (furthest downstream first for collision resolution)
    this.workpieces.sort((a, b) => b.x - a.x);

    // Track active station occupancies
    for (let i = 0; i < STATIONS_LAYOUT.length; i++) {
      this.stationOccupied[i] = this.workpieces.some(
        w => w.currentStationIndex === i && w.state === 'processing'
      );
    }

    let hasActiveDivertingPart = false;

    for (let i = 0; i < this.workpieces.length; i++) {
      const wp = this.workpieces[i];

      // Route alternating workpieces to parallel spur when parallel CNC is active
      if (this.parallelCncActive && wp.parallelBranch === undefined && wp.x >= -18.6 && wp.x <= -16.5) {
        wp.parallelBranch = this.nextBranchParallel;
        this.nextBranchParallel = !this.nextBranchParallel;
      }

      // 0. In-station processing progression
      if (wp.state === 'processing') {
        wp.processElapsed += dt;

        // Auto-discharge defective parts at Inspection
        if (wp.currentStationIndex === 3 && wp.isDefective && wp.processElapsed >= 0.8) {
          wp.state = 'moving';
          wp.targetStationIndex = 4;
          this.stationOccupied[3] = false;
        }

        // CNC-02 parallel station processing completion
        if (wp.parallelBranch && wp.currentStationIndex === 1 && wp.processElapsed >= 1.8) {
          wp.state = 'moving';
          wp.targetStationIndex = 2; // Move to Welding
          this.cnc2Occupied = false;
        }

        // When parallel CNC is active, CNC-01 also paces in cadence
        if (this.parallelCncActive && !wp.parallelBranch && wp.currentStationIndex === 1 && wp.processElapsed >= 1.8) {
          wp.state = 'moving';
          wp.targetStationIndex = 2;
          this.stationOccupied[1] = false;
        }
      }

      // 1. Defective Scrap Diverter Kinematics
      if (wp.state === 'diverting') {
        hasActiveDivertingPart = true;
        wp.divertProgress += dt * 1.5;
        wp.x += dt * 0.85;
        wp.z = THREE.MathUtils.lerp(0, 1.8, Math.min(wp.divertProgress, 1.0));
        wp.y = THREE.MathUtils.lerp(1.25, 0.45, Math.min(wp.divertProgress, 1.0));
        wp.mesh.rotation.x += dt * 2.8;
        wp.mesh.position.set(wp.x, wp.y, wp.z);
        continue;
      }

      // 2. Palletizing Cartesian Pick-and-Place Kinematics
      if (wp.state === 'palletizing') {
        wp.palletizeProgress += dt * 0.7;

        if (wp.palletizeProgress < 0.28) {
          // Phase 1: Gantry mast lowers to conveyor carton
          this.gantryTargetZ = 0;
          this.gantryTargetY = -0.55;
          wp.y = 1.25;
          wp.z = 0;
        } else if (wp.palletizeProgress < 0.62) {
          // Phase 2: Mast lifts carton, carriage traverses across Z to Euro-pallet
          const t = (wp.palletizeProgress - 0.28) / 0.34;
          this.gantryTargetY = THREE.MathUtils.lerp(-0.55, 0.45, t);
          this.gantryTargetZ = THREE.MathUtils.lerp(0, 1.6, t);
          wp.z = this.gantryTargetZ;
          wp.y = THREE.MathUtils.lerp(1.25, 2.3, t);
        } else if (wp.palletizeProgress < 0.92) {
          // Phase 3: Mast lowers carton onto Euro-pallet stack
          const t = (wp.palletizeProgress - 0.62) / 0.30;
          this.gantryTargetY = THREE.MathUtils.lerp(0.45, -0.35, t);
          this.gantryTargetZ = 1.6;
          wp.z = 1.6;
          wp.y = THREE.MathUtils.lerp(2.3, 0.55, t);
        } else {
          // Phase 4: Carton seated on pallet, mast retracts to ready
          this.gantryTargetY = 0;
          this.gantryTargetZ = 0;
          wp.y = 0.55;
          wp.z = 1.6;
          wp.state = 'palletized';
          this.stationOccupied[4] = false;
          this.palletCartonCount += 1;
        }

        wp.mesh.position.set(wp.x, wp.y, wp.z);
        continue;
      }

      // 3. Resting on Pallet
      if (wp.state === 'palletized') {
        continue;
      }

      // 4. Moving or Queued on Conveyor Line
      // Forward spacing limit from preceding workpiece ahead (respecting dual tracks)
      let forwardLimitX = 26.5;
      if (i > 0) {
        const ahead = this.workpieces.slice(0, i).reverse().find(w => {
          if (w.state === 'diverting' || w.state === 'palletized') return false;
          // If this workpiece is on the parallel spur:
          if (wp.parallelBranch && wp.x >= -18.0 && wp.x < -2.0) {
            return w.parallelBranch && w.x >= -18.0 && w.x < -2.0;
          }
          // If on main line between -18 and -2:
          if (!wp.parallelBranch && wp.x >= -18.0 && wp.x < -2.0) {
            return !w.parallelBranch && w.x >= -18.0 && w.x < -2.0;
          }
          return true;
        });
        if (ahead) {
          forwardLimitX = ahead.x - safeGap;
        }
      }

      // Check upcoming target station stop line
      if (wp.targetStationIndex < STATIONS_LAYOUT.length) {
        const nextStation = STATIONS_LAYOUT[wp.targetStationIndex];
        if (nextStation.index === 1 && wp.parallelBranch) {
          // CNC-02 spur buffer stop
          if (this.cnc2Occupied || this.stationFaulted[1]) {
            forwardLimitX = Math.min(forwardLimitX, nextStation.bufferStopX);
          }
        } else {
          // Standard station buffer stop
          const isOccupied = this.stationOccupied[nextStation.index];
          const isBlocked = this.stationBlocked[nextStation.index];
          const isFaulted = this.stationFaulted[nextStation.index];

          if (isOccupied || isBlocked || isFaulted) {
            forwardLimitX = Math.min(forwardLimitX, nextStation.bufferStopX);
          }
        }
      }

      // Move workpiece forward along conveyor
      if (wp.state === 'moving' || wp.state === 'queued') {
        const nextX = wp.x + speed * dt;

        if (nextX >= forwardLimitX) {
          wp.x = forwardLimitX;
          wp.state = 'queued';
        } else {
          wp.x = nextX;
          wp.state = 'moving';

          // Check entry into target station center
          if (wp.targetStationIndex < STATIONS_LAYOUT.length) {
            const targetStation = STATIONS_LAYOUT[wp.targetStationIndex];

            // If target is CNC (Station 1) and workpiece is on parallel spur -> CNC-02
            if (targetStation.index === 1 && wp.parallelBranch) {
              if (
                Math.abs(wp.x - (-10.0)) < 0.18 &&
                !this.cnc2Occupied &&
                !this.stationFaulted[1]
              ) {
                wp.x = -10.0;
                wp.state = 'processing';
                wp.currentStationIndex = 1;
                this.cnc2Occupied = true;
                wp.processElapsed = 0;
              }
            } else if (
              Math.abs(wp.x - targetStation.xPos) < 0.16 &&
              !this.stationOccupied[targetStation.index] &&
              !this.stationFaulted[targetStation.index] &&
              (!wp.parallelBranch || targetStation.index !== 1)
            ) {
              wp.x = targetStation.xPos;
              wp.state = 'processing';
              wp.currentStationIndex = targetStation.index;
              this.stationOccupied[targetStation.index] = true;
              wp.processElapsed = 0;

              // If reached Packaging station (Station 4)
              if (targetStation.index === 4) {
                wp.state = 'palletizing';
                wp.palletizeProgress = 0;
              }
            }
          }
        }

        // Kinematic trajectory curves for parallel spur routing
        if (wp.parallelBranch) {
          if (wp.x >= -18.0 && wp.x < -15.0) {
            // Diverging into infeed spur
            const t = Math.min(Math.max((wp.x - (-18.0)) / 3.0, 0), 1);
            wp.z = THREE.MathUtils.lerp(0, 5.5, t);
            wp.mesh.rotation.y = Math.sin(t * Math.PI) * 0.45;
          } else if (wp.x >= -15.0 && wp.x < -5.0) {
            // Straight run through CNC-02
            wp.z = 5.5;
            wp.mesh.rotation.y = 0;
          } else if (wp.x >= -5.0 && wp.x < -2.0) {
            // Merging back from outfeed spur to main conveyor
            const t = Math.min(Math.max((wp.x - (-5.0)) / 3.0, 0), 1);
            wp.z = THREE.MathUtils.lerp(5.5, 0, t);
            wp.mesh.rotation.y = -Math.sin(t * Math.PI) * 0.45;
          } else if (wp.x >= -2.0) {
            // Back on main conveyor
            wp.z = 0;
            wp.parallelBranch = false;
            wp.mesh.rotation.y = 0;
          }
        } else {
          wp.z = 0;
          wp.mesh.rotation.y = 0;
        }

        // Check arrival at Diverter Gate (Inspection rejection at x = 11.4 to 11.8)
        if (wp.isDefective && wp.x >= 11.4 && wp.x <= 11.8) {
          wp.state = 'diverting';
          wp.divertProgress = 0;
          this.targetDiverterAngle = Math.PI / 4;
          hasActiveDivertingPart = true;
        }
      }

      wp.mesh.position.set(wp.x, wp.y, wp.z);
      this.updateWorkpieceVisuals(wp);
    }

    // Diverter gate returns to closed once diverted part clears
    if (!hasActiveDivertingPart && this.targetDiverterAngle > 0) {
      this.targetDiverterAngle = 0;
    }

    // Cleanup finished goods or fallen diverted scrap
    for (let i = this.workpieces.length - 1; i >= 0; i--) {
      const wp = this.workpieces[i];
      if (wp.divertProgress >= 1.0 || (wp.state === 'palletized' && this.palletCartonCount > 4)) {
        this.scene.remove(wp.mesh);
        this.workpieces.splice(i, 1);
        if (wp.state === 'palletized') {
          this.palletCartonCount -= 1;
        }
      } else if (wp.x > 26.5) {
        this.scene.remove(wp.mesh);
        this.workpieces.splice(i, 1);
      }
    }

    // Infeed replenisher: ensure infeed has parts approaching Stamping when running
    const stampingFaulted = this.stationFaulted[0];
    const stampingBlocked = this.stationBlocked[0];
    const infeedCount = this.workpieces.filter(w => w.x < -21.4).length;
    const maxInfeed = this.parallelCncActive ? 3 : 2;
    if (!stampingFaulted && !stampingBlocked && infeedCount < maxInfeed) {
      const lastInfeedWp = this.workpieces.filter(w => w.x < -21.4).sort((a, b) => a.x - b.x)[0];
      const minDistance = this.parallelCncActive ? -23.6 : -24.5;
      if (!lastInfeedWp || lastInfeedWp.x > minDistance) {
        this.spawnWorkpiece(-25.5, 'moving', -1, 0);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dispose all 3D meshes on page unload
  // ---------------------------------------------------------------------------
  public dispose() {
    this.workpieces.forEach(wp => {
      this.scene.remove(wp.mesh);
    });
    this.workpieces = [];
  }
}
