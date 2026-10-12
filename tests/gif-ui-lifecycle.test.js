import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { GIF_PRESETS } from '../src/gif-quality.js';
import { readFileSync } from 'node:fs';
import { demoProject, parseDiagram, layoutDiagram, totalDuration } from '../src/model.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('$("#export-gif").onclick = async () => {'),app.indexOf('$("#export-cancel").onclick ='));
function setup(exportGIF){
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{disabled:false,hidden:true,value:id==='#gif-quality'?'high':0,textContent:''});return elements.get(id);};
 const downloads=[];const context={$ ,GIF_PRESETS,project:demoProject(),exportController:null,structuredClone,layoutDiagram,parseDiagram,totalDuration,AbortController,document:{createElement:()=>({})},pause:()=>{},renderFrame:()=>{},exportGIF,downloadBlob:(blob,name)=>downloads.push({blob,name}),toast:()=>{},draw:()=>{context.redrawn=true;},redrawn:false};
 vm.createContext(context);vm.runInContext(source,context);return {context,$,downloads,run:()=>$('#export-gif').onclick()};
}
test('real GIF UI handler locks all exports, prevents duplicate runs, then restores controls',async()=>{
 let resolve,calls=0;const x=setup(async opts=>{calls++;assert.equal(opts.theme,'light');assert.equal(opts.quality,'high');opts.onProgress(.5);return new Promise(r=>{resolve=r;});});const running=x.run();
 for(const id of ['#export-video','#export-png','#export-gif','#export-close'])assert.equal(x.$(id).disabled,true);
 await x.run();assert.equal(calls,1);assert.equal(x.$('#export-progress').value,.5);resolve(new Blob(['GIF89a'],{type:'image/gif'}));await running;
 assert.equal(x.downloads[0].name,'diagramtake-story.gif');assert.equal(x.context.exportController,null);assert.equal(x.$('#export-cancel').hidden,true);assert.equal(x.context.redrawn,true);
 for(const id of ['#export-video','#export-png','#export-gif','#export-close'])assert.equal(x.$(id).disabled,false);
});
test('real GIF UI handler reports cancellation and never downloads partial output',async()=>{
 const x=setup(async()=>{throw new DOMException('cancelled','AbortError');});const before=JSON.stringify(x.context.project);await x.run();assert.equal(x.downloads.length,0);assert.match(x.$('#export-status').textContent,/cancelled/);assert.equal(x.context.exportController,null);assert.equal(JSON.stringify(x.context.project),before);
});
test('real GIF UI handler recovers from failure and permits a new attempt',async()=>{
 let count=0;const x=setup(async()=>{if(count++===0)throw Error('over 32 MiB');return new Blob(['GIF89a']);});await x.run();assert.match(x.$('#export-status').textContent,/over 32 MiB/);assert.equal(x.$('#export-gif').disabled,false);await x.run();assert.equal(x.downloads.length,1);
});
