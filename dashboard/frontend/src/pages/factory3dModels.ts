import * as THREE from 'three';

// -----------------------------------------------------------------------------
// Authentic Industrial Color Palette (Workspace Design System & RAL Standards)
// -----------------------------------------------------------------------------
export const INDUSTRIAL_PALETTE = {
  // Machine Enclosure & Sheet Metal (RAL 7035 Light Grey)
  sheetMetalLight: 0xd8dde2,
  sheetMetalMedium: 0x94a3b8,
  // Cast Iron & Heavy Structural Frames (RAL 7016 Anthracite Grey)
  anthracite: 0x2f353b,
  castIronDark: 0x22272c,
  // Workspace Accent Colors (from dashboard index.css)
  accentBlue: 0x5b7b94,      // --accent-blue
  accentBlueMuted: 0x41586a,
  accentCopper: 0xc47b3b,    // --accent-copper
  accentCopperDark: 0x9e5f29,
  // Safety & Hazard Guards (RAL 1021 Safety Yellow)
  safetyYellow: 0xe5a91e,
  safetyYellowDark: 0xb5810f,
  // Ground Precision Steel & Tooling
  groundSteel: 0xdde3ea,
  darkSteel: 0x475569,
  bronzeBushing: 0xcd7f32,
  // Factory Floor & Infrastructure
  floorConcrete: 0x22252a,
  walkwayDark: 0x181a1e,
  // Natural Materials
  woodPallet: 0x8f6a45,
  cardboardBox: 0xad8253,
  cardboardTape: 0xc49b6a,
};

// Reusable standard industrial materials
export interface FactoryMaterials {
  castIron: THREE.MeshStandardMaterial;
  sheetMetalLight: THREE.MeshStandardMaterial;
  sheetMetalMedium: THREE.MeshStandardMaterial;
  anthracite: THREE.MeshStandardMaterial;
  safetyYellow: THREE.MeshStandardMaterial;
  groundSteel: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  accentBlue: THREE.MeshStandardMaterial;
  accentCopper: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  safetyCurtain: THREE.MeshPhysicalMaterial;
  safetyGlass: THREE.MeshPhysicalMaterial;
  darkRubber: THREE.MeshStandardMaterial;
  woodPallet: THREE.MeshStandardMaterial;
  cardboardBox: THREE.MeshStandardMaterial;
}

export function createFactoryMaterials(): FactoryMaterials {
  return {
    castIron: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.castIronDark,
      roughness: 0.7,
      metalness: 0.45,
    }),
    sheetMetalLight: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.sheetMetalLight,
      roughness: 0.38,
      metalness: 0.32,
    }),
    sheetMetalMedium: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.sheetMetalMedium,
      roughness: 0.45,
      metalness: 0.5,
    }),
    anthracite: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.anthracite,
      roughness: 0.55,
      metalness: 0.4,
    }),
    safetyYellow: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.safetyYellow,
      roughness: 0.4,
      metalness: 0.15,
    }),
    groundSteel: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.groundSteel,
      roughness: 0.18,
      metalness: 0.92,
    }),
    darkSteel: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.darkSteel,
      roughness: 0.4,
      metalness: 0.7,
    }),
    accentBlue: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.accentBlue,
      roughness: 0.42,
      metalness: 0.35,
    }),
    accentCopper: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.accentCopper,
      roughness: 0.35,
      metalness: 0.7,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.bronzeBushing,
      roughness: 0.3,
      metalness: 0.8,
    }),
    safetyCurtain: new THREE.MeshPhysicalMaterial({
      color: 0xc47b3b,
      transparent: true,
      opacity: 0.32,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0.65,
    }),
    safetyGlass: new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.85,
    }),
    darkRubber: new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.9,
      metalness: 0.05,
    }),
    woodPallet: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.woodPallet,
      roughness: 0.88,
      metalness: 0.02,
    }),
    cardboardBox: new THREE.MeshStandardMaterial({
      color: INDUSTRIAL_PALETTE.cardboardBox,
      roughness: 0.82,
      metalness: 0.04,
    }),
  };
}

export interface BeaconRefs {
  red: THREE.Mesh;
  amber: THREE.Mesh;
  green: THREE.Mesh;
  light: THREE.PointLight;
}

export interface BuiltMachineNodes {
  stampingRam?: THREE.Object3D;
  cncSpindle?: THREE.Object3D;
  cncTable?: THREE.Object3D;
  cncSpindle2?: THREE.Object3D;
  cncTable2?: THREE.Object3D;
  weldingArmUpper?: THREE.Object3D;
  weldingArmFore?: THREE.Object3D;
  weldingTorch?: THREE.Object3D;
  weldingLight?: THREE.PointLight;
  weldingSparks?: THREE.Group;
  inspectionLaser?: THREE.Mesh;
  inspectionDiverter?: THREE.Object3D;
  packagingCarriage?: THREE.Object3D;
  packagingMast?: THREE.Object3D;
  packagingGripper?: THREE.Object3D;
  beacons: Record<string, BeaconRefs>;
  machineRoots: Record<string, THREE.Group>;
}

// -----------------------------------------------------------------------------
// Helper: Build Standard Andon Status Tower (Red, Amber, Green)
// -----------------------------------------------------------------------------
export function buildAndonTower(
  parent: THREE.Group,
  x: number,
  z: number,
  stationId: string,
  mats: FactoryMaterials,
  outNodes: BuiltMachineNodes
) {
  const towerGroup = new THREE.Group();
  towerGroup.position.set(x, 0, z);

  // Structural Mast
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.8, 16);
  const pole = new THREE.Mesh(poleGeo, mats.darkSteel);
  pole.position.y = 1.9;
  pole.castShadow = true;
  towerGroup.add(pole);

  // Audible Siren Dome on Top
  const sirenGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.14, 16);
  const siren = new THREE.Mesh(sirenGeo, mats.anthracite);
  siren.position.y = 3.92;
  towerGroup.add(siren);

  // Stack Beacon Lenses (Red, Amber, Green)
  const beaconGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.22, 16);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0x450a0a,
    emissive: 0x000000,
    roughness: 0.25,
  });
  const redMesh = new THREE.Mesh(beaconGeo, redMat);
  redMesh.position.y = 3.65;
  towerGroup.add(redMesh);

  const amberMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    emissive: 0x000000,
    roughness: 0.25,
  });
  const amberMesh = new THREE.Mesh(beaconGeo, amberMat);
  amberMesh.position.y = 3.38;
  towerGroup.add(amberMesh);

  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x052e16,
    emissive: 0x000000,
    roughness: 0.25,
  });
  const greenMesh = new THREE.Mesh(beaconGeo, greenMat);
  greenMesh.position.y = 3.11;
  towerGroup.add(greenMesh);

  // Local Point Light for Beacon Glow
  const beaconLight = new THREE.PointLight(0x4a7c59, 1.4, 7.5, 1.8);
  beaconLight.position.set(0, 3.4, 0);
  towerGroup.add(beaconLight);

  parent.add(towerGroup);

  outNodes.beacons[stationId] = {
    red: redMesh,
    amber: amberMesh,
    green: greenMesh,
    light: beaconLight,
  };
}

