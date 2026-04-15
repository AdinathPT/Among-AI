/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from 'phaser';
import { CrewmateColors, RGBMaskPipeline } from './RGBShader';
import type { PlayerData } from '../components/MeetingModal';
import Memory from '../data/memory';
import * as EasyStar from 'easystarjs';
//---CONSTANTS---
interface TYPEtask {
  name: string;
  timeRange: number[];
}
// type TYPELocations =
//   | 'cafeteria'
//   | 'upper engine'
//   | 'lower engine'
//   | 'between upper and lower engine'
//   | 'reactor'
//   | 'security'
//   | 'medbay'
//   | 'between engine and cafeteria'
//   | 'weapons'
//   | 'o2'
//   | 'nav'
//   | 'between nav and o2'
//   | 'shield'
//   | 'between storage and admin'
//   | 'communication'
//   | 'between storage and shield'
//   | 'storage'
//   | 'admin'
//   | 'storage (right)'
//   | 'storage (left)'
//   | 'storage (lower)'
//   | 'between shield and nav'
//   | 'between lower engine and electrical'
//   | 'between electrical and storage'
//   | 'electrical'
//   | 'lower engine (right)'
//   | 'upper engine (lower)'
//   | 'upper engine (right)'
//   | 'lower engine (upper)';
const TILE_SIZE = 25;
const ALL_TASKS: TYPEtask[] = [
  { name: 'cardTask', timeRange: [10, 15] },
  { name: 'eleTask', timeRange: [15, 25] },
  { name: 'reactorTask', timeRange: [20, 30] },
  { name: 'navTask', timeRange: [15, 20] },
  { name: 'chairTask', timeRange: [30, 45] },
];
const emergency_button_loc = { x: 2100, y: 500 };

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
  playerInteractZone!: Phaser.GameObjects.Zone;
  visibleZones!: Phaser.Physics.Arcade.Group;
  dummiesInteractZones!: Phaser.Physics.Arcade.Group;
  // CURRENT STATE
  isIdle: boolean = true;
  isMeetingCalled: boolean = false;
  isSabotaged: boolean = false;
  reportTarget: boolean = false;
  currentTask: string | null = null;
  targetVent: string | null = null;
  nextSabotageTime: number = 0;
  currentTarget: any = null;
  isDummyImpostor: boolean = false;
  currVentPos: number[] = [];
  //PROGRESS
  totalNoOfTasks: number = 4 * 5;
  progressBarBg!: Phaser.GameObjects.Rectangle;
  progressBarFill!: Phaser.GameObjects.Rectangle;

  taskListGroup!: Phaser.GameObjects.Group;
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
      () => this.executeReport(this.player.name),
    );
    this.uiGroup.add(useBtn);
    this.uiGroup.add(reportBtn);
    if (this.playerRole === 'impostor') {
      //priority for SPACE: vent > use > sabotage
      this.uiGroup.add(
        this.createButton(sw - 530, sh - 130, 'btn_sabotage', 'SPACE', () =>
          this.executeSabotage(this.player),
        ),
      );
      this.uiGroup.add(
        this.createButton(sw - 220, sh - 280, 'btn_kill', 'Q', () =>
          this.executeKill(this.player, this.currentTarget),
        ),
      );
      this.uiGroup.add(
        this.createButton(sw - 380, sh - 130, 'btn_vent', 'SPACE', () =>
          this.executeVent(
            this.player,
            this.currVentPos[0],
            this.currVentPos[1],
            this.targetVent!,
          ),
        ),
      );
    }
    //[Progress Bar]
    this.progressBarBg = this.add
      .rectangle(sw - 350, 100, 300, 30, 0x444444) // FIX: Visible gray background
      .setScrollFactor(0)
      .setDepth(900)
      .setStrokeStyle(4, 0xffffff);
    this.progressBarBg = this.add
      .rectangle(sw - 350, 100, 300, 30, 0x000000)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(4, 0x333333);
    this.progressBarFill = this.add
      .rectangle(sw - 500, 100, 0, 30 - 4, 0x00ff00)
      .setScrollFactor(0)
      .setDepth(1001);
    this.renderTaskList();
    // this.uiGroup.add(this.progressBarBg);
    // this.uiGroup.add(this.progressBarFill);
  }

  // --- GAMEPLAY ACTIONS ---
  executeKill(
    killer: Phaser.Physics.Arcade.Sprite,
    victim: Phaser.Physics.Arcade.Sprite,
  ) {
    const nextKillTime = killer.getData('nextKillTime') || 0;
    if (this.time.now < nextKillTime || !victim || victim.getData('isDead'))
      return;
    console.log(
      `[ALL THE MEMORIES OF ${victim.name.toUpperCase()}]:`,
      victim.getData('memory').readSight(),
      victim.getData('memory').readOthersActivity(),
      victim.getData('memory').readMyActivity(),
    );

    // 2. LOBOTOMIZE THE AI (Stop pathfinding)
    victim.setData('isDead', true);
    this.reallocateTasks(victim);
    (victim.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    victim.setData('isTravelling', false);
    victim.setData('currentPath', []);

    // 4. Stop current animation and play 'die'
    victim.stop(); // Calling .stop() with no args halts everything
    victim.play('die');
    this.sound.play('kill', { volume: 0.5 });
    this.broadcastKill(killer.name, victim.name, victim.x, victim.y);
    killer.setPosition(victim.x, victim.y);
    killer.setData('nextKillTime', this.time.now + 10 * 1000); //10 second cooldown time
    killer.setData('currentTarget', null);
    if (killer.name === this.player.name) this.currentTarget = null;
    this.checkWinCondition();
  }
  executeReport(reportedBy: string) {
    // Only allow report if there's a body OR we are at the emergency button
    if (!this.reportTarget && !this.isMeetingCalled) return;

    const tableX = 2250,
      tableY = 500;
    console.warn(`DEAD BODY REPORTED BY ${reportedBy}`);

    const survivors = [this.player];

    this.dummies.getChildren().forEach((d: any) => {
      if (!d.getData('isDead')) survivors.push(d);
    });
    this.sound.play('report');

    Phaser.Actions.PlaceOnCircle(
      survivors,
      new Phaser.Geom.Circle(tableX, tableY, 180),
    );
    this.broadcastMajorEvent(
      `Emergency Meeting / Dead Body reported by ${reportedBy.toUpperCase()}`,
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
      this.isMeetingCalled = true; // FIX: Lock the meeting state immediately!
      this.sound.play('emergencyMeeting', { volume: 0.3 });

      setTimeout(() => {
        this.executeReport(this.player.name);
      }, 1500);
    } else {
      this.physics.pause();
      this.scene.pause();

      if ((window as any).triggerTask) {
        (window as any).triggerTask(this.currentTask);
      }
    }
  }
  executeVent(
    ventingSprite: Phaser.Physics.Arcade.Sprite,
    startX: number,
    startY: number,
    targetVentName: string,
  ) {
    let exitX = 0;
    let exitY = 0;
    // ADD THIS: lock player movement during the vent
    if (ventingSprite.name === this.player.name) {
      this.isIdle = false;
    }

    const targetVent = this.ventGroup
      .getChildren()
      .find(
        (v: any) => v.getData('currVent') === targetVentName,
      ) as Phaser.GameObjects.Zone;

    if (targetVent) {
      exitX = targetVent.x;
      exitY = targetVent.y;
    } else {
      exitX = 2646;
      exitY = 580;
      console.warn(
        `[VENT] Could not find exit vent: ${targetVentName} --> return to vent1`,
      );
      // return;
    }

    ventingSprite.setPosition(startX, startY);
    this.sound.play('vent');

    setTimeout(() => {
      ventingSprite.play('vent');
    }, 120);
    setTimeout(() => {
      // ventingSprite.setAlpha(0);
    }, 500);
    console.log(ventingSprite);

    this.broadcastVent(ventingSprite.name, startX, startY);

    setTimeout(() => {
      ventingSprite.setPosition(exitX, exitY);
      ventingSprite.setAlpha(1);
      // ventingSprite.play('vent');

      console.warn(ventingSprite.name, this.player.name);
      if (ventingSprite.name === this.player.name) {
        this.isIdle = true; // Unlock player movement
      } else {
        ventingSprite.setData('isCurrentlyVenting', false);
      }
    }, 1000);
  }
  executeSabotage(impostor: Phaser.Physics.Arcade.Sprite) {
    const nextSabotageTime = impostor.getData('nextSabotageTime') || 0;
    if (this.time.now < nextSabotageTime) return;
    console.log(`🚨 [SABOTAGE] ${impostor.name} cut the lights!`);
    this.isSabotaged = true;
    this.toggleLight(false);
    this.sound.play('sabotage', { volume: 0.5, loop: true });
    impostor.setData('nextSabotageTime', this.time.now + 25 * 1000);
    this.broadcastMajorEvent('The lights were sabotaged');
    this.time.delayedCall(10 * 1000, () => {
      this.isSabotaged = false;
      this.toggleLight(true);
      this.sound.stopByKey('sabotage');
    });
    // this.broadcastMajorEvent('The lights were fixed');
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

  broadcastVent(venterName: string, ventX: number, ventY: number) {
    this.visibleZones.getChildren().forEach((z: any) => {
      const zone = z as Phaser.GameObjects.Zone;
      const observerName = zone.getData('visibleZoneOwner');
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
          this.commandBotToSpot(
            observerSprite,
            emergency_button_loc.x,
            emergency_button_loc.y,
          );
          observerSprite.setData('isWorking', false);
          observerSprite.setData('isPanicking', true);
          observerSprite.setData('venterName', venterName);
          console.log(observerSprite);

          observerSprite
            .getData('memory')
            .writeAllegation(venterName, 'VENTING', room);
        }
      }
    });
  }
  broadcastKill(
    killerName: string,
    victimName: string,
    killX: number,
    killY: number,
  ) {
    this.visibleZones.getChildren().forEach((z: any) => {
      const zone = z as Phaser.GameObjects.Zone;
      const observerName = zone.getData('visibleZoneOwner');
      const body = zone.body as Phaser.Physics.Arcade.Body;

      // Skip if the observer is the killer, or if the observer is the victim
      if (observerName === killerName || observerName === victimName) return;

      const isInside =
        killX >= body.x &&
        killX <= body.right &&
        killY >= body.y &&
        killY <= body.bottom;

      if (isInside) {
        const observerSprite = this.dummies
          .getChildren()
          .find((d: any) => d.name === observerName) as any;

        if (observerSprite && !observerSprite.getData('isDead')) {
          const room = this.getLocation(killX, killY);

          console.log(
            `🚨 [CAUGHT]: ${observerName} saw ${killerName} MURDER ${victimName}!`,
          );

          // Log the Hard Violation
          observerSprite
            .getData('memory')
            .writeAllegation(killerName, 'KILLING', room);

          // Panic and run to the button!
          this.commandBotToSpot(
            observerSprite,
            emergency_button_loc.x,
            emergency_button_loc.y,
          );
          observerSprite.setData('isWorking', false);
          observerSprite.setData('isPanicking', true);
          observerSprite.setData('venterName', killerName); // Reusing this variable for the panic alert
        }
      }
    });
  }

  easyStarPathTraveller(
    dummy: Phaser.Physics.Arcade.Sprite,
    endX: number,
    endY: number,
  ) {
    if (!this.easystar) {
      console.log(
        `[AI] EasyStar is not ready yet. ${dummy.name} command ignored.`,
      );
      return;
    }
    const maxCols = this.grids[0].length - 1;
    const maxRows = this.grids.length - 1;

    const startGridX: number = Phaser.Math.Clamp(
      Math.floor(dummy.x / TILE_SIZE),
      0,
      maxCols,
    );
    const startGridY: number = Phaser.Math.Clamp(
      Math.floor(dummy.y / TILE_SIZE),
      0,
      maxRows,
    );
    const endGridX: number = Phaser.Math.Clamp(
      Math.floor(endX / TILE_SIZE),
      0,
      maxCols,
    );
    const endGridY: number = Phaser.Math.Clamp(
      Math.floor(endY / TILE_SIZE),
      0,
      maxRows,
    );

    this.easystar.findPath(
      startGridX,
      startGridY,
      endGridX,
      endGridY,
      (path: any) => {
        if (dummy.getData('isDead')) return;
        if (path === null) {
          console.warn(
            `[${dummy.name}] cant find the path to`,
            endGridX,
            endGridY,
          );
          dummy.setData('currentPath', []);
        } else {
          const worldPath = path.map((node: any) => ({
            x: node.x * TILE_SIZE + TILE_SIZE / 2,
            y: node.y * TILE_SIZE + TILE_SIZE / 2,
          }));
          console.log(
            `[AI] ${dummy.name} found a path in ${worldPath.length} steps`,
          );
          dummy.setData('currentPath', worldPath);
          dummy.setData('isTravelling', true);
        }
      },
    );
    this.easystar.calculate();
  }
  //[PROGRESS BAR]
  updateTaskProgress() {
    let totalTasks = 0;
    let completedTasks = 0;
    if (this.playerRole === 'crewmate') {
      totalTasks += this.player.getData('todoTasksIndex')?.length || 0;
      completedTasks += this.player.getData('completedTasks')?.length || 0;
    }
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (dummy.getData('role') === 'crewmate') {
        totalTasks += dummy.getData('todoTasksIndex')?.length || 0;
        completedTasks += dummy.getData('currTaskIndex') || 0;
      }
    });
    if (totalTasks === 0) return;
    const percentage = completedTasks / totalTasks;
    const maxBarWidth = 300;
    console.warn(maxBarWidth, percentage);

    this.tweens.add({
      targets: this.progressBarFill,
      width: maxBarWidth * percentage,
      duration: 500,
      ease: 'Sine.easeOut',
    });
    if (percentage >= 1) {
      console.log('👑 CREWMATES WON THE MATCH');
      if ((window as any).triggerGameOver) {
        (window as any).triggerGameOver('crewmate');
      }
    }
    this.renderTaskList();
  }
  reallocateTasks(victim: Phaser.Physics.Arcade.Sprite) {
    // 1. Universal Role Check (Fixes the bug where the Player was ignored)
    const victimRole =
      victim === this.player ? this.playerRole : victim.getData('role');
    if (victimRole !== 'crewmate') return;

    // 2. Extract remaining tasks based on WHO died
    let remainingTasks: number[] = [];
    const todo = victim.getData('todoTasksIndex') || [];

    if (victim.name === this.player.name) {
      // It's the Player! Filter out the strings they already saved in their array
      const completedNames = victim.getData('completedTasks') || [];
      remainingTasks = todo.filter((taskIndex: number) => {
        const taskName = ALL_TASKS[taskIndex].name;
        return !completedNames.includes(taskName); // Keep it if it's NOT completed
      });
    } else {
      // It's a Dummy! Slice the array from their current integer index
      const curr = victim.getData('currTaskIndex') || 0;
      remainingTasks = todo.slice(curr);
    }

    if (remainingTasks.length === 0) return;

    console.log(
      `📋 Reallocating ${remainingTasks.length} tasks from dead ${victim.name}`,
    );

    // 3. Find alive workers
    const aliveWorkers: Phaser.Physics.Arcade.Sprite[] = [];
    if (this.playerRole === 'crewmate' && !this.player.getData('isDead')) {
      aliveWorkers.push(this.player);
    }
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (dummy.getData('role') === 'crewmate' && !dummy.getData('isDead')) {
        aliveWorkers.push(dummy);
      }
    });

    if (aliveWorkers.length === 0) return; // Impostors win

    // 4. Distribute tasks
    remainingTasks.forEach((taskIndex: number, i: number) => {
      const unluckyWorker = aliveWorkers[i % aliveWorkers.length];
      const theirTasks = unluckyWorker.getData('todoTasksIndex') || [];

      theirTasks.push(taskIndex);

      unluckyWorker.setData('todoTasksIndex', theirTasks);
      unluckyWorker.setData('isAllTaskDone', false); // Wake them up if they were done!
    });

    // 5. Wipe the victim's memory completely
    victim.setData('todoTasksIndex', []);
    if (victim.name === this.player.name) {
      victim.setData('completedTasks', []);
    } else {
      victim.setData('currTaskIndex', 0);
    }

    // 6. Redraw the UI
    this.renderTaskList();
  }
  renderTaskList() {
    if (this.taskListGroup) {
      this.taskListGroup.clear(true, true);
    } else {
      this.taskListGroup = this.add.group();
    }
    if (this.playerRole === 'impostor' || this.player.getData('isDead')) return;

    const todo = this.player.getData('todoTasksIndex') || [];
    const completed = this.player.getData('completedTasks') || [];

    const startX = this.cameras.main.width - 350;
    let startY = 150;
    console.warn('todo', todo, 'curr', completed);
    todo.forEach((taskIndex: number) => {
      const taskName = ALL_TASKS[taskIndex].name;
      const isCompleted = completed.includes(taskName);

      const textColor = isCompleted ? '#00ff00' : '#ff4444';
      const prefix = isCompleted ? '✓ ' : '☐ ';

      const taskText = this.add
        .text(startX, startY, prefix + taskName, {
          fontSize: '18px',
          fontFamily: 'Orbitron',
          color: textColor,
          fontStyle: 'bold',
        })
        .setScrollFactor(0)
        .setDepth(400);
      if (isCompleted) taskText.setAlpha(0.4);
      this.taskListGroup.add(taskText);
      startY += 25;
    });
  }
  checkWinCondition() {
    let aliveCrew: number = 0;

    if (!this.player.getData('isDead')) {
      if (this.playerRole === 'crewmate') {
        aliveCrew++;
      }
    } else {
      this.player.setVelocity(0); // If dead, do absolutely nothing!
    }
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (!dummy.getData('isDead')) {
        if (dummy.getData('role') === 'crewmate') {
          aliveCrew++;
        }
      }
    });
    if (aliveCrew === 0) {
      console.log('🔪 IMPOSTORS WIN!');
      this.physics.pause(); // Freeze the game

      if ((window as any).triggerGameOver) {
        (window as any).triggerGameOver('impostor');
      }
    }
    if (this.player.getData('isDead')) {
      this.physics.pause(); // Freeze the game

      if ((window as any).triggerGameOver) {
        (window as any).triggerGameOver(
          this.playerRole === 'impostor' ? 'crewmate' : 'crewmate',
        );
      }
    }
  }
  processEjection(ejectedId: string | null) {
    if (!ejectedId) {
      console.log('⚖️ TRIBUNAL: No one was ejected. (Tie or Skipped)');
      return;
    }

    console.log(`⚖️ TRIBUNAL: ${ejectedId.toUpperCase()} was ejected!`);

    // 1. Destroy Human Player Physics
    if (this.player.name === ejectedId) {
      this.player.setData('isDead', true);
      this.player.setVisible(false);
      if (this.player.body) this.player.body.enable = false; // Turn off physics!

      this.killZone.destroy();
      this.playerInteractZone.destroy();

      this.reallocateTasks(this.player);
    }
    // 2. Destroy AI Dummy Physics
    else {
      const dummy = this.dummies
        .getChildren()
        .find((d: any) => d.name === ejectedId) as Phaser.Physics.Arcade.Sprite;

      if (dummy) {
        dummy.setData('isDead', true);
        dummy.setVisible(false);
        if (dummy.body) dummy.body.enable = false; // Turn off physics!

        // Destroy their zones and erase the references to save computation
        const vz = dummy.getData('visibleZone');
        if (vz) {
          vz.destroy();
          dummy.setData('visibleZone', null);
        }

        const iz = dummy.getData('interactZone');
        if (iz) {
          iz.destroy();
          dummy.setData('interactZone', null);
        }

        dummy.setData('isWorking', false);
        dummy.setData('isTravelling', false);
        dummy.setData('currentPath', []);

        this.reallocateTasks(dummy);
      }
    }

    this.checkWinCondition();
  }
  //GETS
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
    return { x: 2600, y: 500 }; // table coord
  }
  getTaskCoordinates(name: string): { x: number; y: number } {
    const foundTask = this.taskGroup
      .getChildren()
      .find((task) => task.name === name);

    if (foundTask) {
      const body = foundTask.body as Phaser.Physics.Arcade.Body;
      return {
        x: body?.x + body?.halfWidth,
        y: body?.y + body?.halfHeight,
      };
    }
    console.error('[ERROR]: GIVE PROPER TASK NAME');
    return { x: 2600, y: 500 };
  }
  getVentCoordinates(name: string): { x: number; y: number } {
    const foundTask = this.ventGroup
      .getChildren()
      .find((task) => task.name === name);
    if (foundTask) {
      const body = foundTask.body as Phaser.Physics.Arcade.Body;
      return {
        x: body?.x + body?.halfWidth,
        y: body?.y + body?.halfHeight,
      };
    }
    console.error('[ERROR]: GIVE PROPER TASK NAME');
    return { x: 2600, y: 500 };
  }
  gridDebug() {
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
  }
  broadcastMajorEvent(eventName: string) {
    // 1. Give it to the human player
    if (!this.player.getData('isDead')) {
      this.player.getData('memory')?.writeMajorEvent(eventName);
    }

    // 2. Give it to all alive dummies
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (!dummy.getData('isDead')) {
        dummy.getData('memory')?.writeMajorEvent(eventName);
      }
    });
  }
  requestSusVote(dummyName: string, aliveIds: string[]): string {
    const dummy = this.dummies
      .getChildren()
      .find((d: any) => d.name === dummyName) as Phaser.Physics.Arcade.Sprite;
    if (dummy) {
      const memory = dummy.getData('memory') as Memory;
      return memory.getVoteDecision(aliveIds);
    }
    return 'skip';
  }
  //COMMANDS
  commandBotToSpot(
    dummy: Phaser.Physics.Arcade.Sprite,
    targetX: number,
    targetY: number,
  ) {
    // this.gridDebug();
    console.log(`[${dummy.name}] wants to go to ${targetX}, ${targetY}`);
    dummy.setData('isTravelling', true);
    this.easyStarPathTraveller(dummy, targetX, targetY);
  }
  commandBotToFollow(
    dummy: Phaser.Physics.Arcade.Sprite,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    dummy.setData('isFollowing', true);
    dummy.setData('followTarget', target);
    dummy.setData('lastPingTime', 0);
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
  //---BRIDGE / for REACT---
  resumeGameAfterMeeting() {
    this.isMeetingCalled = false; // Unlock the button
    this.reportTarget = false;
    this.currentTask = null;
    // Clean Human Player Body
    if (this.player.getData('isDead')) {
      this.player.setData('isSwept', true);
      this.player.setVisible(false);
      if (this.player.body) this.player.body.enable = false;
    }

    // Clean AI Bodies & Zones
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      dummy.setData('isPanicking', false);

      if (dummy.getData('isDead') && !dummy.getData('isSwept')) {
        dummy.setData('isSwept', true);
        dummy.setVisible(false);
        if (dummy.body) dummy.body.enable = false;

        // Destroy the zones so the engine stops checking overlaps!
        const vz = dummy.getData('visibleZone');
        if (vz) {
          vz.destroy();
          dummy.setData('visibleZone', null);
        }

        const iz = dummy.getData('interactZone');
        if (iz) {
          iz.destroy();
          dummy.setData('interactZone', null);
        }
      }
    });
    // FIX: Flush "Sticky Keys" so the player doesn't run off by themselves!
    if (this.input.keyboard) {
      this.input.keyboard.resetKeys();
    }
    this.scene.resume();
    this.physics.resume();
  }
  completePlayerTask(completedTaskID: string) {
    // <--- Now it accepts the ID!
    // 1. Grab the array of finished tasks (or make a new one)
    const completed = this.player.getData('completedTasks') || [];

    // 2. Prevent duplicates (just in case they spam the button)
    if (!completed.includes(completedTaskID)) {
      completed.push(completedTaskID);
      this.player.setData('completedTasks', completed);
    }

    // 3. Update UI and Unpause
    this.updateTaskProgress();
    this.currentTask = null;
    this.scene.resume();
    this.physics.resume();

    console.log(
      `[PLAYER] Finished ${completedTaskID}! (${completed.length}/4)`,
    );
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
    //---REACTJS BRIDGE---
    //EXPOSE MEMBERS TO REACT
    (window as any).resumePhaserGame = this.resumeGameAfterMeeting.bind(this);
    (window as any).completedPlayerTasks = this.completePlayerTask.bind(this);
    (window as any).processEjection = this.processEjection.bind(this);
    (window as any).requestSusVote = this.requestSusVote.bind(this);

    // 1. ENVIRONMENT & MAP
    const map = this.add.image(0, 0, 'map_Skeld').setOrigin(0, 0);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    const mapData = this.cache.json.get('level_design');
    const walls = this.physics.add.staticGroup();
    this.time.delayedCall(100, () => {
      this.updateTaskProgress();
    });
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
        zone.name = task.name;
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
        zone.name = vent.name;
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

    //  [PLAYER] & [DUMMIES]
    this.player = this.physics.add
      .sprite(2460, 480, 'player_walk')
      .setScale(0.3)
      .setCollideWorldBounds(true);
    this.player.body.setSize(50, 50).setOffset(120, 150);
    this.player.name = 'CHRIS';
    this.player.setData('isDead', false);
    this.player.setData('nextKillTime', 0);
    this.player.setData('currTaskIndex', 0);
    this.player.setData('nextSabotageTime', 0);
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.pipelines.addPostPipeline('RGBMask', RGBMaskPipeline);

    this.dummies = this.physics.add.group();
    const dum1 = this.dummies.create(2500, 480, 'player_walk');
    this.applyColorPreset(dum1, 'yellow');
    dum1.name = 'yellow';
    this.isDummyImpostor = true;
    dum1.setData('role', 'crewmate');
    dum1.setData('todoTasksIndex', [0, 2, 4, 1, 3]);
    dum1.setData('isAllTaskDone', false);
    const dum2 = this.dummies.create(2100, 480, 'player_walk');
    this.applyColorPreset(dum2, 'pink');
    dum2.name = 'pink';
    dum2.setData('todoTasksIndex', [1, 0, 3, 2, 4]);
    dum1.setData('isAllTaskDone', false);
    dum2.setData('role', 'crewmate');

    this.dummies.children.iterate((dummy: any) => {
      dummy.setData('isDead', false);
      //follow
      dummy.setData('isFollowing', false);
      dummy.setData('followTarget', []);
      dummy.setData('lastPingTime', null);
      //task
      dummy.setData('isWorking', false);
      dummy.setData('completedTasks', []);
      dummy.setData('currTaskIndex', 0); // currTaskIndex --index of--> todoTasksIndex --index of--> ALL_TASKS
      //kill & sabotage
      dummy.setData('nextKillTime', 0);
      dummy.setData('nextSabotageTime', 0);
      //memory
      dummy.setData('memory', new Memory());
      dummy.setScale(0.3).setCollideWorldBounds(true);
      dummy.body.setSize(50, 50).setOffset(120, 150);
    });

    this.physics.add.collider(this.player, walls);
    this.physics.add.collider(this.dummies, walls);
    //GRID PATHS
    ///GENERATE MATRIX FOR A*
    this.time.delayedCall(1000, () => {
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
      //TESTING AREA
      // dum1.setData('isGoingToVent', true);
      // dum1.setData('entranceVentName', 'vent1');
      const moveToLoc1 = this.getLocationCoordinates('admin');
      // const moveToLoc2 = this.getVentCoordinates('vent2');
      this.commandBotToSpot(dum1, moveToLoc1.x, moveToLoc1.y); //TEST dummies -> nav
      // this.commandBotToSpot(dum2, moveToLoc2.x, moveToLoc2.y); //TEST dummies -> nav

      // console.log(this.player);
      // this.commandBotToFollow(dum2, dum1);
    });
    // 5. ZONES & UI (The Fixes)
    {
      /*
      killZone - red - outmost rect of player 
      playerInteractZone - green - inner rect of player
      visibleZones - black - the biggest rect of player
      dummiesInteractZones - white - small rect of player
      locationZones,taskGrp:{taskZones},collisiongrp:{obstacleZones} - not visible - the zone to find the names
      */
    }
    //PLAYER ZONES
    //KILL ZONE (outer rect)
    this.killZone = this.add.zone(0, 0, 200, 200);
    this.physics.add.existing(this.killZone);
    const killBody = this.killZone.body as Phaser.Physics.Arcade.Body;
    killBody.moves = false;
    killBody.debugShowBody = true; // Force it to draw
    killBody.debugBodyColor = 0xff0000; // Hex color (0xff0000 is Red, 0x00ff00 is Green,0x0000ff is blue)
    //INTERACT ZONE (inner rect)
    this.playerInteractZone = this.add.zone(0, 0, 150, 150);
    this.physics.add.existing(this.playerInteractZone);
    const interactBody = this.playerInteractZone
      .body as Phaser.Physics.Arcade.Body;
    interactBody.moves = false;
    interactBody.debugShowBody = true; // Force it to draw
    interactBody.debugBodyColor = 0x00ff00; // Hex color (0xff0000 is Red, 0x00ff00 is Green,0x0000ff is blue)
    //DUMMY ZONES
    //VISIBLE ZONE (biggest rect) & INTERACT ZONE (for dummy)
    this.visibleZones = this.physics.add.group();
    this.dummiesInteractZones = this.physics.add.group();
    this.dummies.children.iterate((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      //[VISIBLE ZONE CREATION]
      const visibleZone = this.add.zone(dummy.x, dummy.y, 800, 800);
      this.physics.add.existing(visibleZone);
      const body = visibleZone.body as Phaser.Physics.Arcade.Body;
      body.moves = false;
      visibleZone.setData('visibleZoneOwner', dummy.name);
      dummy.setData('visibleZone', visibleZone);
      this.visibleZones.add(visibleZone);

      //[INTERACT ZONE CREATION]
      const dummyInteractZone = this.add.zone(dummy.x, dummy.y, 150, 150);
      this.physics.add.existing(dummyInteractZone);
      const interactBody = dummyInteractZone.body as Phaser.Physics.Arcade.Body;
      interactBody.moves = false;
      dummyInteractZone.setData('interactZoneOwner', dummy.name);
      dummy.setData('interactZone', dummyInteractZone);
      this.dummiesInteractZones.add(dummyInteractZone);

      // --- THE DEBUG COLOR FIX ---
      body.debugShowBody = true; // Force it to draw
      body.debugBodyColor = 0x000000; // Hex color (0xff0000 is Red, 0x00ff00 is Green)
      interactBody.debugShowBody = true; // Force it to draw
      interactBody.debugBodyColor = 0xffffff; // Hex color (0xff0000 is Red, 0x00ff00 is Green,0x0000ff is blue)
    });

    this.player.setData('todoTasksIndex', [0, 1, 2, 3, 4]);
    this.player.setData('completedTasks', []);
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
    this.reportTarget = false;

    this.currentTask = null;
    this.currentTarget = null;
    this.targetVent = null;
    // 2. TRACK ZONES TO PLAYER
    this.killZone.setPosition(this.player.x, this.player.y);
    this.playerInteractZone.setPosition(this.player.x, this.player.y);

    // 3. RUN PHYSICS LOGIC
    // Check Tasks (Crewmate only)
    if (this.playerRole === 'crewmate') {
      this.physics.overlap(
        this.playerInteractZone,
        this.taskGroup,
        (_zone, target) => {
          if (target instanceof Phaser.GameObjects.GameObject) {
            this.currentTask = target.getData('taskID');
          }
        },
      );
    }
    if (this.playerRole === 'impostor') {
      this.physics.overlap(
        this.playerInteractZone,
        this.ventGroup,
        (_zone, vent) => {
          if (vent instanceof Phaser.GameObjects.GameObject) {
            this.targetVent = vent.getData('targetVent');
            this.currVentPos = vent.getData('currVentPos');
          }
        },
      );
    }
    if (this.isDummyImpostor) {
      this.dummies.getChildren().forEach((d: any) => {
        const dummy = d as Phaser.Physics.Arcade.Sprite;
        const dummyInteractZone = dummy.getData('interactZone');
        if (dummyInteractZone && dummyInteractZone.active) {
          this.physics.overlap(
            dummyInteractZone,
            this.ventGroup,
            (_zone, vent) => {
              if (vent instanceof Phaser.GameObjects.GameObject) {
                dummy.setData('targetVent', vent.getData('targetVent'));
                dummy.setData('currVentPos', vent.getData('currVentPos'));
              }
            },
          );
        }
      });
      if (this.playerRole === 'impostor') {
        this.physics.overlap(
          this.playerInteractZone,
          this.ventGroup,
          (_zone, vent) => {
            if (vent instanceof Phaser.GameObjects.GameObject) {
              this.targetVent = vent.getData('targetVent');
              this.currVentPos = vent.getData('currVentPos');
            }
          },
        );
      }
    }
    //AI VISIBLE ZONE
    if (this.dummies && this.visibleZones && this.dummiesInteractZones) {
      this.dummies.children.iterate((d: any) => {
        const dummy = d as Phaser.Physics.Arcade.Sprite;
        const visibleZone = dummy.getData('visibleZone');
        if (visibleZone) {
          visibleZone.x = dummy.x;
          visibleZone.y = dummy.y;
        }
        const interactZone = dummy.getData('interactZone');
        if (interactZone) {
          interactZone.x = dummy.x;
          interactZone.y = dummy.y;
        }

        const prevLoc = dummy.getData('loc') || '';
        const currLoc = this.getLocation(dummy.x, dummy.y);

        if (dummy.getData('role') === 'crewmate' && !dummy.getData('isDead')) {
          if (currLoc != prevLoc) {
            dummy.setData('loc', currLoc);
            dummy.getData('memory').writeMyActivity('walking', currLoc);
          }
        }
        const wasSabotaged = dummy.getData('wasSabotaged') || false;
        if (this.isSabotaged !== wasSabotaged) {
          const newVision = this.isSabotaged ? 100 : 800;
          visibleZone.setSize(newVision, newVision);
          if (visibleZone.body) {
            (visibleZone.body as Phaser.Physics.Arcade.Body).setSize(
              newVision,
              newVision,
            );
          }
          dummy.setData('wasSabotaged', this.isSabotaged);
        }
      });
      this.physics.overlap(
        this.visibleZones,
        [this.dummies, this.player],
        (z, d) => {
          const dummy = d as Phaser.Physics.Arcade.Sprite;
          if (dummy.getData('isSwept')) return;
          const zone = z as Phaser.GameObjects.Zone;
          const zoneOwnerName = zone.getData('visibleZoneOwner');
          const zoneOwner = this.dummies
            .getChildren()
            .find(
              (b: any) => b.name === zoneOwnerName,
            ) as Phaser.Physics.Arcade.Sprite;
          // if (zoneOwner && zoneOwner.getData('isDead')) return;
          //CoolDown timer
          const currTime = this.time.now;
          const coolDownTime = 2 * 1000; //a dummy can be observed only every 5 seconds
          const blinkKey = `lastseenby_${zoneOwnerName}`;
          const lastSeen = dummy.getData(blinkKey) || 0;

          if (currTime - lastSeen > coolDownTime) {
            if (!zoneOwner) {
              return;
            }
            if (zoneOwnerName !== dummy.name) {
              const loc = this.getLocation(dummy.x, dummy.y);

              zoneOwner
                ?.getData('memory')
                .writeSight(
                  zoneOwner,
                  dummy.name,
                  dummy.getData('isDead'),
                  loc,
                );
              if (dummy.getData('isDead')) {
                this.commandBotToSpot(zoneOwner, dummy.x, dummy.y);
                zoneOwner.setData('isWorking', false);
                if (
                  Phaser.Math.Distance.Between(
                    zoneOwner.x,
                    zoneOwner.y,
                    dummy.x,
                    dummy.y,
                  ) < 100
                ) {
                  console.log(
                    `🚨 [${zoneOwnerName}] FOUND A DEAD BODY! REPORTING!`,
                  );
                  this.reportTarget = true;
                  this.executeReport(zoneOwnerName);
                }
              }
              dummy.setData(blinkKey, currTime);
              //[SURVIVAL] (run away from danger)
              const memory = zoneOwner.getData('memory') as Memory;
              const targetSus = memory.susMatrix[dummy.name] || 0;
              console.warn(
                'ZoneOwner name:',
                dummy.name,
                'target:',
                targetSus,
                'score:',
                memory.susMatrix,
              );

              if (
                zoneOwner.getData('role') === 'crewmate' &&
                !zoneOwner.getData('isDead')
              ) {
                const memory = zoneOwner.getData('memory') as Memory;
                const targetSus = memory.susMatrix[this.player.name] || 0;
                console.warn(
                  'targetSus',
                  dummy.name,
                  ':',
                  targetSus,
                  memory.susMatrix,
                );
                const dist = Phaser.Math.Distance.Between(
                  zoneOwner.x,
                  zoneOwner.y,
                  this.player.x,
                  this.player.y,
                );
                const lastEvadeTime =
                  zoneOwner.getData(`lastEvadeFrom_${this.player.name}`) || 0;
                const canReact = currTime - lastEvadeTime > 2000;

                if (canReact) {
                  // 🔴 HIGH SUS: RUN TO THE SAFEST PLACE (The Button)
                  console.error(
                    'CANREACT FOR SUS:',
                    targetSus,
                    'with a dist of:',
                    dist,
                  );

                  if (targetSus >= 70 && dist < 300) {
                    console.log(
                      `🏃 [${zoneOwnerName}] is fleeing from highly suspicious ${this.player.name}!`,
                    );
                    zoneOwner.setData('lastEvadeTime', currTime);

                    // 1. Drop tasks, stop following, wipe intents
                    zoneOwner.setData('isFleeing', true);
                    zoneOwner.setData('isWorking', false);
                    zoneOwner.setData('isFollowing', false);
                    zoneOwner.setData('isGoingToTask', false);

                    // 2. Run to a guaranteed safe haven!
                    this.commandBotToSpot(
                      zoneOwner,
                      emergency_button_loc.x,
                      emergency_button_loc.y,
                    );
                  }
                  // 🟡 MEDIUM SUS: KITE AND KEEP DISTANCE SAFELY
                  else if (targetSus >= 40 && targetSus < 70 && dist < 120) {
                    console.log(
                      `👀 [${zoneOwnerName}] is backing away from ${dummy.name}.`,
                    );
                    zoneOwner.setData('lastEvadeTime', currTime);

                    zoneOwner.setData('isWorking', false);
                    zoneOwner.setData('isFollowing', false);
                    zoneOwner.setData('isGoingToTask', false);

                    const dx = zoneOwner.x - dummy.x;
                    const dy = zoneOwner.y - dummy.y;
                    const length = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Project 100 pixels away
                    const targetX = zoneOwner.x + (dx / length) * 100;
                    const targetY = zoneOwner.y + (dy / length) * 100;

                    // Safely find the closest floor tile so they don't walk into walls!
                    const gridX = Math.floor(targetX / TILE_SIZE);
                    const gridY = Math.floor(targetY / TILE_SIZE);
                    const safeTile = this.findClosestWalkable(gridX, gridY);

                    const safePixelX = safeTile.x * TILE_SIZE + TILE_SIZE / 2;
                    const safePixelY = safeTile.y * TILE_SIZE + TILE_SIZE / 2;

                    this.commandBotToSpot(zoneOwner, safePixelX, safePixelY);
                  }
                  // 🟢 LOW SUS: BUDDY SYSTEM
                  else if (targetSus < 40 && dist < 200) {
                    if (
                      !zoneOwner.getData('isWorking') &&
                      !zoneOwner.getData('isTravelling') &&
                      !zoneOwner.getData('isFollowing')
                    ) {
                      console.log(
                        `🤝 [${zoneOwnerName}] feels safe and is buddying up with ${dummy.name}.`,
                      );
                      zoneOwner.setData('lastEvadeTime', currTime);
                      this.commandBotToFollow(zoneOwner, dummy);
                    }
                  }
                }
              }
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
    this.physics.overlap(this.playerInteractZone, this.emergencyGroup, () => {
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
    //[DUMMIES] KILL
    this.dummies.getChildren().forEach((d: any) => {
      const dummy = d as Phaser.Physics.Arcade.Sprite;
      if (dummy.getData('role') === 'impostor' && !dummy.getData('isDead')) {
        let shortestDist = 150;
        dummy.setData('currentTarget', null);
        const interactZone = dummy.getData('interactZone');
        if (interactZone && interactZone.active) {
          this.physics.overlap(
            dummy.getData('interactZone'),
            [this.dummies, this.player],
            (_zone, tar) => {
              const alivetarget = tar as Phaser.Physics.Arcade.Sprite;
              if (
                !alivetarget.getData('isDead') &&
                alivetarget.name !== dummy.name &&
                alivetarget.getData('role') === 'crewmate'
              ) {
                const dist = Phaser.Math.Distance.Between(
                  alivetarget.x,
                  alivetarget.y,
                  dummy.x,
                  dummy.y,
                );
                if (dist < shortestDist) {
                  shortestDist = dist;
                  dummy.setData('currentTarget', alivetarget);
                }
              }
            },
          );
        }
        const target = dummy.getData('currentTarget');
        const nextKillTime = dummy.getData('nextKillTime') || 0;
        //TODO:REMOVE ON REALITY
        // If we have a valid target AND our cooldown is finished
        if (target && this.time.now > nextKillTime) {
          // 1. Drop the fake task/path immediately!
          dummy.setData('isWorking', false);
          dummy.setData('isTravelling', false);
          dummy.setData('currentPath', []);

          // 2. Execute the kill!
          this.executeKill(dummy, target);

          // 3. (Optional) Run away from the body!
          const escapeNode = this.getLocationCoordinates('cafeteria');
          this.commandBotToSpot(dummy, escapeNode.x, escapeNode.y);
        }
        // --- AI SABOTAGE TRIGGER ---
        if (dummy.getData('role') === 'impostor' && !dummy.getData('isDead')) {
          const nextSabotageTime = dummy.getData('nextSabotageTime') || 0;

          // If cooldown is ready, AND the lights aren't already out...
          if (this.time.now > nextSabotageTime && !this.isSabotaged) {
            // Give them a random chance to do it, so they don't instantly spam it
            const chance = Math.random();
            const probsOfSabing = 0.99;
            if (chance > probsOfSabing) {
              this.executeSabotage(dummy);
              // Notice we DON'T stop them from travelling or working here!
            }
          }
        }
      }
    });

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
          timeRemaining = Math.ceil(
            (this.player.getData('nextKillTime') - this.time.now) / 1000,
          );
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
    if (!this.isIdle) {
      this.player.setVelocity(0);
    } else {
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
          this.player.setTexture('player_walk');

          this.player.setFrame(12);
          if (this.walkSound.isPlaying) {
            this.walkSound.pause();
          }
        }
      }
      this.player.body.velocity.normalize().scale(speed);
    }
    //DUMMY MOVEMENTS
    this.dummies.getChildren().forEach((d: any) => {
      if (!this.easystar) return;
      const dummy = d as Phaser.Physics.Arcade.Sprite;

      if (!dummy.getData('isDead')) {
        //PANICKING

        if (dummy.getData('isPanicking')) {
          if (!this.isMeetingCalled) {
            dummy.setData('isWorking', false);
            dummy.setData('isTravelling', true);

            if (
              Phaser.Math.Distance.Between(
                dummy.x,
                dummy.y,
                emergency_button_loc.x,
                emergency_button_loc.y,
              ) < 50
            ) {
              console.log(
                `🚨 [${dummy.name}] SAW ${dummy.getData('venterName')} vent`,
              );
              this.isMeetingCalled = true;
              this.sound.play('emergencyMeeting', { volume: 0.3 });

              setTimeout(() => {
                this.executeReport(dummy.name); // Pass the Dummy's name!
              }, 1500);
            }
          } else {
            console.log(`MEETING ALREADY STARTED`);
          }
        }
        //STALKER FOLLOW LOGIC
        if (dummy.getData('isFollowing')) {
          const target = dummy.getData('followTarget');
          const lastPingTime = dummy.getData('lastPingTime');
          const currTime = this.time.now;
          const INTERVAL_MS = 300;
          if (currTime - lastPingTime > INTERVAL_MS) {
            dummy.setData('lastPingTime', currTime);
            this.easyStarPathTraveller(dummy, target.x, target.y);
          }
        }
        //DUMMY MOVEMENT
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
                //Arrived at the destination
                dummy.body?.reset(nextStep.x, nextStep.y);
                dummy.stop();
                dummy.setTexture('player_walk');
                dummy.setFrame(12);
                dummy.setData('isTravelling', false);
                dummy.setData('isFleeing', false);
                //[VENT]
                if (dummy.getData('isGoingToVent')) {
                  dummy.setData('isGoingToVent', false);
                  dummy.setData('isVentingNow', true);

                  const entranceVentName = dummy.getData('entranceVentName');
                  const entranceVent = this.ventGroup
                    .getChildren()
                    .find((v: any) => v.name === entranceVentName);
                  const exitVentName = entranceVent?.getData('targetVent');
                  // this.time.delayedCall(500,()=>dummy.setAlpha(0))
                  this.executeVent(dummy, dummy.x, dummy.y, exitVentName);
                }
                //[TASK]
                ///STATE 2: If has job and stopped at it -> Start working
                if (
                  dummy.getData('isGoingToTask') &&
                  !dummy.getData('isWorking')
                ) {
                  const todoTasksIndex = dummy.getData('todoTasksIndex');
                  const currTaskIndex = dummy.getData('currTaskIndex');
                  if (todoTasksIndex && currTaskIndex < todoTasksIndex.length) {
                    dummy.setData('isWorking', true);
                    dummy.setData('taskStartedAt', this.time.now);
                    dummy.setData('isGoingToTask', false);
                  }
                }
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
        //TASK QUEUE LOGIC [STATE MACHINE]
        ///STATE 1: Idle check -> Assign a job
        if (
          !dummy.getData('isWorking') &&
          !dummy.getData('isTravelling') &&
          !dummy.getData('isFleeing')
        ) {
          const todoTasksIndex = dummy.getData('todoTasksIndex');
          const currTaskIndex = dummy.getData('currTaskIndex');
          if (todoTasksIndex && currTaskIndex < todoTasksIndex.length) {
            const currTask = ALL_TASKS[todoTasksIndex[currTaskIndex]];
            dummy.setData('currentTaskName', currTask.name);
            const taskCoord = this.getTaskCoordinates(currTask.name);
            const minTime = currTask.timeRange[0],
              maxTime = currTask.timeRange[1];
            const currLoc = this.getLocation(dummy.x, dummy.y);
            dummy
              .getData('memory')
              .writeMyActivity(`walking to do ${currTask}`, currLoc);
            const randomDuration =
              (Math.floor(Math.random() * (maxTime - minTime)) + minTime) *
              1000;
            dummy.setData('taskDuration', randomDuration);
            dummy.setData('isGoingToTask', true);
            this.commandBotToSpot(dummy, taskCoord.x, taskCoord.y);
          } else if (todoTasksIndex && currTaskIndex >= todoTasksIndex.length) {
            if (!dummy.getData('isAllTaskDone')) {
              console.log(`[${dummy.name}]🥳 All tasks are done`);
              dummy.setData('isAllTaskDone', true);
            }
          }
        }
        ///STATE 3: Working
        if (dummy.getData('isWorking')) {
          if (!this.easystar) return;
          const currTaskName = dummy.getData('currentTaskName');
          const startedAt = dummy.getData('taskStartedAt') || 0;
          const taskDuration = dummy.getData('taskDuration') || 0;
          const currTime = this.time.now;
          if (currTime - startedAt > taskDuration) {
            console.log(`[${dummy.name}] FINISHED ITS TASK`);
            const currLoc = this.getLocation(dummy.x, dummy.y);
            if (dummy.getData('role') === 'impostor') {
              dummy
                .getData('memory')
                .writeFakeActivity(`faking ${currTaskName}`, currLoc);
            } else {
              dummy
                .getData('memory')
                .writeMyActivity(`doing ${currTaskName}`, currLoc);
            }
            dummy.setData('isWorking', false);
            const currTaskIndex = dummy.getData('currTaskIndex');
            dummy.setData('currTaskIndex', currTaskIndex + 1);
            this.updateTaskProgress();
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
