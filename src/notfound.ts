// 404: a page that flew off the map.
import './style.css';
import { h } from './ui';
import { spriteEl, PIGEON, PIGEON_REST } from './sprites';

document.body.style.cssText = 'margin:0;min-height:100vh;background:#5C94FC;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
document.getElementById('app')!.append(h('main', { style: 'background:#F6E7C1;border:4px solid #2E2A40;box-shadow:8px 8px 0 #2E2A40;padding:24px;max-width:440px;color:#2E2A40;text-align:center' },
  spriteEl(PIGEON_REST, PIGEON, 6, 'A sleepy pigeon'),
  h('h1', { class: 'pixel', style: 'font-size:16px;line-height:1.6;margin:16px 0 10px' }, 'THIS PAGE FLEW', h('br'), 'OFF THE MAP'),
  h('p', { style: 'font-size:22px;margin:0 0 20px' }, "There's nothing here. The pigeon is having a nap about it."),
  h('a', { class: 'game-btn', href: '/', style: 'display:block;text-decoration:none;font-size:13px' }, 'BACK TO THE BIRDS ▶')));
document.querySelector('main canvas')?.setAttribute('style', (document.querySelector('main canvas')?.getAttribute('style') ?? '') + ';margin:0 auto');