// -----------------------------------------------------------------------------
// Machine 1: STAMPING-01 (1200-Ton Hydraulic Blank Stamping Press)
// -----------------------------------------------------------------------------
export function buildStampingPress(
  scene: THREE.Scene,
  mats: FactoryMaterials,
  nodes: BuiltMachineNodes
) {
  const group = new THREE.Group();
  group.position.set(-20, 0, 0);
  group.name = 'STAMPING-01';

  // 1. Massive Bed / Anvil Foundation
  const bedGeo = new THREE.BoxGeometry(4.8, 1.0, 3.4);
  const bed = new THREE.Mesh(bedGeo, mats.anthracite);
  bed.position.y = 0.5;
  bed.castShadow = true;
  bed.receiveShadow = true;
  group.add(bed);

  // Bed Floor Anchor Footplates (4 corners)
  const footGeo = new THREE.BoxGeometry(0.6, 0.15, 0.6);
  [
    [-2.2, -1.5],
    [2.2, -1.5],
    [-2.2, 1.5],
    [2.2, 1.5],
  ].forEach(([fx, fz]) => {
    const foot = new THREE.Mesh(footGeo, mats.darkSteel);
    foot.position.set(fx, 0.075, fz);
    group.add(foot);
  });

  // Precision Bolster Plate with Milled T-Slots
  const bolsterGeo = new THREE.BoxGeometry(3.6, 0.22, 2.6);
  const bolster = new THREE.Mesh(bolsterGeo, mats.groundSteel);
  bolster.position.y = 1.06;
  bolster.receiveShadow = true;
  group.add(bolster);

  // Lower Die Shoe Guides (Front and Rear blocks framing conveyor feed plane at y = 1.22)
  const dieGuideGeo = new THREE.BoxGeometry(2.6, 0.24, 0.55);
  const lowerDieFront = new THREE.Mesh(dieGuideGeo, mats.darkSteel);
  lowerDieFront.position.set(0, 1.26, 0.65);
  lowerDieFront.castShadow = true;
  group.add(lowerDieFront);

  const lowerDieRear = new THREE.Mesh(dieGuideGeo, mats.darkSteel);
  lowerDieRear.position.set(0, 1.26, -0.65);
  lowerDieRear.castShadow = true;
  group.add(lowerDieRear);

  // Hardened Stamping Die Nest Wear Plate
  const dieNestGeo = new THREE.BoxGeometry(2.4, 0.04, 0.72);
  const dieNest = new THREE.Mesh(dieNestGeo, mats.groundSteel);
  dieNest.position.set(0, 1.20, 0);
  dieNest.receiveShadow = true;
  group.add(dieNest);

  // 2. 4 Precision Ground Guide Columns (Tie Rods)
  const columnGeo = new THREE.CylinderGeometry(0.22, 0.22, 5.6, 24);
  const colPositions = [
    [-1.9, -1.3],
    [1.9, -1.3],
    [-1.9, 1.3],
    [1.9, 1.3],
  ];

  colPositions.forEach(([cx, cz]) => {
    const column = new THREE.Mesh(columnGeo, mats.groundSteel);
    column.position.set(cx, 3.6, cz);
    column.castShadow = true;
    group.add(column);

    // Heavy Hex Locknuts at Crown Top
    const nutGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 6);
    const nut = new THREE.Mesh(nutGeo, mats.darkSteel);
    nut.position.set(cx, 6.55, cz);
    group.add(nut);
  });

  // 3. Massive Cast Crown Box Beam
  const crownGeo = new THREE.BoxGeometry(5.0, 1.5, 3.6);
  const crown = new THREE.Mesh(crownGeo, mats.anthracite);
  crown.position.y = 5.75;
  crown.castShadow = true;
  group.add(crown);

  // Header Brand Identification Plate
  const brandPlateGeo = new THREE.BoxGeometry(2.6, 0.4, 0.05);
  const brandPlate = new THREE.Mesh(brandPlateGeo, mats.accentBlue);
  brandPlate.position.set(0, 5.75, 1.83);
  group.add(brandPlate);

  // 4. Dual Hydraulic Cylinders & Nitrogen Accumulators
  const cylBarrelGeo = new THREE.CylinderGeometry(0.48, 0.48, 1.8, 24);
  const pistonGeo = new THREE.CylinderGeometry(0.26, 0.26, 2.0, 24);

  [-1.1, 1.1].forEach(hx => {
    const barrel = new THREE.Mesh(cylBarrelGeo, mats.anthracite);
    barrel.position.set(hx, 7.2, 0);
    barrel.castShadow = true;
    group.add(barrel);

    // Chrome Piston Rod
    const piston = new THREE.Mesh(pistonGeo, mats.groundSteel);
    piston.position.set(hx, 5.6, 0);
    group.add(piston);

    // Cylinder Flange Ring
    const flangeGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.12, 24);
    const flange = new THREE.Mesh(flangeGeo, mats.darkSteel);
    flange.position.set(hx, 6.4, 0);
    group.add(flange);
  });

  // Hydraulic Manifold Block & High-Pressure Tubing
  const manifoldGeo = new THREE.BoxGeometry(1.2, 0.5, 0.6);
  const manifold = new THREE.Mesh(manifoldGeo, mats.darkSteel);
  manifold.position.set(0, 6.7, -1.2);
  group.add(manifold);

  // Nitrogen Gas Accumulator Bottles
  const accumGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.1, 16);
  [-0.45, 0.45].forEach(ax => {
    const accum = new THREE.Mesh(accumGeo, mats.castIron);
    accum.position.set(ax, 7.2, -1.2);
    group.add(accum);
  });

  // 5. Animated Moving Slide Platen (Ram)
  const ramGroup = new THREE.Group();
  ramGroup.position.set(0, 3.5, 0);

  const ramPlatenGeo = new THREE.BoxGeometry(3.7, 0.75, 2.5);
  const ramPlaten = new THREE.Mesh(ramPlatenGeo, mats.castIron);
  ramPlaten.castShadow = true;
  ramGroup.add(ramPlaten);

  // Upper Stamping Die Shoe
  const upperDieGeo = new THREE.BoxGeometry(2.5, 0.35, 1.7);
  const upperDie = new THREE.Mesh(upperDieGeo, mats.darkSteel);
  upperDie.position.y = -0.55;
  ramGroup.add(upperDie);

  // Bronze Gib Bushings on Ram Guide Corners
  const bushingGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.78, 24);
  colPositions.forEach(([cx, cz]) => {
    const bushing = new THREE.Mesh(bushingGeo, mats.bronze);
    bushing.position.set(cx, 0, cz);
    ramGroup.add(bushing);
  });

  group.add(ramGroup);
  nodes.stampingRam = ramGroup;

  // 6. Scrap Chute & Sheet Metal Off-Cut Bin
  const chuteGeo = new THREE.BoxGeometry(0.8, 0.1, 1.6);
  const chute = new THREE.Mesh(chuteGeo, mats.sheetMetalMedium);
  chute.rotation.z = 0.45;
  chute.position.set(-2.5, 1.1, -0.6);
  group.add(chute);

  const scrapBinGeo = new THREE.BoxGeometry(1.0, 0.7, 1.2);
  const scrapBin = new THREE.Mesh(scrapBinGeo, mats.anthracite);
  scrapBin.position.set(-3.2, 0.35, -0.6);
  group.add(scrapBin);

  // 7. Safety Light Curtains (Safety Yellow Columns with Optic Windows)
  const curtainPoleGeo = new THREE.BoxGeometry(0.12, 2.6, 0.12);
  const opticStripGeo = new THREE.BoxGeometry(0.04, 2.2, 0.04);
  const opticMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  [-2.1, 2.1].forEach(px => {
    const pole = new THREE.Mesh(curtainPoleGeo, mats.safetyYellow);
    pole.position.set(px, 2.4, 1.55);
    group.add(pole);

    const optic = new THREE.Mesh(opticStripGeo, opticMat);
    optic.position.set(px > 0 ? px - 0.05 : px + 0.05, 2.4, 1.55);
    group.add(optic);
  });

  // 8. Operator HMI Run Station Pedestal
  const hmiPedestalGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
  const hmiPedestal = new THREE.Mesh(hmiPedestalGeo, mats.anthracite);
  hmiPedestal.position.set(-2.8, 0.6, 1.8);
  group.add(hmiPedestal);

  const hmiHeadGeo = new THREE.BoxGeometry(0.6, 0.45, 0.25);
  const hmiHead = new THREE.Mesh(hmiHeadGeo, mats.sheetMetalLight);
  hmiHead.position.set(-2.8, 1.35, 1.8);
  group.add(hmiHead);

  // Dual palm buttons
  const palmBtnGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16);
  [-0.18, 0.18].forEach(bx => {
    const btn = new THREE.Mesh(palmBtnGeo, mats.darkRubber);
    btn.position.set(-2.8 + bx, 1.59, 1.8);
    group.add(btn);
  });

  // E-Stop Mushroom Button
  const estopGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.06, 16);
  const estopMat = new THREE.MeshStandardMaterial({ color: 0xb85c4a, roughness: 0.3 });
  const estop = new THREE.Mesh(estopGeo, estopMat);
  estop.position.set(-2.8, 1.59, 1.9);
  group.add(estop);

  // 9. Andon Status Tower
  buildAndonTower(group, 2.6, -1.8, 'STAMPING-01', mats, nodes);

  scene.add(group);
  nodes.machineRoots['STAMPING-01'] = group;
}

