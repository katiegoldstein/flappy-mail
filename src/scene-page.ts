// Standalone cutscene preview: /scene.html?kind=departure&carrier=pigeon&sky=dusk (loops).
import './style.css';
import { params } from './ui';
import { initAudio } from './audio';
import { playCutscene, LossReason, SceneKind, Terrain } from './cutscene';
import type { SkyKind } from './sky';
import { installRecordClock } from './record-clock';

initAudio();

// ?record=1: a fake clock driven by window.__step(ms), for capturing a clip frame by frame.
if (params.get('record')) installRecordClock();
document.body.style.background = '#120A24';
const kind = (params.get('kind') ?? 'departure') as SceneKind;
const carrier = (params.get('carrier') ?? 'pigeon') as 'pigeon' | 'bottle';
const reason = (params.get('reason') ?? undefined) as LossReason | undefined;
const terrain = (params.get('terrain') ?? undefined) as Terrain | undefined;
const sky = (params.get('sky') ?? (kind === 'departure' ? 'dusk' : 'day')) as SkyKind;
const name = carrier === 'bottle' ? 'The S.S. Biscuit' : 'Sir Pickles';

const run = () => playCutscene({
  kind, carrier, sky, reason, name, terrain,
  dest: carrier === 'bottle' ? 'Tokyo' : 'London',
  eta: carrier === 'bottle' ? '4 months' : '9 days',
  miles: carrier === 'bottle' ? 6950 : 5357, milesLeft: 2140, day: kind === 'loss' ? 5 : 1,
  clock: { day: '10:15 AM', dusk: '06:40 PM', night: '11:48 PM' }[sky], pct: kind === 'loss' ? 60 : 1,
}).then(() => setTimeout(run, 700));
run();
