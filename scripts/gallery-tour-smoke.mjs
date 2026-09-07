#!/usr/bin/env node
// Runs a complete tour at its actual pace; allow about a minute.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto(process.env.GALLERY_URL || 'http://127.0.0.1:5186/gallery/',{waitUntil:'networkidle'});
await page.locator('.artwork-stage[data-ready="true"]').waitFor();
assert.equal(await page.locator('.cinema').getAttribute('data-touring'),'true');
for (const [target, min, max] of [[1,0,0],[7,.2,.6],[11,1,1],[25,1,1.2],[32,2,2],[46,2,2]]){
 await page.waitForFunction(t=>Number(document.querySelector('.cinema').dataset.tourTime)>=t,target,{timeout:65000});
 const progress=Number(await page.locator('.artwork-stage').getAttribute('data-progress'));
 assert(progress>=min && progress<=max,`At ${target}s, progress ${progress} must be between ${min} and ${max}`);
 console.log('tour',target,'progress',progress);
 if(process.env.GALLERY_SHOT_DIR && [1,11,32].includes(target))await page.screenshot({path:`${process.env.GALLERY_SHOT_DIR}/autotour-${target}.png`});
}
await page.waitForFunction(()=>document.querySelector('.filmstrip button.selected').dataset.image==='photo-coffee',null,{timeout:15000});
await page.locator('.artwork-stage[data-ready="true"]').waitFor();
await page.waitForTimeout(1800);
assert.equal(await page.locator('.artwork-stage').getAttribute('data-progress'),'0.00');
console.log('Advanced to next image and held original');
await page.getByRole('button',{name:'Pause tour',exact:true}).click();
const t=await page.locator('.cinema').getAttribute('data-tour-time');
await page.waitForTimeout(800);
assert.equal(await page.locator('.cinema').getAttribute('data-tour-time'),t);
await page.locator('.cinema input').fill('1.5');
await page.getByRole('button',{name:'Resume tour',exact:true}).click();
await page.waitForTimeout(500);
assert(Number(await page.locator('.cinema input').inputValue())>=1.5);
await page.getByRole('button',{name:'Next image',exact:true}).click();
assert.equal(await page.locator('.cinema').getAttribute('data-touring'),'false');
console.log('Pause, resume, and manual navigation pass');
await page.getByRole('button',{name:'Resume tour',exact:true}).click();
await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='3000px';document.body.appendChild(spacer);window.scrollTo(0,document.body.scrollHeight);});
await page.waitForTimeout(300);
const parked=await page.locator('.cinema').getAttribute('data-tour-time');
await page.waitForTimeout(600);
assert.equal(await page.locator('.cinema').getAttribute('data-tour-time'),parked,'Tour must wait offscreen');
await page.evaluate(()=>window.scrollTo(0,0));
await page.waitForTimeout(500);
assert(Number(await page.locator('.cinema').getAttribute('data-tour-time'))>Number(parked));
await page.emulateMedia({reducedMotion:'reduce'});
await page.waitForFunction(()=>document.querySelector('.cinema').dataset.touring==='false');
assert.equal(await page.locator('.cinema').getAttribute('data-touring'),'false');
console.log('Offscreen pause and reduced motion pass');
assert.deepEqual(errors,[]);
} finally { await browser.close(); }