// -----------------------------------------------------------------------------
// Machine 2: CNC Milling Center (Configurable for Primary CNC-01 or Parallel CNC-02)
// -----------------------------------------------------------------------------
export function buildCncMill(
  scene: THREE.Object3D,
  mats: FactoryMaterials,
  nodes: BuiltMachineNodes,
  xOffset = -10,
  zOffset = 0,
  machineId = 'CNC-01',
  machineLabel = 'CNC-01 (5-Axis VMC)'
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(xOffset, 0, zOffset);
  group.name = machineId;

  // 1. Heavy Mineral Cast Bed Foundation
  const baseGeo = new THREE.BoxGeometry(4.2, 0.95, 3.6);
  const base = new THREE.Mesh(baseGeo, mats.anthracite);
  base.position.y = 0.475;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Precision Sheet-Metal Enclosure (RAL 7035 Light Grey)
  // Rear Vertical Machine Column (Houses Z-axis guideways & ATC)
  const columnCastingGeo = new THREE.BoxGeometry(3.8, 3.2, 1.1);
  const columnCasting = new THREE.Mesh(columnCastingGeo, mats.anthracite);
  columnCasting.position.set(0, 2.55, -1.05);
  columnCasting.castShadow = true;
  group.add(columnCasting);

  // Enclosure Roof with Mist Collector
  const roofGeo = new THREE.BoxGeometry(3.9, 0.18, 2.3);
  const roof = new THREE.Mesh(roofGeo, mats.sheetMetalLight);
  roof.position.set(0, 4.15, 0.45);
  group.add(roof);

  // Roof Mist Collector Housing & Exhaust Pipe
  const mistHousingGeo = new THREE.BoxGeometry(1.2, 0.6, 1.2);
  const mistHousing = new THREE.Mesh(mistHousingGeo, mats.anthracite);
  mistHousing.position.set(0.6, 4.54, -0.4);
  group.add(mistHousing);

  const exhaustPipeGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 16);
  const exhaustPipe = new THREE.Mesh(exhaustPipeGeo, mats.sheetMetalMedium);
  exhaustPipe.position.set(0.6, 5.2, -0.4);
  group.add(exhaustPipe);

  // Left Sheet Metal Wall with Conveyor Infeed Tunnel Opening
  const sideUpperGeo = new THREE.BoxGeometry(0.12, 1.85, 2.3);
  const leftUpper = new THREE.Mesh(sideUpperGeo, mats.sheetMetalLight);
  leftUpper.position.set(-1.95, 3.22, 0.45);
  group.add(leftUpper);

  const sideLowerGeo = new THREE.BoxGeometry(0.12, 0.65, 2.3);
  const leftLower = new THREE.Mesh(sideLowerGeo, mats.anthracite);
  leftLower.position.set(-1.95, 0.82, 0.45);
  group.add(leftLower);

  // Left Conveyor Aperture Trim (Safety Yellow Tunnel Portal)
  const portalTrimGeo = new THREE.BoxGeometry(0.14, 0.9, 1.25);
  const leftPortal = new THREE.Mesh(portalTrimGeo, mats.safetyYellow);
  leftPortal.position.set(-1.95, 1.45, 0);
  group.add(leftPortal);

  // Right Sheet Metal Wall with Conveyor Outfeed Tunnel Opening
  const rightUpper = new THREE.Mesh(sideUpperGeo, mats.sheetMetalLight);
  rightUpper.position.set(1.95, 3.22, 0.45);
  group.add(rightUpper);

  const rightLower = new THREE.Mesh(sideLowerGeo, mats.anthracite);
  rightLower.position.set(1.95, 0.82, 0.45);
  group.add(rightLower);

  const rightPortal = new THREE.Mesh(portalTrimGeo, mats.safetyYellow);
  rightPortal.position.set(1.95, 1.45, 0);
  group.add(rightPortal);

  // Front Wall Frame with Large Viewing Window
  const frontPostGeo = new THREE.BoxGeometry(0.65, 3.2, 0.12);
  const frontLeftPost = new THREE.Mesh(frontPostGeo, mats.sheetMetalLight);
  frontLeftPost.position.set(-1.62, 2.55, 1.6);
  group.add(frontLeftPost);

  const frontRightPost = new THREE.Mesh(frontPostGeo, mats.sheetMetalLight);
  frontRightPost.position.set(1.62, 2.55, 1.6);
  group.add(frontRightPost);

  const frontHeaderGeo = new THREE.BoxGeometry(2.6, 0.45, 0.12);
  const frontHeader = new THREE.Mesh(frontHeaderGeo, mats.sheetMetalLight);
  frontHeader.position.set(0, 3.92, 1.6);
  group.add(frontHeader);

  // Accent Blue Stripe across Header
  const stripeGeo = new THREE.BoxGeometry(3.92, 0.12, 0.14);
  const stripe = new THREE.Mesh(stripeGeo, mats.accentBlue);
  stripe.position.set(0, 3.92, 1.61);
  group.add(stripe);

  const frontSillGeo = new THREE.BoxGeometry(2.6, 0.65, 0.12);
  const frontSill = new THREE.Mesh(frontSillGeo, mats.anthracite);
  frontSill.position.set(0, 1.27, 1.6);
  group.add(frontSill);

  // 3. Operator Safety Viewing Window with Polycarbonate Glass
  const windowFrameGeo = new THREE.BoxGeometry(2.55, 2.05, 0.08);
  const windowFrame = new THREE.Mesh(windowFrameGeo, mats.anthracite);
  windowFrame.position.set(0, 2.65, 1.62);
  group.add(windowFrame);

  const windowGlassGeo = new THREE.PlaneGeometry(2.45, 1.95);
  const win = new THREE.Mesh(windowGlassGeo, mats.safetyGlass);
  win.position.set(0, 2.65, 1.67);
  group.add(win);

  // Sliding Door Stainless Steel Recessed Handle
  const handleGeo = new THREE.BoxGeometry(0.08, 0.8, 0.05);
  const handle = new THREE.Mesh(handleGeo, mats.groundSteel);
  handle.position.set(1.1, 2.65, 1.71);
  group.add(handle);

  // 4. Internal Work Chamber Illumination (Neutral LED Worklight)
  const workLight = new THREE.PointLight(0xfff7ed, 1.6, 6.0, 1.8);
  workLight.position.set(0, 3.8, 0.1);
  group.add(workLight);

  // 5. 5-Axis Trunnion Rotary Work Table & Pneumatic Vise (machining zone at conveyor level)
  const tableAssembly = new THREE.Group();
  tableAssembly.position.set(0, 1.05, 0);

  // Base Saddle Casting
  const saddleGeo = new THREE.BoxGeometry(1.6, 0.22, 1.1);
  const saddle = new THREE.Mesh(saddleGeo, mats.anthracite);
  tableAssembly.add(saddle);

  // Rotary Platter with T-Slots
  const platterGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.12, 32);
  const platter = new THREE.Mesh(platterGeo, mats.groundSteel);
  platter.position.y = 0.16;
  tableAssembly.add(platter);

  // Hardened Precision Milling Vise Jaws framing Conveyor Workpiece Bed
  const viseJawGeo = new THREE.BoxGeometry(0.85, 0.24, 0.22);
  const viseFront = new THREE.Mesh(viseJawGeo, mats.darkSteel);
  viseFront.position.set(0, 0.32, 0.42);
  tableAssembly.add(viseFront);

  const viseRear = new THREE.Mesh(viseJawGeo, mats.darkSteel);
  viseRear.position.set(0, 0.32, -0.42);
  tableAssembly.add(viseRear);

  // Hardened steel fixture bed
  const fixBedGeo = new THREE.BoxGeometry(0.85, 0.04, 0.62);
  const fixBed = new THREE.Mesh(fixBedGeo, mats.groundSteel);
  fixBed.position.set(0, 0.18, 0);
  tableAssembly.add(fixBed);

  group.add(tableAssembly);
  if (machineId === 'CNC-02') {
    nodes.cncTable2 = tableAssembly;
  } else {
    nodes.cncTable = tableAssembly;
  }

  // 6. High-Speed Direct-Drive Spindle Head Assembly
  const spindleAssembly = new THREE.Group();
  spindleAssembly.position.set(0, 3.1, 0);

  // Rigid Spindle Carriage Casting
  const carriageGeo = new THREE.BoxGeometry(1.1, 1.2, 1.1);
  const carriage = new THREE.Mesh(carriageGeo, mats.anthracite);
  spindleAssembly.add(carriage);

  // Spindle Cartridge
  const cartridgeGeo = new THREE.CylinderGeometry(0.36, 0.3, 0.8, 24);
  const cartridge = new THREE.Mesh(cartridgeGeo, mats.groundSteel);
  cartridge.position.y = -0.5;
  spindleAssembly.add(cartridge);

  // Spinning Chuck & End Mill
  const spinNode = new THREE.Group();
  spinNode.position.y = -0.9;

  const chuckGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16);
  const chuck = new THREE.Mesh(chuckGeo, mats.darkSteel);
  spinNode.add(chuck);

  const cutterGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12);
  const cutterMat = new THREE.MeshStandardMaterial({
    color: 0xc47b3b,
    metalness: 0.95,
    roughness: 0.15,
  });
  const cutter = new THREE.Mesh(cutterGeo, cutterMat);
  cutter.position.y = -0.25;
  spinNode.add(cutter);

  spindleAssembly.add(spinNode);
  if (machineId === 'CNC-02') {
    nodes.cncSpindle2 = spinNode;
  } else {
    nodes.cncSpindle = spinNode;
  }

  // Articulated Loc-Line Coolant Pipes (Blue/Orange Segments)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
  [-0.25, 0.25].forEach(px => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), pipeMat);
    pipe.position.set(px, -0.65, 0.2);
    pipe.rotation.z = px > 0 ? -0.4 : 0.4;
    spindleAssembly.add(pipe);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), nozzleMat);
    tip.position.set(px > 0 ? px - 0.08 : px + 0.08, -0.85, 0.2);
    tip.rotation.x = Math.PI;
    spindleAssembly.add(tip);
  });

  group.add(spindleAssembly);

  // 7. Automatic Tool Changer (ATC) Carousel on Side
  const atcDrumGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 24);
  const atcDrum = new THREE.Mesh(atcDrumGeo, mats.anthracite);
  atcDrum.rotation.z = Math.PI / 2;
  atcDrum.position.set(2.05, 3.2, 0.2);
  group.add(atcDrum);

  // 8. Flexible Cable Drag Chain (Energy Chain) along Column
  const chainGeo = new THREE.BoxGeometry(0.2, 0.08, 0.15);
  for (let i = 0; i < 7; i++) {
    const link = new THREE.Mesh(chainGeo, mats.darkRubber);
    const angle = (i / 7) * Math.PI;
    link.position.set(-0.75 + Math.sin(angle) * 0.4, 3.8 - i * 0.15, -0.6);
    group.add(link);
  }

  // 9. Chip Management: Auger & Inclined Belt Chip Conveyor
  const chipTroughGeo = new THREE.BoxGeometry(0.5, 0.4, 2.6);
  const chipTrough = new THREE.Mesh(chipTroughGeo, mats.anthracite);
  chipTrough.position.set(-2.2, 0.4, 0);
  group.add(chipTrough);

  const chipInclineGeo = new THREE.BoxGeometry(0.45, 0.35, 1.8);
  const chipIncline = new THREE.Mesh(chipInclineGeo, mats.anthracite);
  chipIncline.rotation.x = -0.55;
  chipIncline.position.set(-2.2, 1.0, -1.8);
  group.add(chipIncline);

  const chipBinGeo = new THREE.BoxGeometry(1.1, 0.75, 1.0);
  const chipBin = new THREE.Mesh(chipBinGeo, mats.darkSteel);
  chipBin.position.set(-2.2, 0.38, -2.6);
  group.add(chipBin);

  // 10. Articulated CNC Operator Control Pendant Arm
  const pendantArmGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 16);
  const pendantArm = new THREE.Mesh(pendantArmGeo, mats.darkSteel);
  pendantArm.rotation.z = 0.6;
  pendantArm.position.set(2.4, 2.4, 1.6);
  group.add(pendantArm);

  const pendantConsoleGeo = new THREE.BoxGeometry(0.85, 0.65, 0.18);
  const pendantConsole = new THREE.Mesh(pendantConsoleGeo, mats.sheetMetalLight);
  pendantConsole.position.set(2.75, 2.2, 1.85);
  group.add(pendantConsole);

  // HMI Touchscreen
  const screenGeo = new THREE.PlaneGeometry(0.65, 0.45);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(2.75, 2.22, 1.95);
  group.add(screen);

  // Override knob and E-Stop
  const knobGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16);
  const knob = new THREE.Mesh(knobGeo, mats.groundSteel);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(2.95, 2.0, 1.95);
  group.add(knob);

  // 11. Andon Status Tower
  buildAndonTower(group, -2.4, -1.8, machineId, mats, nodes);

  scene.add(group);
  nodes.machineRoots[machineId] = group;
  return group;
}

