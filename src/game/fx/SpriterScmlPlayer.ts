import { Container, Sprite, type Texture } from 'pixi.js';

type ScmlFile = {
  id: number;
  name: string;
  pivotX: number;
  pivotY: number;
};

type ScmlFolder = {
  id: number;
  files: Map<number, ScmlFile>;
};

type BoneKey = {
  x: number;
  y: number;
  angle: number; // degrees
  scaleX: number;
  scaleY: number;
};

type ObjectKey = {
  folder: number;
  file: number;
  x: number;
  y: number;
  angle: number; // degrees
  scaleX: number;
  scaleY: number;
  alpha: number;
  pivotX?: number;
  pivotY?: number;
};

type TimelineKey = {
  id: number;
  time: number; // ms
  spin: number; // -1 | 0 | 1
  bone?: BoneKey;
  object?: ObjectKey;
};

type Timeline = {
  id: number;
  name: string;
  type: 'bone' | 'object';
  keys: TimelineKey[];
};

type MainlineRef = {
  id: number;
  timeline: number;
  key: number;
  parent?: number;
  zIndex?: number;
};

type MainlineKey = {
  id: number;
  time: number; // ms
  bones: MainlineRef[];
  objects: MainlineRef[];
};

export type ScmlAnimation = {
  name: string;
  length: number; // ms
  looping: boolean;
  mainlineKeys: MainlineKey[];
  timelines: Map<number, Timeline>;
  // Derived graph (from first mainline key)
  boneParentTimeline: Map<number, number | null>;
  objectParentBoneTimeline: Map<number, number | null>;
  objectZIndex: Map<number, number>;
};

export type ScmlEntity = {
  name: string;
  animations: Map<string, ScmlAnimation>;
};

export type ScmlData = {
  folders: Map<number, ScmlFolder>;
  entity: ScmlEntity;
};

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strAttr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback;
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngleDegrees(a0: number, a1: number, t: number, spin: number): number {
  if (spin === 0) return a0;
  let delta = a1 - a0;
  if (spin > 0 && delta < 0) delta += 360;
  if (spin < 0 && delta > 0) delta -= 360;
  return a0 + delta * t;
}

function findKeySpan(keys: TimelineKey[], timeMs: number, loopLengthMs: number | null): { a: TimelineKey; b: TimelineKey; t: number } | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return { a: keys[0]!, b: keys[0]!, t: 0 };

  if (timeMs < keys[0]!.time) {
    // Before first key: treat as "not present" for object timelines.
    return null;
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (timeMs >= a.time && timeMs < b.time) {
      const span = Math.max(1e-6, b.time - a.time);
      return { a, b, t: (timeMs - a.time) / span };
    }
  }

  // After last key.
  const last = keys[keys.length - 1]!;
  if (loopLengthMs != null && loopLengthMs > 0) {
    // Looping: interpolate last -> first across wrap.
    const first = keys[0]!;
    const span = Math.max(1e-6, loopLengthMs - last.time + first.time);
    const t = (timeMs - last.time) / span;
    return { a: last, b: first, t: Math.max(0, Math.min(1, t)) };
  }
  return { a: last, b: last, t: 0 };
}

