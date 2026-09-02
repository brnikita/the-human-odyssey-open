import { Game } from '@/core/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui-root') as HTMLElement;
const game = new Game(canvas, ui);
game.start();