// -----------------------------------------------------------------------------
// Machine 3: WELDING-01 (6-Axis Articulated Industrial Robot Arm)
// -----------------------------------------------------------------------------
export function buildWeldingRobot(
  scene: THREE.Scene,
  mats: FactoryMaterials,
  nodes: BuiltMachineNodes
) {
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  group.name = 'WELDING-01';

  // 1. Safety Cell Perimeter Fencing & Amber UV Curtains
  const postGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);

  // Side Protective Screens with Conveyor Pass-Through Opening at z = 0
  [-2.2, 2.2].forEach(sx => {
    const postFront = new THREE.Mesh(postGeo, mats.safetyYellow);
    postFront.position.set(sx, 1.25, 1.8);
    group.add(postFront);

    const postRear = new THREE.Mesh(postGeo, mats.safetyYellow);
    postRear.position.set(sx, 1.25, -1.8);
    group.add(postRear);

    // Mid uprights flanking conveyor pass-through opening
    const postMidFront = new THREE.Mesh(postGeo, mats.safetyYellow);
    postMidFront.position.set(sx, 1.25, 0.7);
    group.add(postMidFront);

    const postMidRear = new THREE.Mesh(postGeo, mats.safetyYellow);
    postMidRear.position.set(sx, 1.25, -0.7);
    group.add(postMidRear);

    // Rear side screen (z = -1.25)
    const rearCurtainGeo = new THREE.PlaneGeometry(1.1, 2.2);
    const rearCurtain = new THREE.Mesh(rearCurtainGeo, mats.safetyCurtain);
    rearCurtain.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    rearCurtain.position.set(sx, 1.35, -1.25);
    group.add(rearCurtain);

    // Front side screen (z = 1.25)
    const frontCurtain = new THREE.Mesh(rearCurtainGeo, mats.safetyCurtain);
    frontCurtain.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    frontCurtain.position.set(sx, 1.35, 1.25);
    group.add(frontCurtain);

    // Conveyor Portal Header Beam
    const portalHeaderGeo = new THREE.BoxGeometry(0.08, 0.12, 1.4);
    const portalHeader = new THREE.Mesh(portalHeaderGeo, mats.safetyYellow);
    portalHeader.position.set(sx, 2.44, 0);
    group.add(portalHeader);
  });

  // Front Cell Boundary Screen
  const frontCurtainGeo = new THREE.PlaneGeometry(4.2, 2.2);
  const frontBoundaryCurtain = new THREE.Mesh(frontCurtainGeo, mats.safetyCurtain);
  frontBoundaryCurtain.position.set(0, 1.35, 1.8);
  group.add(frontBoundaryCurtain);

  // 2. Heavy Cylindrical Floor Pedestal Base
  const pedestalGeo = new THREE.CylinderGeometry(0.68, 0.85, 1.1, 24);
  const pedestal = new THREE.Mesh(pedestalGeo, mats.castIron);
  pedestal.position.set(0, 0.55, -1.2);
  pedestal.castShadow = true;
  group.add(pedestal);

  const baseFlangeGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.12, 24);
  const baseFlange = new THREE.Mesh(baseFlangeGeo, mats.darkSteel);
  baseFlange.position.set(0, 0.06, -1.2);
  group.add(baseFlange);

  // 3. Axis 1: Rotating Turntable Base Knuckle
  const turntableGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 24);
  const turntable = new THREE.Mesh(turntableGeo, mats.accentCopper);
  turntable.position.set(0, 1.25, -1.2);
  turntable.castShadow = true;
  group.add(turntable);

  // 4. Axis 2 & 3: Lower Arm Boom with Counterbalance Cylinder
  const lowerArmGroup = new THREE.Group();
  lowerArmGroup.position.set(0, 1.42, -1.2);

  // Lower Shoulder Joint Casting
  const shoulderCastingGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.45, 16);
  const shoulderCasting = new THREE.Mesh(shoulderCastingGeo, mats.castIron);
  shoulderCasting.rotation.z = Math.PI / 2;
  lowerArmGroup.add(shoulderCasting);

  // Main Boom Arm
  const boomGeo = new THREE.BoxGeometry(0.36, 1.9, 0.44);
  const boom = new THREE.Mesh(boomGeo, mats.accentCopper);
  boom.position.set(0, 0.95, 0);
  boom.castShadow = true;
  lowerArmGroup.add(boom);

  // Counterbalance Cylinder on Rear of Lower Arm
  const balanceCylGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.1, 16);
  const balanceCyl = new THREE.Mesh(balanceCylGeo, mats.anthracite);
  balanceCyl.position.set(0, 0.6, -0.32);
  lowerArmGroup.add(balanceCyl);

  const balanceRodGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 16);
  const balanceRod = new THREE.Mesh(balanceRodGeo, mats.groundSteel);
  balanceRod.position.set(0, 1.1, -0.32);
  lowerArmGroup.add(balanceRod);

  // 5. Axis 4 & 5: Upper Forearm Assembly
  const upperArmGroup = new THREE.Group();
  upperArmGroup.position.set(0, 1.9, 0);

  // Elbow Joint Hub
  const elbowGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.4, 16);
  const elbow = new THREE.Mesh(elbowGeo, mats.castIron);
  elbow.rotation.z = Math.PI / 2;
  upperArmGroup.add(elbow);

  // Forearm Casting
  const forearmGeo = new THREE.BoxGeometry(0.28, 1.7, 0.32);
  const forearm = new THREE.Mesh(forearmGeo, mats.anthracite);
  forearm.position.set(0, 0.85, 0);
  forearm.castShadow = true;
  upperArmGroup.add(forearm);

  // Wire Feeder Unit mounted on Upper Arm
  const feederGeo = new THREE.BoxGeometry(0.4, 0.5, 0.35);
  const feeder = new THREE.Mesh(feederGeo, mats.sheetMetalMedium);
  feeder.position.set(0, 0.5, 0.25);
  upperArmGroup.add(feeder);

  // 6. Axis 6 & Welding Torch Wrist
  const wristGroup = new THREE.Group();
  wristGroup.position.set(0, 1.7, 0);

  const wristGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16);
  const wrist = new THREE.Mesh(wristGeo, mats.castIron);
  wristGroup.add(wrist);

  // Curved Swan-Neck Torch & Copper Gas Diffuser Nozzle
  const torchNeckGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12);
  const torchNeck = new THREE.Mesh(torchNeckGeo, mats.groundSteel);
  torchNeck.rotation.x = Math.PI / 3;
  torchNeck.position.set(0, 0.2, 0.1);
  wristGroup.add(torchNeck);

  const nozzleGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.25, 16);
  const nozzle = new THREE.Mesh(nozzleGeo, mats.bronze);
  nozzle.rotation.x = Math.PI / 3;
  nozzle.position.set(0, 0.38, 0.25);
  wristGroup.add(nozzle);

  upperArmGroup.add(wristGroup);
  lowerArmGroup.add(upperArmGroup);
  group.add(lowerArmGroup);

  nodes.weldingArmUpper = lowerArmGroup;
  nodes.weldingArmFore = upperArmGroup;
  nodes.weldingTorch = wristGroup;

  // 7. Dynamic Welding Arc Electric Light & Spark Particles
  const arcLight = new THREE.PointLight(0x93c5fd, 0.0, 9.0, 2.2);
  arcLight.position.set(0, 1.45, 0.15);
  group.add(arcLight);
  nodes.weldingLight = arcLight;

  // Group for glowing spark particles
  const sparkGroup = new THREE.Group();
  sparkGroup.position.set(0, 1.45, 0.15);
  const sparkGeo = new THREE.BufferGeometry();
  const sparkCount = 18;
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount * 3; i++) {
    sparkPos[i] = (Math.random() - 0.5) * 0.4;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffedd5,
    size: 0.08,
    transparent: true,
    opacity: 0.0,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkGroup.add(sparkPoints);
  group.add(sparkGroup);
  nodes.weldingSparks = sparkGroup;

  // 8. Workpiece Rotary Clamping Fixture Jig on Floor
  const fixtureBaseGeo = new THREE.BoxGeometry(2.2, 0.5, 1.4);
  const fixtureBase = new THREE.Mesh(fixtureBaseGeo, mats.anthracite);
  fixtureBase.position.set(0, 0.25, 0);
  fixtureBase.receiveShadow = true;
  group.add(fixtureBase);

  // Dual Headstock/Tailstock Rotary Clamping Positioners
  [-0.9, 0.9].forEach(hx => {
    const headGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
    const head = new THREE.Mesh(headGeo, mats.castIron);
    head.position.set(hx, 0.85, 0);
    group.add(head);

    const chuckGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16);
    const chuck = new THREE.Mesh(chuckGeo, mats.groundSteel);
    chuck.rotation.z = Math.PI / 2;
    chuck.position.set(hx > 0 ? hx - 0.18 : hx + 0.18, 0.85, 0);
    group.add(chuck);
  });

  // 9. Torch Cleaner / Reamer Stand
  const reamerGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.8, 16);
  const reamer = new THREE.Mesh(reamerGeo, mats.sheetMetalMedium);
  reamer.position.set(1.4, 0.4, -1.0);
  group.add(reamer);

  // 10. Andon Status Tower
  buildAndonTower(group, -2.5, -1.8, 'WELDING-01', mats, nodes);

  scene.add(group);
  nodes.machineRoots['WELDING-01'] = group;
}