export function parseScmlXml(scmlText: string): ScmlData {
  const doc = new DOMParser().parseFromString(scmlText, 'application/xml');
  const root = doc.querySelector('spriter_data');
  if (!root) throw new Error('Invalid SCML: missing <spriter_data>');

  const folders = new Map<number, ScmlFolder>();
  root.querySelectorAll(':scope > folder').forEach((folderEl) => {
    const folderId = numAttr(folderEl, 'id', 0);
    const files = new Map<number, ScmlFile>();
    folderEl.querySelectorAll(':scope > file').forEach((fileEl) => {
      const id = numAttr(fileEl, 'id', 0);
      files.set(id, {
        id,
        name: strAttr(fileEl, 'name'),
        pivotX: numAttr(fileEl, 'pivot_x', 0),
        pivotY: numAttr(fileEl, 'pivot_y', 1),
      });
    });
    folders.set(folderId, { id: folderId, files });
  });

  const entityEl = root.querySelector(':scope > entity');
  if (!entityEl) throw new Error('Invalid SCML: missing <entity>');

  const animations = new Map<string, ScmlAnimation>();
  entityEl.querySelectorAll(':scope > animation').forEach((animEl) => {
    const name = strAttr(animEl, 'name');
    const length = numAttr(animEl, 'length', 1000);
    const looping = strAttr(animEl, 'looping', 'true') !== 'false';

    const timelines = new Map<number, Timeline>();
    animEl.querySelectorAll(':scope > timeline').forEach((tlEl) => {
      const id = numAttr(tlEl, 'id', 0);
      const tlName = strAttr(tlEl, 'name');
      const objectType = strAttr(tlEl, 'object_type', '');
      const type: 'bone' | 'object' = objectType === 'bone' ? 'bone' : 'object';

      const keys: TimelineKey[] = [];
      tlEl.querySelectorAll(':scope > key').forEach((kEl) => {
        const kid = numAttr(kEl, 'id', 0);
        const time = numAttr(kEl, 'time', 0);
        // Spriter uses a different rotation direction than Pixi.
        // We flip angles later, so also flip spin to keep interpolation correct.
        const spin = -numAttr(kEl, 'spin', 1);

        const boneEl = kEl.querySelector(':scope > bone');
        const objEl = kEl.querySelector(':scope > object');

        const key: TimelineKey = { id: kid, time, spin };
        if (boneEl) {
          key.bone = {
            x: numAttr(boneEl, 'x', 0),
            // Spriter Y axis is opposite to Pixi (Spriter: up, Pixi: down).
            y: -numAttr(boneEl, 'y', 0),
            // Flip angle direction to match Pixi rotation.
            angle: -numAttr(boneEl, 'angle', 0),
            scaleX: numAttr(boneEl, 'scale_x', 1),
            scaleY: numAttr(boneEl, 'scale_y', 1),
          };
        }
        if (objEl) {
          key.object = {
            folder: numAttr(objEl, 'folder', 0),
            file: numAttr(objEl, 'file', 0),
            x: numAttr(objEl, 'x', 0),
            y: -numAttr(objEl, 'y', 0),
            angle: -numAttr(objEl, 'angle', 0),
            scaleX: numAttr(objEl, 'scale_x', 1),
            scaleY: numAttr(objEl, 'scale_y', 1),
            alpha: numAttr(objEl, 'a', 1),
            pivotX: objEl.hasAttribute('pivot_x') ? numAttr(objEl, 'pivot_x', 0) : undefined,
            pivotY: objEl.hasAttribute('pivot_y') ? numAttr(objEl, 'pivot_y', 1) : undefined,
          };
        }
        keys.push(key);
      });

      keys.sort((a, b) => a.time - b.time);
      timelines.set(id, { id, name: tlName, type, keys });
    });

    const mainlineKeys: MainlineKey[] = [];
    const mainlineEl = animEl.querySelector(':scope > mainline');
    if (mainlineEl) {
      mainlineEl.querySelectorAll(':scope > key').forEach((kEl) => {
        const id = numAttr(kEl, 'id', 0);
        const time = numAttr(kEl, 'time', 0);

        const bones: MainlineRef[] = [];
        kEl.querySelectorAll(':scope > bone_ref').forEach((br) => {
          bones.push({
            id: numAttr(br, 'id', 0),
            timeline: numAttr(br, 'timeline', 0),
            key: numAttr(br, 'key', 0),
            parent: br.hasAttribute('parent') ? numAttr(br, 'parent', 0) : undefined,
          });
        });

        const objects: MainlineRef[] = [];
        kEl.querySelectorAll(':scope > object_ref').forEach((or) => {
          objects.push({
            id: numAttr(or, 'id', 0),
            timeline: numAttr(or, 'timeline', 0),
            key: numAttr(or, 'key', 0),
            parent: or.hasAttribute('parent') ? numAttr(or, 'parent', 0) : undefined,
            zIndex: or.hasAttribute('z_index') ? numAttr(or, 'z_index', 0) : undefined,
          });
        });

        mainlineKeys.push({ id, time, bones, objects });
      });
    }
    mainlineKeys.sort((a, b) => a.time - b.time);

    // Derive parent graphs from the first mainline key (stable for this asset).
    const boneParentTimeline = new Map<number, number | null>();
    const objectParentBoneTimeline = new Map<number, number | null>();
    const objectZIndex = new Map<number, number>();

    const firstMain = mainlineKeys[0];
    if (firstMain) {
      const boneRefIdToTimeline = new Map<number, number>();
      for (let i = 0; i < firstMain.bones.length; i++) {
        const br = firstMain.bones[i]!;
        boneRefIdToTimeline.set(br.id, br.timeline);
      }
      for (let i = 0; i < firstMain.bones.length; i++) {
        const br = firstMain.bones[i]!;
        const parentTimeline = br.parent != null ? (boneRefIdToTimeline.get(br.parent) ?? null) : null;
        boneParentTimeline.set(br.timeline, parentTimeline);
      }

      for (let i = 0; i < firstMain.objects.length; i++) {
        const or = firstMain.objects[i]!;
        const parentBoneTimeline = or.parent != null ? (boneRefIdToTimeline.get(or.parent) ?? null) : null;
        objectParentBoneTimeline.set(or.timeline, parentBoneTimeline);
        objectZIndex.set(or.timeline, or.zIndex ?? i);
      }
    }

    animations.set(name, {
      name,
      length,
      looping,
      mainlineKeys,
      timelines,
      boneParentTimeline,
      objectParentBoneTimeline,
      objectZIndex,
    });
  });

  const entityName = strAttr(entityEl, 'name', 'entity');
  const entity: ScmlEntity = { name: entityName, animations };
  return { folders, entity };
}

