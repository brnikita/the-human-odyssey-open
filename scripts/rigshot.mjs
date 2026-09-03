// Screenshot the rig viewer page: node scripts/rigshot.mjs <view=side|front|back> <out.png> [walk=1] [animal=species]
import { chromium } from '@playwright/test';
const [view = 'side', out = 'rig.png', walk = '0', animal = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:5173/rig.html?view=${view}&walk=${walk}${animal ? `&animal=${animal}` : ''}`);
await page.waitForFunction(() => window.rigReady, null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.screenshot({ path: out, timeout: 120000 });
await browser.close();
console.log('saved', out);