// -----------------------------------------------------------------------------
// Machine 4: INSPECTION-01 (Automated Optical QA & Laser Vision Tunnel)
// -----------------------------------------------------------------------------
export function buildInspectionTunnel(
  scene: THREE.Scene,
  mats: FactoryMaterials,
  nodes: BuiltMachineNodes
) {
  const group = new THREE.Group();
  group.position.set(10, 0, 0);
  group.name = 'INSPECTION-01';

  // 1. Grade 00 Precision Black Granite Surface Plate
  const graniteGeo = new THREE.BoxGeometry(3.8, 0.4, 3.2);
  const graniteMat = new THREE.MeshStandardMaterial({
    color: 0x181b20,
    roughness: 0.15,
    metalness: 0.1,
  });
  const granite = new THREE.Mesh(graniteGeo, graniteMat);
  granite.position.y = 0.55;
  granite.castShadow = true;
  granite.receiveShadow = true;
  group.add(granite);

  // 4 Pneumatic Vibration Isolator Pods supporting Granite Plate
  const podGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.35, 16);
  [
    [-1.6, -1.3],
    [1.6, -1.3],
    [-1.6, 1.3],
    [1.6, 1.3],
  ].forEach(([px, pz]) => {
    const pod = new THREE.Mesh(podGeo, mats.anthracite);
    pod.position.set(px, 0.175, pz);
    group.add(pod);
  });

  // 2. Rigid Structural Portal Arch Frame (RAL 7035 Light Grey)
  const archColGeo = new THREE.BoxGeometry(0.45, 3.2, 2.6);
  const archColLeft = new THREE.Mesh(archColGeo, mats.sheetMetalLight);
  archColLeft.position.set(-1.6, 2.35, 0);
  archColLeft.castShadow = true;
  group.add(archColLeft);

  const archColRight = new THREE.Mesh(archColGeo, mats.sheetMetalLight);
  archColRight.position.set(1.6, 2.35, 0);
  archColRight.castShadow = true;
  group.add(archColRight);

  const archHeaderGeo = new THREE.BoxGeometry(3.65, 0.55, 2.6);
  const archHeader = new THREE.Mesh(archHeaderGeo, mats.sheetMetalLight);
  archHeader.position.set(0, 3.65, 0);
  archHeader.castShadow = true;
  group.add(archHeader);

  // Anthracite Lower Base Frame
  const baseFrameGeo = new THREE.BoxGeometry(3.7, 0.4, 2.9);
  const baseFrame = new THREE.Mesh(baseFrameGeo, mats.anthracite);
  baseFrame.position.y = 0.95;
  group.add(baseFrame);

  // Internal Pass-Through Inspection Tunnel Shroud (Matte Black Light Baffle Hood)
  const tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x0f1115,
    roughness: 0.95,
  });
  const baffleHoodGeo = new THREE.BoxGeometry(2.6, 0.08, 1.6);
  const baffleHood = new THREE.Mesh(baffleHoodGeo, tunnelMat);
  baffleHood.position.set(0, 2.25, 0);
  group.add(baffleHood);

  // 3. Telecentric Industrial Vision System
  // Vertical Overhead Telecentric Lens & Camera Body
  const camBodyGeo = new THREE.BoxGeometry(0.35, 0.45, 0.35);
  const camBody = new THREE.Mesh(camBodyGeo, mats.accentBlue);
  camBody.position.set(0, 3.1, 0);
  group.add(camBody);

  const telecentricLensGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.65, 24);
  const lens = new THREE.Mesh(telecentricLensGeo, mats.groundSteel);
  lens.position.set(0, 2.65, 0);
  group.add(lens);

  // Diffuse White LED Dome Illuminator
  const domeGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.22, 24);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, 2.4, 0);
  group.add(dome);

  // Secondary 45-degree Angled Profile Camera
  const sideCam = new THREE.Mesh(camBodyGeo, mats.accentBlue);
  sideCam.rotation.z = -0.7;
  sideCam.position.set(-0.85, 2.7, 0);
  group.add(sideCam);

  // 4. Laser Triangulation Profiler & Sweeping Laser Line
  const profilerGeo = new THREE.BoxGeometry(0.3, 0.22, 0.25);
  const profiler = new THREE.Mesh(profilerGeo, mats.anthracite);
  profiler.position.set(0.65, 2.75, 0);
  group.add(profiler);

  // Blue-Green Laser Triangulation Scanning Sheet
  const laserGeo = new THREE.PlaneGeometry(2.3, 0.05);
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const laser = new THREE.Mesh(laserGeo, laserMat);
  laser.rotation.x = Math.PI / 2;
  laser.position.set(0, 1.45, 0);
  group.add(laser);
  nodes.inspectionLaser = laser;

  // 5. Pneumatic Reject Diverter Gate (Downstream at x = 1.6)
  const diverterGroup = new THREE.Group();
  diverterGroup.position.set(1.5, 1.35, 0.65);

  const diverterArmGeo = new THREE.BoxGeometry(1.1, 0.18, 0.05);
  const diverterArm = new THREE.Mesh(diverterArmGeo, mats.groundSteel);
  diverterArm.position.set(0.5, 0, 0);
  diverterGroup.add(diverterArm);

  const actuatorGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 16);
  const actuator = new THREE.Mesh(actuatorGeo, mats.anthracite);
  diverterGroup.add(actuator);

  group.add(diverterGroup);
  nodes.inspectionDiverter = diverterGroup;

  // Scrap / Quarantine Collection Chute & Bin
  const scrapChuteGeo = new THREE.BoxGeometry(0.9, 0.1, 1.2);
  const scrapChute = new THREE.Mesh(scrapChuteGeo, mats.groundSteel);
  scrapChute.rotation.x = 0.5;
  scrapChute.position.set(2.0, 1.0, 1.3);
  group.add(scrapChute);

  const quarantineBinGeo = new THREE.BoxGeometry(1.1, 0.65, 1.1);
  const quarantineMat = new THREE.MeshStandardMaterial({
    color: 0xb85c4a,
    roughness: 0.45,
  });
  const quarantineBin = new THREE.Mesh(quarantineBinGeo, quarantineMat);
  quarantineBin.position.set(2.0, 0.32, 2.0);
  group.add(quarantineBin);

  // 6. Vision Inspection Telemetry Display Screen
  const monitorFrameGeo = new THREE.BoxGeometry(1.8, 1.0, 0.1);
  const monitorFrame = new THREE.Mesh(monitorFrameGeo, mats.sheetMetalLight);
  monitorFrame.position.set(0, 3.4, 1.45);
  group.add(monitorFrame);

  const monitorScreenGeo = new THREE.PlaneGeometry(1.65, 0.85);
  const monitorMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const monitorScreen = new THREE.Mesh(monitorScreenGeo, monitorMat);
  monitorScreen.position.set(0, 3.4, 1.51);
  group.add(monitorScreen);

  // 7. Andon Status Tower
  buildAndonTower(group, 2.4, -1.8, 'INSPECTION-01', mats, nodes);

  scene.add(group);
  nodes.machineRoots['INSPECTION-01'] = group;
}