type Transform = { x: number; y: number; angle: number; scaleX: number; scaleY: number; alpha: number };

export class SpriterScmlPlayer {
  readonly view = new Container();

  private readonly data: ScmlData;
  private readonly texturesByFolderFile: Map<string, Texture>;

  private anim: ScmlAnimation;
  private timeMs = 0;

  // One Sprite per object timeline id.
  private readonly spritesByTimeline = new Map<number, Sprite>();

  constructor(opts: { data: ScmlData; texturesByFolderFile: Map<string, Texture>; initialAnimation?: string }) {
    this.data = opts.data;
    this.texturesByFolderFile = opts.texturesByFolderFile;

    const fallbackName = this.data.entity.animations.has('IDLE')
      ? 'IDLE'
      : ([...this.data.entity.animations.keys()][0] ?? 'IDLE');
    const initialName = opts.initialAnimation ?? fallbackName;
    const anim = this.data.entity.animations.get(initialName);
    if (!anim) throw new Error(`SCML: missing animation "${initialName}"`);
    this.anim = anim;

    // Build sprites for all object timelines we can see in this entity.
    const objectTimelineIds = new Set<number>();
    this.data.entity.animations.forEach((a) => {
      a.timelines.forEach((tl) => {
        if (tl.type === 'object') objectTimelineIds.add(tl.id);
      });
    });

    [...objectTimelineIds].sort((a, b) => a - b).forEach((timelineId) => {
      const spr = new Sprite();
      (spr as any).eventMode = 'none';
      spr.visible = false;
      this.spritesByTimeline.set(timelineId, spr);
      this.view.addChild(spr);
    });

    // Apply pose at time 0.
    this.setTimeMs(0);
  }

  setAnimation(name: string): void {
    const anim = this.data.entity.animations.get(name);
    if (!anim) throw new Error(`SCML: missing animation "${name}"`);
    this.anim = anim;
    this.timeMs = 0;
    this.setTimeMs(0);
  }

  get animationLengthMs(): number {
    return this.anim.length;
  }

  get looping(): boolean {
    return this.anim.looping;
  }

  setTimeMs(ms: number): void {
    const len = Math.max(1, this.anim.length);
    this.timeMs = this.anim.looping ? ((ms % len) + len) % len : Math.max(0, Math.min(len, ms));
    this.applyPose(this.timeMs);
  }

  update(dtSeconds: number): void {
    this.setTimeMs(this.timeMs + dtSeconds * 1000);
  }

  private texKey(folder: number, file: number): string {
    return `${folder}:${file}`;
  }

