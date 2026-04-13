/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from 'phaser';
import { CrewmateColors, RGBMaskPipeline } from './RGBShader';
import type { PlayerData } from '../components/MeetingModal';
import Memory from '../data/memory';
import * as EasyStar from 'easystarjs';
//---CONSTANTS---

const TILE_SIZE = 30;
export default class BasicScene extends Phaser.Scene {
  // MAPS
  minimapContainer!: any;
  minimap!: any;
  playerDot!: any;
  mainMapWidth!: number;
  mainMapHeight!: number;
  LightCanvas!: any;
  LightContext!: any;
  LightTexture!: any;
  LocationZones: { name: string; rect: Phaser.Geom.Rectangle }[] = [];
  easystar!: any;
  grids: number[][] = [];
  // CHARACTERS
  player!: any;
  dummies!: any;
  playerRole: 'impostor' | 'crewmate' = 'crewmate';
  walkSound!: any;
  // LOGIC GROUPS
  taskGroup!: Phaser.Physics.Arcade.StaticGroup;
  emergencyGroup!: Phaser.Physics.Arcade.StaticGroup;
  ventGroup!: Phaser.Physics.Arcade.StaticGroup;

  // ZONES
  killZone!: Phaser.GameObjects.Zone;
  interactZone!: Phaser.GameObjects.Zone;
  visibleZones!: Phaser.Physics.Arcade.Group;

  // CURRENT STATE
  currentTarget: any = null;
  currentTask: string | null = null;
  reportTarget: boolean = false;
  targetVent: string | null = null;
  isIdle: boolean = true;
  nextKillTime: number = 0;
  nextSabotageTime: number = 0;

  currVentPos: number[] = [];

  uiGroup!: Phaser.GameObjects.Group;
  cursors!: any;
  wasd!: any;
  darkness!: any;
  flashlight!: any;

  constructor() {
    super({ key: 'BasicScene' });
  }

  // --- CORE UTILITIES ---

  applyColorPreset(sprite: any, colorName: string) {
    sprite.setData('colorName', colorName);
    const preset = CrewmateColors[colorName] || CrewmateColors['red'];
    const p = Phaser.Display.Color.ValueToColor(preset.primary);
    const s = Phaser.Display.Color.ValueToColor(preset.secondary);

    sprite.setPostPipeline('RGBMask');
    const fx = sprite.getPostPipeline('RGBMask') as any;
    fx.primaryRGB = [p.redGL, p.greenGL, p.blueGL];
    fx.secondaryRGB = [s.redGL, s.greenGL, s.blueGL];
  }