// -----------------------------------------------------------------------------
// Machine 5: PACKAGING-01 (Cartesian Pick-and-Place Palletizing Gantry)
// -----------------------------------------------------------------------------
export function buildPackagingGantry(
  scene: THREE.Scene,
  mats: FactoryMaterials,
  nodes: BuiltMachineNodes
) {
  const group = new THREE.Group();
  group.position.set(20, 0, 0);
  group.name = 'PACKAGING-01';

  // 1. Structural Steel Box-Beam Gantry Frame (RAL 7035 Light Grey)
  const colGeo = new THREE.BoxGeometry(0.38, 5.8, 0.38);
  const colPositions = [
    [-2.2, -1.9],
    [2.2, -1.9],
    [-2.2, 1.9],
    [2.2, 1.9],
  ];

  colPositions.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(colGeo, mats.sheetMetalLight);
    col.position.set(cx, 2.9, cz);
    col.castShadow = true;
    group.add(col);

    // Safety Yellow Lower Impact Crash Guards
    const guardGeo = new THREE.BoxGeometry(0.48, 0.8, 0.48);
    const guard = new THREE.Mesh(guardGeo, mats.safetyYellow);
    guard.position.set(cx, 0.4, cz);
    group.add(guard);
  });

  // Overhead Box Beams (X-Axis and Z-Axis)
  const beamXGeo = new THREE.BoxGeometry(4.7, 0.38, 0.38);
  const beamFront = new THREE.Mesh(beamXGeo, mats.sheetMetalLight);
  beamFront.position.set(0, 5.65, 1.9);
  group.add(beamFront);

  const beamRear = new THREE.Mesh(beamXGeo, mats.sheetMetalLight);
  beamRear.position.set(0, 5.65, -1.9);
  group.add(beamRear);

  const beamZGeo = new THREE.BoxGeometry(0.38, 0.38, 3.8);
  const beamLeft = new THREE.Mesh(beamZGeo, mats.sheetMetalLight);
  beamLeft.position.set(-2.2, 5.65, 0);
  group.add(beamLeft);

  const beamRight = new THREE.Mesh(beamZGeo, mats.sheetMetalLight);
  beamRight.position.set(2.2, 5.65, 0);
  group.add(beamRight);

  // Dual Ground Steel Linear Guide Rails on X-Beams
  const railGeo = new THREE.BoxGeometry(4.6, 0.08, 0.08);
  const railFront = new THREE.Mesh(railGeo, mats.groundSteel);
  railFront.position.set(0, 5.86, 1.9);
  group.add(railFront);

  const railRear = new THREE.Mesh(railGeo, mats.groundSteel);
  railRear.position.set(0, 5.86, -1.9);
  group.add(railRear);

  // 2. Cartesian Traveling X-Axis Carriage & Y-Axis Cross Beam
  const carriageGroup = new THREE.Group();
  carriageGroup.position.set(0, 5.4, 0);

  const carriageBaseGeo = new THREE.BoxGeometry(1.2, 0.35, 4.0);
  const carriageBase = new THREE.Mesh(carriageBaseGeo, mats.anthracite);
  carriageGroup.add(carriageBase);

  // Servo Drive Motors
  const servoGeo = new THREE.BoxGeometry(0.35, 0.45, 0.35);
  const servo = new THREE.Mesh(servoGeo, mats.castIron);
  servo.position.set(0, 0.4, 1.8);
  carriageGroup.add(servo);

  // 3. Telescopic Vertical Pick-and-Place Mast (Z-Axis Stroke)
  const mastGroup = new THREE.Group();
  mastGroup.position.set(0, 0, 0);

  const mastPillarGeo = new THREE.BoxGeometry(0.25, 3.4, 0.25);
  const mastPillar = new THREE.Mesh(mastPillarGeo, mats.darkSteel);
  mastPillar.position.y = -1.4;
  mastGroup.add(mastPillar);

  // Chrome Guide Cylinder
  const chromeRodGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 16);
  const chromeRod = new THREE.Mesh(chromeRodGeo, mats.groundSteel);
  chromeRod.position.set(0.18, -1.4, 0);
  mastGroup.add(chromeRod);

  // 4. Pneumatic Vacuum Gripper End-Effector Manifold
  const gripperGroup = new THREE.Group();
  gripperGroup.position.set(0, -3.1, 0);

  const manifoldPlateGeo = new THREE.BoxGeometry(1.1, 0.12, 1.1);
  const manifoldPlate = new THREE.Mesh(manifoldPlateGeo, mats.accentBlue);
  gripperGroup.add(manifoldPlate);

  // 4 Industrial Silicone Bellows Suction Cups
  const cupGeo = new THREE.CylinderGeometry(0.08, 0.14, 0.16, 16);
  [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35],
  ].forEach(([cx, cz]) => {
    const cup = new THREE.Mesh(cupGeo, mats.darkRubber);
    cup.position.set(cx, -0.14, cz);
    gripperGroup.add(cup);

    const fittingGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12);
    const fitting = new THREE.Mesh(fittingGeo, mats.bronze);
    fitting.position.set(cx, -0.04, cz);
    gripperGroup.add(fitting);
  });

  mastGroup.add(gripperGroup);
  carriageGroup.add(mastGroup);
  group.add(carriageGroup);

  nodes.packagingCarriage = carriageGroup;
  nodes.packagingMast = mastGroup;
  nodes.packagingGripper = gripperGroup;

  // 5. Authentic Euro-Pallets on Floor (EPAL Standard 1200 x 800 mm Proportion)
  const buildEuroPallet = (px: number, pz: number) => {
    const palletGroup = new THREE.Group();
    palletGroup.position.set(px, 0, pz);

    // 3 Bottom Skid Runner Boards
    const runnerGeo = new THREE.BoxGeometry(1.9, 0.05, 0.16);
    [-0.65, 0, 0.65].forEach(rz => {
      const runner = new THREE.Mesh(runnerGeo, mats.woodPallet);
      runner.position.set(0, 0.025, rz);
      palletGroup.add(runner);
    });

    // 9 Solid Wooden Spacer Blocks
    const blockGeo = new THREE.BoxGeometry(0.18, 0.12, 0.18);
    [-0.85, 0, 0.85].forEach(bx => {
      [-0.65, 0, 0.65].forEach(bz => {
        const blk = new THREE.Mesh(blockGeo, mats.woodPallet);
        blk.position.set(bx, 0.11, bz);
        palletGroup.add(blk);
      });
    });

    // 5 Top Deckboards
    const deckGeo = new THREE.BoxGeometry(1.9, 0.05, 0.22);
    [-0.65, -0.32, 0, 0.32, 0.65].forEach(dz => {
      const deck = new THREE.Mesh(deckGeo, mats.woodPallet);
      deck.position.set(0, 0.195, dz);
      deck.receiveShadow = true;
      palletGroup.add(deck);
    });

    group.add(palletGroup);
  };

  // 5. Authentic Euro-Pallets on Floor (EPAL Standard 1200 x 800 mm Proportion)
  // Staged on designated pallet staging pad at z = 1.6 beside the conveyor
  buildEuroPallet(0.2, 1.6);

  // 6. Stacked Corrugated Industrial Shipping Cartons on Pallet
  const boxGeo = new THREE.BoxGeometry(0.78, 0.58, 0.72);
  const tapeGeo = new THREE.BoxGeometry(0.79, 0.01, 0.08);
  const tapeMat = new THREE.MeshStandardMaterial({
    color: INDUSTRIAL_PALETTE.cardboardTape,
    roughness: 0.6,
  });

  const labelGeo = new THREE.PlaneGeometry(0.22, 0.18);
  const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const boxPositions = [
    [-0.2, 0.51, 1.25],
    [0.6, 0.51, 1.25],
    [-0.2, 0.51, 1.95],
    [0.6, 0.51, 1.95],
    [0.2, 1.09, 1.6],
  ];

  boxPositions.forEach(([bx, by, bz]) => {
    const box = new THREE.Mesh(boxGeo, mats.cardboardBox);
    box.position.set(bx, by, bz);
    box.castShadow = true;
    group.add(box);

    // Sealing Tape Strip across Top Seam
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.set(bx, by + 0.295, bz);
    group.add(tape);

    // Shipping Label with Barcode
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(bx, by, bz + 0.365);
    group.add(label);
  });

  // 7. Roller Conveyor Outfeed Bed
  const rollerFrameGeo = new THREE.BoxGeometry(3.2, 0.24, 1.2);
  const rollerFrame = new THREE.Mesh(rollerFrameGeo, mats.anthracite);
  rollerFrame.position.set(2.8, 1.0, 0);
  group.add(rollerFrame);

  // Individual Steel Rollers
  const rollerGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 16);
  for (let rx = 1.4; rx <= 4.2; rx += 0.28) {
    const roller = new THREE.Mesh(rollerGeo, mats.groundSteel);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(rx, 1.16, 0);
    group.add(roller);
  }

  // 8. Andon Status Tower
  buildAndonTower(group, 2.6, -1.8, 'PACKAGING-01', mats, nodes);

  scene.add(group);
  nodes.machineRoots['PACKAGING-01'] = group;
}