  private getFileDef(folderId: number, fileId: number): ScmlFile | null {
    const folder = this.data.folders.get(folderId);
    if (!folder) return null;
    return folder.files.get(fileId) ?? null;
  }

  private getTexture(folderId: number, fileId: number): Texture | null {
    return this.texturesByFolderFile.get(this.texKey(folderId, fileId)) ?? null;
  }

  private sampleBone(tl: Timeline, timeMs: number, loopLen: number | null): BoneKey | null {
    const span = findKeySpan(tl.keys, timeMs, loopLen);
    if (!span) {
      // Bone timelines should exist at t=0; if missing, fallback to first key.
      const k0 = tl.keys[0];
      return k0?.bone ?? null;
    }
    const a = span.a.bone;
    const b = span.b.bone;
    if (!a || !b) return a ?? b ?? null;
    return {
      x: lerp(a.x, b.x, span.t),
      y: lerp(a.y, b.y, span.t),
      angle: lerpAngleDegrees(a.angle, b.angle, span.t, span.a.spin),
      scaleX: lerp(a.scaleX, b.scaleX, span.t),
      scaleY: lerp(a.scaleY, b.scaleY, span.t),
    };
  }

  private sampleObject(tl: Timeline, timeMs: number, loopLen: number | null): ObjectKey | null {
    const span = findKeySpan(tl.keys, timeMs, loopLen);
    if (!span) return null;
    const a = span.a.object;
    const b = span.b.object;
    if (!a || !b) return a ?? b ?? null;
    return {
      folder: a.folder,
      file: a.file,
      x: lerp(a.x, b.x, span.t),
      y: lerp(a.y, b.y, span.t),
      angle: lerpAngleDegrees(a.angle, b.angle, span.t, span.a.spin),
      scaleX: lerp(a.scaleX, b.scaleX, span.t),
      scaleY: lerp(a.scaleY, b.scaleY, span.t),
      alpha: lerp(a.alpha, b.alpha, span.t),
      pivotX: a.pivotX ?? b.pivotX,
      pivotY: a.pivotY ?? b.pivotY,
    };
  }

  private applyPose(timeMs: number): void {
    const loopLen = this.anim.looping ? this.anim.length : null;

    // Resolve current mainline key (parenting + zIndex can vary per key).
    const main = getMainlineKeyAt(this.anim.mainlineKeys, timeMs);
    // In Spriter, objects are ONLY visible when referenced by mainline key.
    // If we don't have a mainline key, we can't safely display anything.
    if (!main) {
      this.spritesByTimeline.forEach((spr) => (spr.visible = false));
      return;
    }

    const boneParentTimeline =
      main ? deriveBoneParentMap(main) : this.anim.boneParentTimeline;
    const objectParentBoneTimeline =
      main ? deriveObjectParentBoneMap(main) : this.anim.objectParentBoneTimeline;
    const objectZIndex =
      main ? deriveObjectZIndexMap(main) : this.anim.objectZIndex;

    // 1) Compute world bone transforms.
    const boneWorld = new Map<number, Transform>();
    const boneIds = [...boneParentTimeline.keys()];
    // stable order (parents first) by simple passes; tiny graph so this is fine.
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let i = 0; i < boneIds.length; i++) {
        const id = boneIds[i]!;
        if (boneWorld.has(id)) continue;
        const parentId = boneParentTimeline.get(id) ?? null;
        if (parentId != null && !boneWorld.has(parentId)) continue;

        const tl = this.anim.timelines.get(id);
        if (!tl) continue;
        const local = this.sampleBone(tl, timeMs, loopLen);
        if (!local) continue;

        const parent = parentId != null ? boneWorld.get(parentId) : null;
        const world = parent ? combine(parent, { ...local, alpha: 1 }) : { ...local, alpha: 1 };
        boneWorld.set(id, world);
        changed = true;
      }
      if (!changed) break;
    }

    // 2) Apply objects (ONLY those present in this mainline key).
    const visibleSprites: Array<{ id: number; z: number; spr: Sprite }> = [];
    this.spritesByTimeline.forEach((spr) => (spr.visible = false));

    for (let i = 0; i < main.objects.length; i++) {
      const ref = main.objects[i]!;
      const tlId = ref.timeline;
      const spr = this.spritesByTimeline.get(tlId);
      if (!spr) continue;

      const tl = this.anim.timelines.get(tlId);
      if (!tl || tl.type !== 'object') continue;

      const obj = this.sampleObject(tl, timeMs, loopLen);
      if (!obj) continue;

      const tex = this.getTexture(obj.folder, obj.file);
      if (!tex) continue;
      spr.texture = tex;

      const fileDef = this.getFileDef(obj.folder, obj.file);
      const px = obj.pivotX ?? fileDef?.pivotX ?? 0;
      const py = obj.pivotY ?? fileDef?.pivotY ?? 1;
      // Spriter file pivot_y is defined in opposite vertical direction to Pixi anchor.y.
      // Using (1 - pivotY) removes the subtle "gaps" between parts when converting coordinates.
      spr.anchor.set(px, 1 - py);

      const parentBoneTimeline = objectParentBoneTimeline.get(tlId) ?? null;
      const parent = parentBoneTimeline != null ? boneWorld.get(parentBoneTimeline) : null;

      const local: Transform = {
        x: obj.x,
        y: obj.y,
        angle: obj.angle,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        alpha: obj.alpha,
      };
      const world = parent ? combine(parent, local) : local;

      spr.visible = world.alpha > 0.001;
      spr.alpha = world.alpha;
      spr.position.set(world.x, world.y);
      spr.rotation = deg2rad(world.angle);
      spr.scale.set(world.scaleX, world.scaleY);

      const z = ref.zIndex ?? objectZIndex.get(tlId) ?? i;
      visibleSprites.push({ id: tlId, z, spr });
    }

    // 3) Z order (small list, cheap).
    visibleSprites.sort((a, b) => a.z - b.z);
    for (let i = 0; i < visibleSprites.length; i++) this.view.setChildIndex(visibleSprites[i]!.spr, i);
  }
}