  createButton(
    x: number,
    y: number,
    key: string,
    hotkey: string,
    onClickCallBack: () => void,
  ) {
    const baseScale = 1;
    const btn = this.add
      .image(x, y, key)
      .setScrollFactor(0)
      .setDepth(300)
      .setAlpha(0.3) // Start dimmed
      .setInteractive();
    const cdText = this.add
      .text(x, y, '', {
        fontSize: '40px',
        fontStyle: 'Orbitron',
        fontFamily: 'bold',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);
    btn.setData('cdText', cdText);

    btn.on('pointerover', () => {
      this.tweens.add({
        targets: btn,
        scale: baseScale * 1.1,
        duration: 100,
        ease: 'Sine.easeOut',
      });
    });
    btn.on('pointerout', () => {
      this.tweens.add({
        targets: btn,
        scale: baseScale,
        duration: 100,
        ease: 'Sine.easeOut',
      });
      btn.clearTint();
    });
    btn.on('pointerdown', () => {
      btn.setTint(0x888888);
      this.tweens.add({
        targets: btn,
        scale: baseScale * 0.9,
        duration: 50,
        ease: 'Sine.easeInOut',
      });
      onClickCallBack();
    });
    btn.on('pointerup', () => btn.clearTint());

    this.input.keyboard?.on(`keydown-${hotkey}`, () => {
      if (btn.getData('isActive')) {
        this.tweens.add({
          targets: btn,
          scale: baseScale * 0.8,
          duration: 50,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
        onClickCallBack();
      }
    });
    return btn;
  }

  setPlayerRole(role: 'crewmate' | 'impostor') {
    this.playerRole = role;
    if (this.uiGroup) this.uiGroup.clear(true, true);
    else this.uiGroup = this.add.group();

    const sw = this.cameras.main.width;
    const sh = this.cameras.main.height;

    // Shared Buttons
    const useBtn = this.createButton(
      sw - 220,
      sh - 120,
      'btn_use',
      'SPACE',
      () => this.executeTasks(),
    );
    const reportBtn = this.createButton(
      sw - 380,
      sh - 280,
      'btn_report',
      'R',
      () => this.executeReport(),
    );
    this.uiGroup.add(useBtn);
    this.uiGroup.add(reportBtn);
    if (this.playerRole === 'impostor') {
      //priority for SPACE: vent > use > sabotage
      this.uiGroup.add(
        this.createButton(sw - 530, sh - 130, 'btn_sabotage', 'SPACE', () =>
          this.executeSabotage(),
        ),
      );
      this.uiGroup.add(
        this.createButton(sw - 220, sh - 280, 'btn_kill', 'Q', () =>
          this.executeKill(),
        ),
      );
      this.uiGroup.add(
        this.createButton(sw - 380, sh - 130, 'btn_vent', 'SPACE', () =>
          this.executeVent(),
        ),
      );
    }
  }

  // --- GAMEPLAY ACTIONS ---
  executeKill() {
    if (this.time.now < this.nextKillTime || !this.currentTarget) return;
    console.log(
      '[ALL THE MEMORIES]:',
      this.currentTarget.getData('memory').readSight(),
      this.currentTarget.getData('memory').readOthersActivity(),
      this.currentTarget.getData('memory').readMyActivity(),
    );

    this.currentTarget.setData('isDead', true);
    this.currentTarget.body.setVelocity(0, 0);

    // 2. LOBOTOMIZE THE AI (Stop pathfinding)
    this.currentTarget.setData('isTravelling', false);
    this.currentTarget.setData('currentPath', []);

    // 4. Stop current animation and play 'die'
    this.currentTarget.stop(); // Calling .stop() with no args halts everything
    this.currentTarget.play('die');
    this.sound.play('kill', { volume: 0.5 });
    this.player.setPosition(this.currentTarget.x, this.currentTarget.y);
    this.currentTarget = null;
    this.nextKillTime = this.time.now + 10 * 1000;
  }

  executeReport() {
    // Only allow report if there's a body OR we are at the emergency button
    if (!this.reportTarget && this.currentTask !== 'emergency_button') return;

    const tableX = 2250,
      tableY = 500;
    const survivors = [this.player];

    this.dummies.getChildren().forEach((d: any) => {
      if (!d.getData('isDead')) survivors.push(d);
    });
    this.sound.play('report');

    Phaser.Actions.PlaceOnCircle(
      survivors,
      new Phaser.Geom.Circle(tableX, tableY, 180),
    );
    this.physics.pause();
    this.scene.pause();

    if ((window as any).triggerMeeting) {
      (window as any).triggerMeeting(this.getPlayerDataForMeeting());
    }
  }
  executeTasks() {
    // (window as any).toggleKeyboard = (isEnabled: boolean) => {
    //   this.input.keyboard!.enabled = isEnabled;

    //   // Also, if you want to stop the player from sliding when the task opens:
    //   if (!isEnabled) {
    //     this.player.setVelocity(0, 0);
    //     this.player.stop();
    //   }
    // };
    console.log('[TASKS]', this.currentTask);

    if (this.currentTask === 'emergency_button') {
      this.sound.play('emergencyMeeting', { volume: 0.3 });
      setTimeout(() => {
        this.executeReport();
      }, 1500);
    } else {
      this.physics.pause();
      this.scene.pause();

      if ((window as any).triggerTask) {
        (window as any).triggerTask(this.currentTask);
      }
    }
  }
  executeVent() {
    if (!this.targetVent || this.playerRole !== 'impostor') return;
    this.isIdle = false;

    let targetVentX: number = 2679; // vent 1 coord for vent 14 to trace back
    let targetVentY: number = 593;
    let continueSearch: boolean = true;
    const currVentX = this.currVentPos[0],
      currVentY = this.currVentPos[1];
    if (continueSearch) {
      this.ventGroup.getChildren().forEach((vent: any) => {
        if (vent.getData('currVent') === this.targetVent) {
          targetVentX = vent.x;
          targetVentY = vent.y;
          continueSearch = false;
        }
      });
    }
    this.player.setPosition(currVentX, currVentY);
    this.sound.play('vent');
    setTimeout(() => {
      this.player.play('vent');
      // this.player.y += 10;
    }, 120);
    //Announce the vent to the visible range
    this.broadcastVent(this.player.name, currVentX, currVentY); //TODO:CHANGE THE this.player.name -> for all including dummies this should work
    setTimeout(() => {
      this.player.setPosition(targetVentX, targetVentY);
      this.isIdle = true;
    }, 1000);
  }
  executeSabotage() {
    if (this.time.now < this.nextSabotageTime) return;
    this.toggleLight(false);
    this.sound.play('sabotage', { volume: 0.5, loop: true });
    this.nextSabotageTime = this.time.now + 40 * 1000;

    this.time.delayedCall(10 * 1000, () => {
      this.toggleLight(true);
      this.sound.stopByKey('sabotage');
    });
  }
  //---ACTIONS HELPERS ---
  toggleLight(isOn: boolean) {
    this.LightContext.clearRect(0, 0, 3000, 3000);
    const gradient = this.LightContext!.createRadialGradient(
      1500,
      1500,
      50,
      1500,
      1500,
      1500,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(!isOn ? 0.02 : 0.3, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(!isOn ? 0.05 : 0.5, 'rgba(255, 255, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.LightContext!.fillStyle = gradient;
    this.LightContext!.fillRect(0, 0, 3000, 3000);
    this.LightTexture.refresh();
  }
  getPlayerDataForMeeting(): PlayerData[] {
    const data: PlayerData[] = [
      { id: 'CHRIS', color: 'red', isDead: false, isMe: true, votes: 0 },
    ];
    this.dummies.getChildren().forEach((d: any) => {
      data.push({
        id: d.name || 'Bot',
        color: d.getData('colorName') || 'yellow',
        isDead: d.getData('isDead') || false,
        isMe: false,
        votes: 0,
      });
    });
    return data;
  }
  getLocation(x: number, y: number): string {
    const loc = this.LocationZones.find((r) =>
      Phaser.Geom.Rectangle.Contains(r.rect, x, y),
    );
    return loc ? loc.name : 'a hallway';
  }
  getLocationCoordinates(name: string): { x: number; y: number } {
    const foundLocation = this.LocationZones.find((loc) => loc.name === name);
    if (foundLocation) {
      console.log(`[SUCCESS]: Found ${name}`);
      return {
        x: foundLocation.rect.x + foundLocation.rect.width / 2,
        y: foundLocation.rect.y + foundLocation.rect.height / 2,
      };
    }
    console.error('[ERROR]: GIVE PROPER LOCATION NAME');
    return { x: 2250, y: 500 }; // table coord
  }
  broadcastVent(venterName: string, ventX: number, ventY: number) {
    this.visibleZones.getChildren().forEach((z: any) => {
      const zone = z as Phaser.GameObjects.Zone;
      const observerName = zone.getData('zoneOwner');
      const body = zone.body as Phaser.Physics.Arcade.Body;

      // 1. Skip if the observer is the one venting
      if (observerName === venterName) return;

      // 2. Manual Bounds Check
      const isInside =
        ventX >= body.x &&
        ventX <= body.right &&
        ventY >= body.y &&
        ventY <= body.bottom;

      if (isInside) {
        console.log(`[CAUGHT]: ${observerName} saw ${venterName} vent!`);

        // 3. Get the observer sprite to access their memory
        const observerSprite = this.dummies
          .getChildren()
          .find((d: any) => d.name === observerName) as any;

        if (observerSprite) {
          const room = this.getLocation(ventX, ventY); // Use your room detector!

          observerSprite.getData('memory').writeSight(
            observerName,
            venterName,
            false, // Not dead
            `VENTING in ${room}`,
            this.time.now,
          );
        }
      }
    });
  }
  commandBotToLocation(
    dummy: Phaser.Physics.Arcade.Sprite,
    targetX: number,
    targetY: number,
  ) {
    if (!this.easystar) {
      console.warn(
        `[AI] EasyStar is not ready yet. ${dummy.name} command ignored.`,
      );
      return;
    }
    const maxCols = this.grids[0].length - 1;
    const maxRows = this.grids.length - 1;

    let startGridX: number = Phaser.Math.Clamp(
      Math.floor(dummy.x / TILE_SIZE),
      0,
      maxCols,
    );
    let startGridY: number = Phaser.Math.Clamp(
      Math.floor(dummy.y / TILE_SIZE),
      0,
      maxRows,
    );
    let endGridX: number = Phaser.Math.Clamp(
      Math.floor(targetX / TILE_SIZE),
      0,
      maxCols,
    );
    let endGridY: number = Phaser.Math.Clamp(
      Math.floor(targetY / TILE_SIZE),
      0,
      maxRows,
    );
    console.log(`Grid Size: ${this.grids[0].length}x${this.grids.length}`);
    console.log(
      `Pathing from Start: [${startGridX}, ${startGridY}] to End: [${endGridX}, ${endGridY}]`,
    );
    const startTile = this.grids[startGridY][startGridX]; // if 1 -> center is inside wall
    const endTile = this.grids[endGridY][endGridX]; // if 1 -> center is inside wall
    if (startTile === 1) {
      console.error(
        `[AI TILE CHECK FOR START] Target [${startGridY},${startGridX}] is wall! Finding safe spot...`,
        this.grids[startGridY][startGridX],
      );
      const safeSpot = this.findClosestWalkable(startGridX, startGridY);
      startGridX = safeSpot.x;
      startGridY = safeSpot.y;
      console.warn(
        `[new safe grid]:[${startGridY},${startGridX}]=${this.grids[startGridY][startGridX]}`,
      );
    }
    if (endTile === 1) {
      console.log(
        `[AI TILE CHECK FOR END] Target [${endGridX},${endGridY}] is wall! Finding safe spot...`,
      );
      const safeSpot = this.findClosestWalkable(endGridX, endGridY);
      endGridX = safeSpot.x;
      endGridY = safeSpot.y;
      console.warn(
        `[new safe grid]:[${endGridX},${endGridY}]=${this.grids[endGridY][endGridX]}`,
      );
    }
    console.log(
      '[GRID CHECK] Start tile value:',
      this.grids[startGridY][startGridX],
    );
    console.log('[GRID CHECK] End tile value:', this.grids[endGridY][endGridX]);
    console.log(
      '[GRID CHECK] Grid dimensions:',
      this.grids.length,
      'rows x',
      this.grids[0].length,
      'cols',
    );
    let gridDebug = '';
    for (let row = 0; row < this.grids.length; row++) {
      gridDebug +=
        this.grids[row].map((v: number) => (v === 1 ? '█' : '.')).join('') +
        '\n';
    }
    // Draws RED squares on wall tiles, GREEN on walkable
    // Remove after debugging!
    for (let row = 0; row < this.grids.length; row++) {
      for (let col = 0; col < this.grids[row].length; col++) {
        if (this.grids[row][col] === 1) {
          this.add
            .rectangle(
              col * TILE_SIZE + TILE_SIZE / 2,
              row * TILE_SIZE + TILE_SIZE / 2,
              TILE_SIZE - 2,
              TILE_SIZE - 2,
              0xff0000,
              0.3,
            )
            .setDepth(50);
        }
      }
    }
    console.log('[GRID VISUAL]\n' + gridDebug);

    this.easystar.findPath(
      startGridX,
      startGridY,
      endGridX,
      endGridY,
      (path: any) => {
        if (path === null) {
          console.log('[DUMMY] cant find the path');
          dummy.setData('currentPath', []);
        } else {
          const worldPath = path.map((node: any) => ({
            x: node.x * TILE_SIZE + TILE_SIZE / 2,
            y: node.y * TILE_SIZE + TILE_SIZE / 2,
          }));
          console.log(
            `[AI] ${dummy.name} found a path in ${worldPath.length} steps`,
            worldPath,
          );
          dummy.setData('currentPath', worldPath);
          dummy.setData('isTravelling', true);
        }
      },
    );
    this.easystar.calculate();
  }
  findClosestWalkable(gridX: number, gridY: number): { x: number; y: number } {
    //SMALLER BFS
    if (this.grids[gridY][gridX] === 0) return { x: gridX, y: gridY };
    const neighbours = [
      //STRAIGHT at 1 radius UP,DOWN,LEFT,RIGHT
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      //DIAGNOLS at 1 radius
      { x: 1, y: 1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      //STRAIGHT at 2 radius
      { x: 0, y: 2 },
      { x: 0, y: -2 },
      { x: 2, y: 0 },
      { x: -2, y: 0 },
    ]; // CHECK FOR THE AVAILABLE NEIGHBOURS
    const maxCols = this.grids[0].length;
    const maxRows = this.grids.length;

    for (let i = 0; i < neighbours.length; i++) {
      const nx = gridX + neighbours[i].x;
      const ny = gridY + neighbours[i].y;
      //Make sure we dont check outside
      if (nx >= 0 && nx < maxCols && ny >= 0 && ny < maxRows) {
        if (this.grids[ny][nx] === 0) {
          console.log('[CLOSEST]', { x: nx, y: ny });

          return { x: nx, y: ny };
        }
      }
    }
    // Fallback (if it's completely surrounded by walls)
    return { x: gridX, y: gridY };
  }
  // --- PHASER LIFECYCLE ---

  preload() {
    //IMAGE
    this.load.image('map_Skeld', '/maps/Skeld_4k.png');
    this.load.image('mini_map', '/maps/mini_map.png');
    this.load.image('btn_use', '/buttons/use.png');
    this.load.image('btn_report', '/buttons/report.png');
    this.load.image('btn_kill', '/buttons/kill.png');
    this.load.image('btn_vent', '/buttons/vent.png');
    this.load.image('btn_sabotage', '/buttons/sabotage.png');
    //SPRITE
    this.load.spritesheet('player_walk', '/sprites/player_walk.png', {
      frameWidth: 366,
      frameHeight: 320,
      spacing: 5,
    });
    //ATLAS
    this.load.atlas(
      'player_dead',
      '/sprites/dead/player_dead.png',
      '/sprites/dead/player_dead.json',
    );
    this.load.atlas(
      'player_vent',
      '/sprites/vent/player_vent.png',
      '/sprites/vent/player_vent.json',
    );
    this.load.json('level_design', '/maps/level_design.json');
    //SFX
    this.load.audio('sabotage', '/audio/crisis.mp3');
    this.load.audio('kill', '/audio/kill.mp3');
    this.load.audio('report', '/audio/report.mp3');
    this.load.audio('emergencyMeeting', '/audio/emergencyMeeting.mp3');
    this.load.audio('vent', '/audio/vent.mp3');
    this.load.audio('walk', '/audio/walk.mp3');
    /// remaining: tasks audio (success , fail), UI buttons hover
  }

  create() {
    //---CONSTANTS---

    // 1. ENVIRONMENT & MAP
    const map = this.add.image(0, 0, 'map_Skeld').setOrigin(0, 0);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    const mapData = this.cache.json.get('level_design');
    const walls = this.physics.add.staticGroup();

    this.walkSound = this.sound.add('walk', {
      loop: true,
    });

    this.taskGroup = this.physics.add.staticGroup();
    this.emergencyGroup = this.physics.add.staticGroup();
    this.ventGroup = this.physics.add.staticGroup();

    // 2. HARVEST TILEMAP LAYERS
    const collisionLayer = mapData.layers.find(
      (layer: any) => layer.name == 'Collisions',
    );
    const taskLayer = mapData.layers.find(
      (layer: any) => layer.name == 'Tasks',
    );
    const emergencyLayer = mapData.layers.find(
      (layer: any) => layer.name == 'Emergency',
    );
    const ventLayer = mapData.layers.find(
      (layer: any) => layer.name == 'Vents',
    );
    // MAPS -> Locations data
    const LocationLayer = mapData.layers.find(
      (layer: any) => layer.name == 'Locations',
    );

    if (collisionLayer && collisionLayer.objects) {
      collisionLayer.objects.forEach((obj: any) => {
        const centerX = obj.x + obj.width / 2;
        const centerY = obj.y + obj.height / 2;
        const invisibleWall = this.add.rectangle(
          centerX,
          centerY,
          obj.width,
          obj.height,
        );
        this.physics.add.existing(invisibleWall, true);
        invisibleWall.setData('isWall', true);
        walls.add(invisibleWall);
      });
    }

    if (taskLayer && emergencyLayer) {
      taskLayer.objects.forEach((task: any) => {
        const centerX = task.x + task.width / 2;
        const centerY = task.y + task.height / 2;
        const zone = this.add.zone(centerX, centerY, task.width, task.height);
        this.physics.add.existing(zone, true);
        (zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject(); // Ensures static physics body locks to size

        zone.setData('taskID', task.name);
        this.taskGroup.add(zone);
      });

      emergencyLayer.objects.forEach((obj: any) => {
        const centerX = obj.x + obj.width / 2;
        // Note: Added an optional offset here if your "ghost box" is shifted.
        // e.g., const centerX = (obj.x + obj.width / 2) + 200;
        const centerY = obj.y + obj.height / 2;
        const zone = this.add.zone(centerX, centerY, obj.width, obj.height);
        this.physics.add.existing(zone, true);
        (zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        zone.setData('taskID', 'emergency_button');
        this.emergencyGroup.add(zone);
      });
    }

    if (ventLayer) {
      ventLayer.objects.forEach((vent: any) => {
        const centerX = vent.x + vent.width / 2;
        const centerY = vent.y + vent.height / 2;
        const zone = this.add.zone(centerX, centerY, vent.width, vent.height);
        this.physics.add.existing(zone, true);
        (zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        zone.setData(
          'targetVent',
          vent.name.slice(0, 4) + String(Number(vent.name.slice(4)) + 1),
        );
        zone.setData('currVent', vent.name);
        zone.setData('currVentPos', [
          vent.x + vent.width / 2,
          vent.y + vent.height / 2,
        ]);

        this.ventGroup.add(zone);
      });
    }
    if (LocationLayer) {
      LocationLayer.objects.forEach((loc: any) => {
        this.LocationZones.push({
          name: loc.name,
          rect: new Phaser.Geom.Rectangle(loc.x, loc.y, loc.width, loc.height),
        });
      });
    }

    //  MINIMAP
    this.mainMapWidth = map.width;
    this.mainMapHeight = map.height;
    this.minimapContainer = this.add
      .container(20, 20)
      .setScrollFactor(0)
      .setDepth(200);
    this.minimap = this.add
      .image(150, 80, 'mini_map')
      .setOrigin(0, 0)
      .setScale(0.1);
    this.minimapContainer.add(this.minimap);
    this.playerDot = this.add.circle(200, 80, 2, 0x00ff00);
    this.minimapContainer.add(this.playerDot);

    // 4. PLAYER & DUMMIES
    this.player = this.physics.add
      .sprite(2460, 480, 'player_walk')
      .setScale(0.3)
      .setCollideWorldBounds(true);
    this.player.body.setSize(50, 50).setOffset(120, 150);
    this.player.name = 'CHRIS';
    this.player.setData('isDead', false);

    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.pipelines.addPostPipeline('RGBMask', RGBMaskPipeline);

    this.dummies = this.physics.add.group();
    const dum1 = this.dummies.create(2500, 480, 'player_walk');
    this.applyColorPreset(dum1, 'yellow');
    dum1.name = 'yellow';
    const dum2 = this.dummies.create(2100, 480, 'player_walk');
    this.applyColorPreset(dum2, 'pink');
    dum2.name = 'pink';

    this.dummies.children.iterate((dumm: any) => {
      dumm.setData('isDead', false);
      dumm.setData('memory', new Memory());
      dumm.setData('role', 'crewmate');
      dumm.setScale(0.3).setCollideWorldBounds(true);
      dumm.body.setSize(50, 50).setOffset(120, 150);
    });

    this.physics.add.collider(this.player, walls);
    this.physics.add.collider(this.dummies, walls);
    //GRID PATHS
    ///GENERATE MATRIX FOR A*

    this.time.delayedCall(10, () => {
      //:Delaying so that the map can be formed
      const gridRows = Math.ceil(this.mainMapHeight / TILE_SIZE); //y
      const gridCols = Math.ceil(this.mainMapWidth / TILE_SIZE); //x
      for (let row = 0; row < gridRows; row++) {
        const gridRow: number[] = [];
        for (let col = 0; col < gridCols; col++) {
          const tileX = col * TILE_SIZE;
          const tileY = row * TILE_SIZE;
          const samplePoints = [
            { x: tileX + TILE_SIZE * 0.25, y: tileY + TILE_SIZE * 0.25 }, //top-left
            { x: tileX + TILE_SIZE * 0.75, y: tileY + TILE_SIZE * 0.25 }, //top-right
            { x: tileX + TILE_SIZE * 0.5, y: tileY + TILE_SIZE * 0.5 }, //center
            { x: tileX + TILE_SIZE * 0.25, y: tileY + TILE_SIZE * 0.75 }, //bot-left
            { x: tileX + TILE_SIZE * 0.75, y: tileY + TILE_SIZE * 0.75 }, //bot-right
          ];
          let wallSamples = 0;
          samplePoints.forEach((point: any) => {
            const bodies = this.physics.overlapRect(
              point.x,
              point.y,
              5 * 0.6,
              5 * 0.6,
              false,
              true,
            );
            bodies.forEach((body: any) => {
              if (body.gameObject && body.gameObject.getData('isWall')) {
                wallSamples++;
              }
            });
          });
          gridRow.push(wallSamples >= 2 ? 1 : 0);
        }
        this.grids.push(gridRow);
      }

      ///Easy easystar to calculate to routes
      this.easystar = new EasyStar.js();
      this.easystar.setGrid(this.grids);
      this.easystar.setAcceptableTiles([0]);
      this.easystar.enableDiagonals();
      this.easystar.disableCornerCutting();
      //not working: upper engine,lower engine, storage
      const moveToLoc1 = this.getLocationCoordinates('lower engine');
      const moveToLoc2 = this.getLocationCoordinates('reactor');
      this.commandBotToLocation(dum1, moveToLoc1.x, moveToLoc1.y); //TEST dummies -> nav
      this.commandBotToLocation(dum2, moveToLoc2.x, moveToLoc2.y); //TEST dummies -> nav
    });
    // 5. ZONES & UI (The Fixes)
    this.killZone = this.add.zone(0, 0, 200, 200);
    this.physics.add.existing(this.killZone);
    (this.killZone.body as Phaser.Physics.Arcade.Body).moves = false;

    this.interactZone = this.add.zone(0, 0, 150, 150);
    this.physics.add.existing(this.interactZone);
    (this.interactZone.body as Phaser.Physics.Arcade.Body).moves = false;
    this.visibleZones = this.physics.add.group();
    this.dummies.children.iterate((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      const zone = this.add.zone(dummy.x, dummy.y, 800, 800);
      this.physics.add.existing(zone);
      (zone.body as Phaser.Physics.Arcade.Body).moves = false;

      zone.setData('zoneOwner', dummy.name);
      dummy.setData('visibleZone', zone);

      this.visibleZones.add(zone);
    });

    this.setPlayerRole('impostor'); // Try testing with 'crewmate' or 'impostor'
    // 6. DARKNESS & CAM
    this.cameras.main.setBackgroundColor('#000000');
    this.LightCanvas = document.createElement('canvas');
    this.LightCanvas.width = 3000;
    this.LightCanvas.height = 3000;
    this.LightContext = this.LightCanvas.getContext('2d');
    this.LightTexture = this.textures.addCanvas(
      'soft_light_huge',
      this.LightCanvas,
    );
    this.toggleLight(true);

    this.darkness = this.add
      .rectangle(0, 0, map.width, map.height, 0x000000, 1)
      .setOrigin(0, 0)
      .setDepth(100);
    this.flashlight = this.make.image({
      x: 0,
      y: 0,
      key: 'soft_light_huge',
      add: false,
    });
    const mask = new Phaser.Display.Masks.BitmapMask(this, this.flashlight);
    mask.invertAlpha = true;
    this.darkness.setMask(mask);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D');

    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player_walk', {
        start: 0,
        end: 12,
      }),
      frameRate: 25,
      repeat: -1,
    });
    this.anims.create({
      key: 'die',
      frames: this.anims.generateFrameNames('player_dead', {
        prefix: 'Dead',
        start: 1,
        end: 42,
        zeroPad: 4,
        suffix: '.png',
      }),
      frameRate: 25,
      repeat: 0,
    });
    this.anims.create({
      key: 'vent',
      frames: this.anims.generateFrameNames('player_vent', {
        prefix: 'Vent',
        start: 1,
        end: 7,
        zeroPad: 4,
        suffix: '.png',
      }),
      frameRate: 45,
      repeat: 0,
    });

    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.player, true, 0.5, 0.5).setZoom(1.25);
  }

  update() {
    // 1. RESET STATE FIRST (so that buttons can have low alpha )
    this.currentTask = null;
    this.currentTarget = null;
    this.reportTarget = false;
    this.targetVent = null;

    // 2. TRACK ZONES TO PLAYER
    this.killZone.setPosition(this.player.x, this.player.y);
    this.interactZone.setPosition(this.player.x, this.player.y);

    // 3. RUN PHYSICS LOGIC
    // Check Tasks (Crewmate only)
    if (this.playerRole === 'crewmate') {
      this.physics.overlap(
        this.interactZone,
        this.taskGroup,
        (_zone, target) => {
          if (target instanceof Phaser.GameObjects.GameObject) {
            this.currentTask = target.getData('taskID');
          }
        },
      );
    }
    if (this.playerRole === 'impostor') {
      this.physics.overlap(this.interactZone, this.ventGroup, (_zone, vent) => {
        if (vent instanceof Phaser.GameObjects.GameObject) {
          this.targetVent = vent.getData('targetVent');
          this.currVentPos = vent.getData('currVentPos');
        }
      });
    }
    //AI VISIBLE ZONE
    if (this.dummies && this.visibleZones) {
      this.dummies.children.iterate((d: any) => {
        const dummy = d as Phaser.Physics.Arcade.Sprite;
        const zone = dummy.getData('visibleZone');
        if (zone) {
          zone.x = dummy.x;
          zone.y = dummy.y;
        }
        const prevLoc = dummy.getData('loc') || '';
        const currLoc = this.getLocation(dummy.x, dummy.y);

        if (dummy.getData('role') === 'crewmate' && !dummy.getData('isDead')) {
          if (currLoc != prevLoc) {
            dummy.setData('loc', currLoc);
            dummy.getData('memory').writeMyActivity('walking', currLoc);
          }
        }
      });
      this.physics.overlap(
        this.visibleZones,
        [this.dummies, this.player],
        (z, d) => {
          const dummy = d as Phaser.Physics.Arcade.Sprite;
          const zone = z as Phaser.GameObjects.Zone;
          const zoneOwnerName = zone.getData('zoneOwner');
          const zoneOwner = this.dummies
            .getChildren()
            .find((b: any) => b.name === zoneOwnerName) as any;
          //CoolDown timer
          const currTime = this.time.now;
          const coolDownTime = 5 * 1000; //a dummy can be observed only every 5 seconds
          const blinkKey = `lastseenby_${zoneOwnerName}`;
          const lastSeen = dummy.getData(blinkKey) || 0;

          if (currTime - lastSeen > coolDownTime) {
            if (!zoneOwner) {
              return;
            }
            if (zoneOwnerName !== dummy.name && !dummy.getData('isDead')) {
              console.log(dummy.name, 'IS BEING OBSERVED BY', zoneOwnerName);
              const loc = this.getLocation(dummy.x, dummy.y);
              zoneOwner
                ?.getData('memory')
                .writeSight(
                  zoneOwner,
                  dummy.name,
                  dummy.getData('isDead'),
                  loc,
                );
              dummy.setData(blinkKey, currTime);

              console.log(
                'OBSERVED BY',
                zoneOwnerName,
                'BLACK SHEEP',
                dummy.name,
              );
              // const dummyPos ={x:dummy.x, y:dummy.y}
              this.taskGroup.getChildren().forEach((t: any) => {
                const dist = Phaser.Math.Distance.Between(
                  dummy.x,
                  dummy.y,
                  t.x,
                  t.y,
                );
                if (dist < 100 && !dummy.getData('isDead')) {
                  const taskID = t.getData('taskID');
                  const timeAtTask = dummy.getData('timeAtTask') || 0;
                  dummy.setData('timeAtTask', timeAtTask + coolDownTime);
                  zoneOwner
                    .getData('memory')
                    .writeOthersActivity(
                      zoneOwner,
                      dummy.name,
                      taskID,
                      dummy.getData('timeAtTask') / 1000,
                    );
                }
              });
            }
          }
        },
      );
    }

    // Check Emergency Button (Everyone)
    this.physics.overlap(this.interactZone, this.emergencyGroup, () => {
      this.currentTask = 'emergency_button';
    });

    // Check Kills & Reports
    const aliveTargets: any[] = [];
    const deadTargets: any[] = [];

    this.physics.overlap(this.killZone, this.dummies, (_zone, dumm) => {
      const dummy = dumm as Phaser.Physics.Arcade.Sprite;
      if (dummy.getData('isDead')) {
        deadTargets.push(dummy);
      } else {
        aliveTargets.push(dummy);
      }
    });

    if (aliveTargets.length === 1) {
      this.currentTarget = aliveTargets[0];
    } else if (aliveTargets.length > 1) {
      let shortestDist = 150;
      aliveTargets.forEach((dummy) => {
        const dist = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          dummy.x,
          dummy.y,
        );
        if (dist < shortestDist) {
          shortestDist = dist;
          this.currentTarget = dummy;
        }
      });
    }

    if (deadTargets.length > 0) {
      this.reportTarget = true;
    }

    // 4. UPDATE UI LAST
    if (this.uiGroup) {
      this.uiGroup.getChildren().forEach((btnObj: any) => {
        const btn = btnObj as Phaser.GameObjects.Image;
        const key = btn.texture.key;
        const cdText = btn.getData('cdText') as Phaser.GameObjects.Text;

        let shouldBeActive = false; //priority for SPACE: vent > use > sabotage
        let timeRemaining = 0;
        if (key === 'btn_use') {
          shouldBeActive = !!this.currentTask;
        } else if (key === 'btn_kill') {
          timeRemaining = Math.ceil(this.nextKillTime - this.time.now) / 1000;
          shouldBeActive = !!this.currentTarget && timeRemaining <= 0;
        } else if (key === 'btn_report') {
          shouldBeActive = this.reportTarget;
        } else if (key === 'btn_vent') {
          if (this.targetVent) {
            shouldBeActive = true;
          }
        } else if (key === 'btn_sabotage') {
          timeRemaining =
            Math.ceil(this.nextSabotageTime - this.time.now) / 1000;
          if (!this.targetVent && !this.currentTask)
            shouldBeActive = timeRemaining <= 0;
        }
        if (timeRemaining > 0) {
          btn.setAlpha(0.3).disableInteractive().setData('isActive', false);
          cdText.setText(timeRemaining.toString());
        } else {
          cdText.setText('');
          if (shouldBeActive) {
            btn.setAlpha(1).setInteractive().setData('isActive', true);
          } else {
            btn.setAlpha(0.3).disableInteractive().setData('isActive', false);
          }
        }
      });
    }

    // 5. MINIMAP LOGIC
    const miniMapWidth = this.minimap.width * this.minimap.scaleX;
    const miniMapHeight = this.minimap.height * this.minimap.scaleY;
    const ratioX = miniMapWidth / this.minimap.width - 0.055;
    const ratioY = miniMapHeight / this.minimap.height - 0.05;
    this.playerDot.x = this.player.x * ratioX + 150;
    this.playerDot.y = this.player.y * ratioY + 80;

    // 6. DARKNESS/FLASHLIGHT
    this.flashlight.x = this.player.x;
    this.flashlight.y = this.player.y;

    // 7. PLAYER MOVEMENT
    const speed = 400;
    this.player.setVelocity(0);
    let isMoving = false;

    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
      isMoving = true;
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
      isMoving = true;
    }

    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      this.player.setVelocityY(-speed);
      isMoving = true;
    } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
      this.player.setVelocityY(speed);
      isMoving = true;
    }
    if (isMoving) {
      this.player.play('walk', true);
      if (!this.walkSound.isPlaying) {
        this.walkSound.play();
      }
    } else {
      if (this.isIdle) {
        this.player.stop();
        this.player.setFrame(12);
        if (this.walkSound.isPlaying) {
          this.walkSound.pause();
        }
      }
    }
    this.player.body.velocity.normalize().scale(speed);
    //DUMMY MOVEMENT
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (dummy.getData('isTravelling')) {
        const path: { x: number; y: number }[] =
          dummy.getData('currentPath') || [];
        if (path.length > 0) {
          const nextStep = path[0];
          const distance = Phaser.Math.Distance.Between(
            dummy.x,
            dummy.y,
            nextStep.x,
            nextStep.y,
          );
          if (distance < 50) {
            //10px of inaccuracy is accepted
            path.shift();
            if (path.length === 0) {
              dummy.body?.reset(nextStep.x, nextStep.y);
              dummy.stop();
              dummy.setFrame(12);
              dummy.setData('isTravelling', false);
            }
          } else {
            this.physics.moveTo(dummy, nextStep.x, nextStep.y, speed);
            dummy.play('walk', true);
            if ((dummy.body as Phaser.Physics.Arcade.Body).velocity.x < 0)
              dummy.setFlipX(true);
            if ((dummy.body as Phaser.Physics.Arcade.Body).velocity.x > 0)
              dummy.setFlipX(false);
          }
        }
      }
    });
  }
}
export const configCafe = {
  type: Phaser.AUTO,
  parent: '_GAME-CONTAINER', // HTML CLASS NAME WHERE THIS "GAME" will be contained
  scene: BasicScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: '_GAME-CONTAINER',
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: true, // TODO: remove this , for dev purpose , since it draws rectangle aroung the player
    },
  },
};