// -----------------------------------------------------------------------------
// Continuous Conveyor System Line (Extruded Profiles, Support Trusses, Sensors)
// -----------------------------------------------------------------------------
export function buildContinuousConveyor(
  scene: THREE.Scene,
  mats: FactoryMaterials
) {
  const conveyorGroup = new THREE.Group();
  const lineLength = 54;

  // Main Conveyor Slat Bed
  const bedGeo = new THREE.BoxGeometry(lineLength, 0.18, 1.25);
  const bed = new THREE.Mesh(bedGeo, mats.anthracite);
  bed.position.set(0, 1.11, 0);
  bed.receiveShadow = true;
  conveyorGroup.add(bed);

  // Central Modular Plastic / Steel Belt
  const beltGeo = new THREE.BoxGeometry(lineLength, 0.04, 0.95);
  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e23,
    roughness: 0.9,
    metalness: 0.1,
  });
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.set(0, 1.22, 0);
  conveyorGroup.add(belt);

  // Extruded Aluminum Guide Side Rails
  const railGeo = new THREE.BoxGeometry(lineLength, 0.16, 0.08);
  const railFront = new THREE.Mesh(railGeo, mats.sheetMetalMedium);
  railFront.position.set(0, 1.28, 0.62);
  conveyorGroup.add(railFront);

  const railRear = new THREE.Mesh(railGeo, mats.sheetMetalMedium);
  railRear.position.set(0, 1.28, -0.62);
  conveyorGroup.add(railRear);

  // Low-Friction UHMW Wear Strip Lines (Yellow Accent)
  const stripGeo = new THREE.BoxGeometry(lineLength, 0.03, 0.02);
  const stripFront = new THREE.Mesh(stripGeo, mats.safetyYellow);
  stripFront.position.set(0, 1.34, 0.58);
  conveyorGroup.add(stripFront);

  const stripRear = new THREE.Mesh(stripGeo, mats.safetyYellow);
  stripRear.position.set(0, 1.34, -0.58);
  conveyorGroup.add(stripRear);

  // Heavy Support Leg Trusses & Leveling Feet every 4 meters
  const legGeo = new THREE.BoxGeometry(0.16, 1.12, 1.35);
  const footPadGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16);

  for (let x = -26; x <= 26; x += 4.0) {
    const leg = new THREE.Mesh(legGeo, mats.anthracite);
    leg.position.set(x, 0.56, 0);
    leg.castShadow = true;
    conveyorGroup.add(leg);

    [-0.6, 0.6].forEach(fz => {
      const foot = new THREE.Mesh(footPadGeo, mats.darkSteel);
      foot.position.set(x, 0.03, fz);
      conveyorGroup.add(foot);
    });
  }

  // Optical Photoelectric Retroreflective Sensors at each Machine Station Entry
  [-20, -10, 0, 10, 20].forEach(sx => {
    const sensorGeo = new THREE.BoxGeometry(0.08, 0.1, 0.06);
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3 });
    const sensor = new THREE.Mesh(sensorGeo, sensorMat);
    sensor.position.set(sx - 1.6, 1.35, 0.67);
    conveyorGroup.add(sensor);

    const reflectorGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16);
    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const reflector = new THREE.Mesh(reflectorGeo, reflectorMat);
    reflector.rotation.x = Math.PI / 2;
    reflector.position.set(sx - 1.6, 1.35, -0.66);
    conveyorGroup.add(reflector);
  });

  scene.add(conveyorGroup);
}

