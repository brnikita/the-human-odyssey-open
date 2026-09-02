/** Keyboard, mouse and pointer-lock input. */
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'run' | 'jump' | 'down' | 'interact' | 'dodge'
  | 'intelligence' | 'smell' | 'hear' | 'neuronal' | 'inventory' | 'use' | 'swapHands'
  | 'call' | 'generation' | 'pause' | 'map' | 'dropLeft' | 'dropRight' | 'clan' | 'help' | 'sleep';

const KEYMAP: Record<string, Action> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  ControlLeft: 'down', ControlRight: 'down', KeyX: 'down',
  KeyQ: 'intelligence',
  KeyE: 'smell',
  KeyR: 'hear',
  Tab: 'neuronal',
  KeyI: 'inventory',
  KeyF: 'use',
  Digit1: 'swapHands',
  KeyC: 'call',
  KeyG: 'generation',
  Escape: 'pause',
  KeyM: 'map',
  KeyZ: 'dropLeft',
  KeyV: 'dropRight',
  KeyT: 'clan',
  KeyH: 'help',
  KeyN: 'sleep',
};

export class Input {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  pointerLocked = false;
  mouseButtons = [false, false, false];
  private mousePressed = [false, false, false];
  private el: HTMLElement;
  enabled = true;
  /** If false, pointer lock will not be requested on click. */
  wantPointerLock = true;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
    });
    window.addEventListener('blur', () => this.clearAll());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!this.down.has(a)) this.pressed.add(a);
    this.down.add(a);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    this.down.delete(a);
    this.released.add(a);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button < 3) {
      this.mouseButtons[e.button] = true;
      this.mousePressed[e.button] = true;
    }
    if (this.wantPointerLock && !this.pointerLocked) {
      this.el.requestPointerLock?.();
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button < 3) this.mouseButtons[e.button] = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };

  isDown(a: Action): boolean { return this.enabled && this.down.has(a); }
  /** True on the frame the action was first pressed. */
  justPressed(a: Action): boolean { return this.enabled && this.pressed.has(a); }
  justReleased(a: Action): boolean { return this.released.has(a); }
  mouseJustPressed(button: number): boolean { return this.enabled && this.mousePressed[button]; }
  mouseDown(button: number): boolean { return this.enabled && this.mouseButtons[button]; }

  /** Programmatic injection for tests/automation. */
  press(a: Action) { if (!this.down.has(a)) this.pressed.add(a); this.down.add(a); }
  release(a: Action) { this.down.delete(a); this.released.add(a); }
  clickMouse(button: number) { this.mousePressed[button] = true; }

  /** Call at end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.fill(false);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  clearAll() {
    this.down.clear();
    this.pressed.clear();
    this.mouseButtons.fill(false);
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