function getMainlineKeyAt(keys: MainlineKey[], timeMs: number): MainlineKey | null {
  if (!keys.length) return null;
  // keys are sorted by time.
  let current = keys[0]!;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (k.time <= timeMs) current = k;
    else break;
  }
  return current;
}

function deriveBoneParentMap(main: MainlineKey): Map<number, number | null> {
  const refIdToTimeline = new Map<number, number>();
  for (let i = 0; i < main.bones.length; i++) {
    const br = main.bones[i]!;
    refIdToTimeline.set(br.id, br.timeline);
  }
  const out = new Map<number, number | null>();
  for (let i = 0; i < main.bones.length; i++) {
    const br = main.bones[i]!;
    const parentTimeline = br.parent != null ? (refIdToTimeline.get(br.parent) ?? null) : null;
    out.set(br.timeline, parentTimeline);
  }
  return out;
}

function deriveObjectParentBoneMap(main: MainlineKey): Map<number, number | null> {
  const boneRefIdToTimeline = new Map<number, number>();
  for (let i = 0; i < main.bones.length; i++) {
    const br = main.bones[i]!;
    boneRefIdToTimeline.set(br.id, br.timeline);
  }
  const out = new Map<number, number | null>();
  for (let i = 0; i < main.objects.length; i++) {
    const or = main.objects[i]!;
    const parentBoneTimeline = or.parent != null ? (boneRefIdToTimeline.get(or.parent) ?? null) : null;
    out.set(or.timeline, parentBoneTimeline);
  }
  return out;
}

function deriveObjectZIndexMap(main: MainlineKey): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < main.objects.length; i++) {
    const or = main.objects[i]!;
    out.set(or.timeline, or.zIndex ?? i);
  }
  return out;
}

function combine(parent: Transform, local: Transform): Transform {
  const pr = deg2rad(parent.angle);
  const cos = Math.cos(pr);
  const sin = Math.sin(pr);
  const lx = local.x * parent.scaleX;
  const ly = local.y * parent.scaleY;
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  return {
    x: parent.x + rx,
    y: parent.y + ry,
    angle: parent.angle + local.angle,
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY,
    alpha: parent.alpha * local.alpha,
  };
}