// -----------------------------------------------------------------------------
// Parallel Conveyor Spur System (Branching Infeed, Parallel Bed, and Merge Outfeed)
// -----------------------------------------------------------------------------
export function buildParallelConveyorBranch(
  parent: THREE.Group | THREE.Scene,
  mats: FactoryMaterials
): THREE.Group {
  const spurGroup = new THREE.Group();
  spurGroup.name = 'PARALLEL_CONVEYOR_SPUR';

  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e23,
    roughness: 0.9,
    metalness: 0.1,
  });

  const legGeo = new THREE.BoxGeometry(0.16, 1.12, 1.35);
  const footPadGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16);

  // 1. Straight Section Through CNC-02 (-15 to -5 at z = 5.5)
  const straightLength = 10;
  const straightBedGeo = new THREE.BoxGeometry(straightLength, 0.18, 1.25);
  const straightBed = new THREE.Mesh(straightBedGeo, mats.anthracite);
  straightBed.position.set(-10, 1.11, 5.5);
  straightBed.receiveShadow = true;
  spurGroup.add(straightBed);

  const straightBeltGeo = new THREE.BoxGeometry(straightLength, 0.04, 0.95);
  const straightBelt = new THREE.Mesh(straightBeltGeo, beltMat);
  straightBelt.position.set(-10, 1.22, 5.5);
  spurGroup.add(straightBelt);

  // Rails for straight section
  const straightRailGeo = new THREE.BoxGeometry(straightLength, 0.16, 0.08);
  const sRailFront = new THREE.Mesh(straightRailGeo, mats.sheetMetalMedium);
  sRailFront.position.set(-10, 1.28, 5.5 + 0.62);
  spurGroup.add(sRailFront);

  const sRailRear = new THREE.Mesh(straightRailGeo, mats.sheetMetalMedium);
  sRailRear.position.set(-10, 1.28, 5.5 - 0.62);
  spurGroup.add(sRailRear);

  // Yellow wear strips
  const sStripGeo = new THREE.BoxGeometry(straightLength, 0.03, 0.02);
  const sStripFront = new THREE.Mesh(sStripGeo, mats.safetyYellow);
  sStripFront.position.set(-10, 1.34, 5.5 + 0.58);
  spurGroup.add(sStripFront);

  const sStripRear = new THREE.Mesh(sStripGeo, mats.safetyYellow);
  sStripRear.position.set(-10, 1.34, 5.5 - 0.58);
  spurGroup.add(sStripRear);

  // Support legs for straight section
  [-14, -10, -6].forEach(lx => {
    const leg = new THREE.Mesh(legGeo, mats.anthracite);
    leg.position.set(lx, 0.56, 5.5);
    leg.castShadow = true;
    spurGroup.add(leg);

    [-0.6, 0.6].forEach(fz => {
      const foot = new THREE.Mesh(footPadGeo, mats.darkSteel);
      foot.position.set(lx, 0.03, 5.5 + fz);
      spurGroup.add(foot);
    });
  });

  // Entry Photoelectric Sensor for CNC-02
  const sensorGeo = new THREE.BoxGeometry(0.08, 0.1, 0.06);
  const sensorMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3 });
  const sensor = new THREE.Mesh(sensorGeo, sensorMat);
  sensor.position.set(-11.6, 1.35, 5.5 + 0.67);
  spurGroup.add(sensor);

  const reflectorGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16);
  const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const reflector = new THREE.Mesh(reflectorGeo, reflectorMat);
  reflector.rotation.x = Math.PI / 2;
  reflector.position.set(-11.6, 1.35, 5.5 - 0.66);
  spurGroup.add(reflector);

  // 2. Angled Infeed Diverter Branch (From -18, 0 to -15, 5.5)
  const infeedLength = Math.hypot(3.0, 5.5); // 6.265m
  const infeedAngle = Math.atan2(5.5, 3.0); // ~1.071 rad

  const infeedBedGroup = new THREE.Group();
  infeedBedGroup.position.set(-16.5, 1.11, 2.75);
  infeedBedGroup.rotation.y = -infeedAngle;

  const diagBedGeo = new THREE.BoxGeometry(infeedLength, 0.18, 1.25);
  const infeedBed = new THREE.Mesh(diagBedGeo, mats.anthracite);
  infeedBed.receiveShadow = true;
  infeedBedGroup.add(infeedBed);

  const diagBeltGeo = new THREE.BoxGeometry(infeedLength, 0.04, 0.95);
  const infeedBelt = new THREE.Mesh(diagBeltGeo, beltMat);
  infeedBelt.position.y = 0.11;
  infeedBedGroup.add(infeedBelt);

  // Rails & yellow wear strips
  const diagRailGeo = new THREE.BoxGeometry(infeedLength, 0.16, 0.08);
  const inRail1 = new THREE.Mesh(diagRailGeo, mats.sheetMetalMedium);
  inRail1.position.set(0, 0.17, 0.62);
  infeedBedGroup.add(inRail1);

  const inRail2 = new THREE.Mesh(diagRailGeo, mats.sheetMetalMedium);
  inRail2.position.set(0, 0.17, -0.62);
  infeedBedGroup.add(inRail2);

  const diagStripGeo = new THREE.BoxGeometry(infeedLength, 0.03, 0.02);
  const inStrip1 = new THREE.Mesh(diagStripGeo, mats.safetyYellow);
  inStrip1.position.set(0, 0.23, 0.58);
  infeedBedGroup.add(inStrip1);

  const inStrip2 = new THREE.Mesh(diagStripGeo, mats.safetyYellow);
  inStrip2.position.set(0, 0.23, -0.58);
  infeedBedGroup.add(inStrip2);

  spurGroup.add(infeedBedGroup);

  // Infeed Support Leg
  const infeedLeg = new THREE.Mesh(legGeo, mats.anthracite);
  infeedLeg.position.set(-16.5, 0.56, 2.75);
  infeedLeg.rotation.y = -infeedAngle;
  spurGroup.add(infeedLeg);

  // Diverter Vane Guide Arm at Entrance (-18, 1.3, 0)
  const diverterVaneGeo = new THREE.BoxGeometry(1.2, 0.18, 0.08);
  const diverterVane = new THREE.Mesh(diverterVaneGeo, mats.safetyYellow);
  diverterVane.rotation.y = -0.55;
  diverterVane.position.set(-17.8, 1.32, 0.4);
  spurGroup.add(diverterVane);

  // Diverter Status Indicator Lamp
  const divLampGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 16);
  const divLampMat = new THREE.MeshStandardMaterial({
    color: 0x5b7b94,
    emissive: 0x5b7b94,
    roughness: 0.2,
  });
  const divLamp = new THREE.Mesh(divLampGeo, divLampMat);
  divLamp.position.set(-17.8, 1.6, 0.4);
  spurGroup.add(divLamp);

  // 3. Angled Outfeed Merger Branch (From -5, 5.5 to -2, 0)
  const outfeedAngle = Math.atan2(-5.5, 3.0); // ~ -1.071 rad

  const outfeedBedGroup = new THREE.Group();
  outfeedBedGroup.position.set(-3.5, 1.11, 2.75);
  outfeedBedGroup.rotation.y = -outfeedAngle;

  const outfeedBed = new THREE.Mesh(diagBedGeo, mats.anthracite);
  outfeedBed.receiveShadow = true;
  outfeedBedGroup.add(outfeedBed);

  const outfeedBelt = new THREE.Mesh(diagBeltGeo, beltMat);
  outfeedBelt.position.y = 0.11;
  outfeedBedGroup.add(outfeedBelt);

  const outRail1 = new THREE.Mesh(diagRailGeo, mats.sheetMetalMedium);
  outRail1.position.set(0, 0.17, 0.62);
  outfeedBedGroup.add(outRail1);

  const outRail2 = new THREE.Mesh(diagRailGeo, mats.sheetMetalMedium);
  outRail2.position.set(0, 0.17, -0.62);
  outfeedBedGroup.add(outRail2);

  const outStrip1 = new THREE.Mesh(diagStripGeo, mats.safetyYellow);
  outStrip1.position.set(0, 0.23, 0.58);
  outfeedBedGroup.add(outStrip1);

  const outStrip2 = new THREE.Mesh(diagStripGeo, mats.safetyYellow);
  outStrip2.position.set(0, 0.23, -0.58);
  outfeedBedGroup.add(outStrip2);

  spurGroup.add(outfeedBedGroup);

  // Outfeed Support Leg
  const outfeedLeg = new THREE.Mesh(legGeo, mats.anthracite);
  outfeedLeg.position.set(-3.5, 0.56, 2.75);
  outfeedLeg.rotation.y = -outfeedAngle;
  spurGroup.add(outfeedLeg);

  // Merge Guide Plow at Re-entry (-2.2, 1.3, 0.4)
  const mergePlowGeo = new THREE.BoxGeometry(1.4, 0.18, 0.08);
  const mergePlow = new THREE.Mesh(mergePlowGeo, mats.safetyYellow);
  mergePlow.rotation.y = 0.55;
  mergePlow.position.set(-2.4, 1.32, 0.35);
  spurGroup.add(mergePlow);

  // 4. Floor Safety Hazard Striping & Pedestrian Walkway
  // Yellow boundary perimeter around CNC-02 cell
  const boundaryGeo = new THREE.BoxGeometry(11.5, 0.015, 5.8);
  const boundaryMat = new THREE.MeshStandardMaterial({
    color: INDUSTRIAL_PALETTE.safetyYellow,
    roughness: 0.5,
  });
  // We frame the perimeter with thin border meshes
  const borderThick = 0.12;
  const borderNorth = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.015, borderThick), boundaryMat);
  borderNorth.position.set(-10, 0.01, 8.2);
  spurGroup.add(borderNorth);

  const borderSouth = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.015, borderThick), boundaryMat);
  borderSouth.position.set(-10, 0.01, 2.8);
  spurGroup.add(borderSouth);

  const borderWest = new THREE.Mesh(new THREE.BoxGeometry(borderThick, 0.015, 5.4), boundaryMat);
  borderWest.position.set(-15.7, 0.01, 5.5);
  spurGroup.add(borderWest);

  const borderEast = new THREE.Mesh(new THREE.BoxGeometry(borderThick, 0.015, 5.4), boundaryMat);
  borderEast.position.set(-4.3, 0.01, 5.5);
  spurGroup.add(borderEast);

  // Pedestrian Walkway Zebra Lines between CNC-01 and CNC-02
  const stripeGeo = new THREE.BoxGeometry(0.35, 0.012, 1.4);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
  for (let sx = -14; sx <= -6; sx += 1.0) {
    const s = new THREE.Mesh(stripeGeo, stripeMat);
    s.position.set(sx, 0.01, 2.2);
    spurGroup.add(s);
  }

  parent.add(spurGroup);
  return spurGroup;
}

// -----------------------------------------------------------------------------
// Factory Environment (Polished Epoxy Floor, OSHA Yellow Stripes, High-Bay LEDs)
// -----------------------------------------------------------------------------
export function buildFactoryEnvironment(scene: THREE.Scene, mats: FactoryMaterials) {
  // 1. Industrial Concrete / Polished Floor Slab
  const floorGeo = new THREE.PlaneGeometry(130, 90);
  const floorMat = new THREE.MeshStandardMaterial({
    color: INDUSTRIAL_PALETTE.floorConcrete,
    roughness: 0.45,
    metalness: 0.25,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 2. OSHA Safety Walkway Demarcation Lines (RAL 1021 Safety Yellow)
  const createStripe = (x: number, z: number, w: number, d: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    const mesh = new THREE.Mesh(geo, mats.safetyYellow);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.015, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  // Main Conveyor Caution Exclusion Borders
  createStripe(0, -2.4, 56, 0.12);
  createStripe(0, 2.4, 56, 0.12);

  // Pedestrian Walkway behind machines
  createStripe(0, 3.8, 56, 0.12);

  // Machine Workcell Demarcation Boxes
  [-20, -10, 0, 10, 20].forEach(mx => {
    // Cross hatch stripes at cell boundary
    createStripe(mx - 3.4, 0, 0.12, 4.8);
    createStripe(mx + 3.4, 0, 0.12, 4.8);
  });

  // 3. High-Bay Industrial Factory Overhead Lighting
  // Neutral Clean Key Sunlight / Overhead High-Bay Lighting (4800K Neutral White)
  const mainSun = new THREE.DirectionalLight(0xf8fafc, 1.85);
  mainSun.position.set(24, 42, 28);
  mainSun.castShadow = true;
  mainSun.shadow.mapSize.width = 2048;
  mainSun.shadow.mapSize.height = 2048;
  mainSun.shadow.camera.near = 10;
  mainSun.shadow.camera.far = 120;
  const shadowRange = 36;
  mainSun.shadow.camera.left = -shadowRange;
  mainSun.shadow.camera.right = shadowRange;
  mainSun.shadow.camera.top = shadowRange;
  mainSun.shadow.camera.bottom = -shadowRange;
  mainSun.shadow.bias = -0.0004;
  scene.add(mainSun);

  // Soft Ambient Daylight Fill (Natural Factory Clerestory Windows)
  const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1f2429, 0.95);
  scene.add(hemiLight);

  // Soft Industrial High-Bay Pendant Lights over each Station
  [-20, -10, 0, 10, 20].forEach(sx => {
    const highBay = new THREE.PointLight(0xfffbeb, 0.95, 22, 1.4);
    highBay.position.set(sx, 10.5, 0);
    scene.add(highBay);

    // High Bay Fixture Body on Ceiling
    const fixtureGeo = new THREE.CylinderGeometry(0.45, 0.7, 0.35, 16);
    const fixture = new THREE.Mesh(fixtureGeo, mats.anthracite);
    fixture.position.set(sx, 11.2, 0);
    scene.add(fixture);
  });

  // 4. Perimeter Structural Columns (Factory Building Architecture)
  const columnGeo = new THREE.BoxGeometry(0.8, 12, 0.8);
  [-32, -16, 0, 16, 32].forEach(colX => {
    [-18, 18].forEach(colZ => {
      const col = new THREE.Mesh(columnGeo, mats.castIron);
      col.position.set(colX, 6.0, colZ);
      col.castShadow = true;
      col.receiveShadow = true;
      scene.add(col);
    });
  });
}
