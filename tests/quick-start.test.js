import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mountQuickStart } from '../src/quick-start.js';
import { demoProject, parseDiagram, layoutDiagram } from '../src/model.js';
import { normalizeTheme } from '../src/themes.js';

// Lightweight DOM doubles keep the app dependency-free. They are not browser QA.
function setup({saved=false,dismissed=false,blocked=false,storageFails=false,accept=true}={}) {
  const nodes=new Map(); let active=null,loads=0,previews=0;
  const stored=new Map([['diagramtake.project.v1','existing-project']]);
  if(dismissed) stored.set('diagramtake.guide.dismissed.v1','1');
  function element(key) {
    if(nodes.has(key)) return nodes.get(key);
    const classes=new Set(), listeners=new Map(),attrs=new Map();
    const el={hidden:false,textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      addEventListener:(event,fn)=>listeners.set(event,fn),setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key),
      querySelector:sub=>element(key+' '+sub),focus:()=>{active=el;},scrollIntoView:()=>{},
      emit:(event,data={})=>listeners.get(event)?.(data)};
    nodes.set(key,el);return el;
  }
  globalThis.document={querySelector:element};
  globalThis.localStorage={getItem:k=>{if(storageFails)throw Error('blocked');return stored.get(k)??null;},setItem:(k,v)=>{if(storageFails)throw Error('blocked');stored.set(k,v);}};
  const guide=mountQuickStart({hasSavedProject:saved,loadExample:()=>{loads++;return accept;},previewScene:()=>{previews++;guide.complete(3);},canInteract:()=>!blocked});
  return {guide,el:element,stored,get active(){return active;},get loads(){return loads;},get previews(){return previews;}};
}
test('first run opens non-modal guide without touching project storage',()=>{
 const x=setup();assert.equal(x.el('#quick-start').hidden,false);assert.equal(x.loads,0);assert.equal(x.stored.get('diagramtake.project.v1'),'existing-project');
});
test('saved projects and dismissed guides do not auto-open',()=>{
 assert.equal(setup({saved:true}).el('#quick-start').hidden,true);
 assert.equal(setup({dismissed:true}).el('#quick-start').hidden,true);
});
test('close persists dismissal and reopening does not erase it or project data',()=>{
 const x=setup();x.el('#guide-close').emit('click');assert.equal(x.el('#quick-start').hidden,true);assert.equal(x.stored.get('diagramtake.guide.dismissed.v1'),'1');
 x.el('#guide-toggle').emit('click');assert.equal(x.el('#quick-start').hidden,false);assert.equal(x.active,x.el('#guide-heading'));assert.equal(x.stored.get('diagramtake.guide.dismissed.v1'),'1');assert.equal(x.stored.get('diagramtake.project.v1'),'existing-project');
});
test('edit points to actual narration; completion waits for input',()=>{
 const x=setup();x.el('#guide-edit').emit('click');assert.equal(x.active,x.el('#narration'));assert.equal(x.el('#narration').classList.contains('guide-target'),true);
 assert.equal(x.el('[data-guide-step="2"]').classList.contains('is-done'),false);
 x.el('#narration').emit('input');assert.equal(x.el('[data-guide-step="2"]').classList.contains('is-done'),true);
});
test('cancelled example neither completes step nor moves focus',()=>{
 const x=setup({accept:false});x.el('#guide-example').emit('click');assert.equal(x.loads,1);assert.equal(x.active,null);assert.equal(x.el('[data-guide-step="1"]').classList.contains('is-done'),false);
});
test('accepted example focuses active scene; actual scene selection also counts',()=>{
 const x=setup();x.el('#guide-example').emit('click');assert.equal(x.active,x.el('.scene-card.active'));assert.equal(x.el('[data-guide-step="1"]').classList.contains('is-done'),true);
 const y=setup();y.el('#scene-list').emit('click',{target:{closest:()=>({})}});assert.equal(y.el('[data-guide-step="1"]').classList.contains('is-done'),true);
});
test('play routes to supplied actual playback and repeated actions do not overcount',()=>{
 const x=setup();x.el('#guide-play').emit('click');x.el('#guide-play').emit('click');assert.equal(x.previews,2);assert.equal(x.active,x.el('#play'));assert.match(x.el('#guide-progress').textContent,/1 \/ 3/);
 x.guide.complete(1);x.guide.complete(2);assert.match(x.el('#guide-progress').textContent,/Save .json/);
});
test('Escape clears highlight and returns focus to reopen control',()=>{
 const x=setup();x.el('#guide-edit').emit('click');let prevented=false;x.el('#quick-start').emit('keydown',{key:'Escape',preventDefault:()=>{prevented=true;}});
 assert.equal(prevented,true);assert.equal(x.el('#quick-start').hidden,true);assert.equal(x.el('#narration').classList.contains('guide-target'),false);assert.equal(x.active,x.el('#guide-toggle'));
});
test('export lock prevents guide mutations and playback',()=>{
 const x=setup({blocked:true});for(const id of ['#guide-example','#guide-edit','#guide-play'])x.el(id).emit('click');x.el('#narration').emit('input');assert.equal(x.loads,0);assert.equal(x.previews,0);assert.equal(x.active,null);
});
test('unavailable browser storage does not break guide; hidden progress stays inert',()=>{
 const x=setup({storageFails:true});x.el('#guide-close').emit('click');x.guide.complete(3);assert.equal(x.el('[data-guide-step="3"]').classList.contains('is-done'),false);x.el('#guide-toggle').emit('click');assert.equal(x.el('#quick-start').hidden,false);
});
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const loadSource=app.slice(app.indexOf('function loadExample()'),app.indexOf('$("#reset-demo").onclick = loadExample;'));
function actualLoad(accept,exporting=false){
 const original=demoProject();original.title='Keep my story';original.scenes[0].narration='Keep my text';original.theme='dark';const snapshots=[];
 const context={project:original,exportController:exporting?{}:null,confirm:()=>accept,pause:()=>{},checkpoint:()=>snapshots.push(structuredClone(context.project)),normalizeTheme,demoProject,layoutDiagram,parseDiagram,selected:2,time:5,removeAudio:()=>{context.audioRemoved=true;},save:()=>{context.saved=true;},renderUI:()=>{},audioRemoved:false,saved:false};
 vm.createContext(context);vm.runInContext(loadSource+'\nresult=loadExample();',context);return {context,original,snapshots};
}
test('actual app example cancel and export guard preserve project and audio',()=>{
 for(const [accept,locked] of [[false,false],[true,true]]){const {context,original,snapshots}=actualLoad(accept,locked);assert.equal(context.result,false);assert.equal(context.project,original);assert.equal(context.audioRemoved,false);assert.equal(context.saved,false);assert.equal(snapshots.length,0);}
});
test('actual app accepted example checkpoints old story and preserves selected theme',()=>{
 const {context,snapshots}=actualLoad(true);assert.equal(context.result,true);assert.equal(snapshots[0].title,'Keep my story');assert.equal(snapshots[0].scenes[0].narration,'Keep my text');assert.equal(context.project.theme,'dark');assert.equal(context.selected,0);assert.equal(context.time,0);assert.equal(context.saved,true);
});
test('guide selectors match shipped HTML and playback/edit stay connected to app handlers',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const id of ['quick-start','guide-toggle','guide-close','guide-heading','guide-progress','guide-example','guide-edit','guide-play','narration','play'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/previewScene: \(\) => \{ selectScene\(selected\); play\(\); \}/);assert.match(app,/guide\?\.complete\(3\)/);assert.match(app,/change\(\(s\) => \(s.narration = e.target.value\)\)/);
});
