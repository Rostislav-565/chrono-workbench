import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from './fixtures.ts';
import { addPlanTask, availableNoteTier, deletePlanTask, pauseFocus, resetFocus, selectFocus, settleTimer, toggleFocus, updatePlanTask } from '../src/actions.ts';
import { elapsedSeconds } from '../src/timer.ts';

const at = new Date(2026, 10, 24, 12).getTime();
function active(mode: 'flow'|'pomodoro' = 'pomodoro') { const data=createDemoData(); data.sessions=[]; data.timer={...data.timer,mode,status:'running',startedAt:at}; return data; }
const total = (data:ReturnType<typeof active>) => data.sessions.reduce((sum,s)=>sum+s.seconds,0);
test('pause exactly at Pomodoro deadline settles into break and never stays on zero',()=>{ const result=toggleFocus(active(),at+1500000); assert.equal(result.timer.phase,'break'); assert.equal(result.timer.status,'idle'); assert.equal(total(result),1500); assert.equal(settleTimer(result,at+2000000),result); });
test('expired paused persisted timer is settled once on load',()=>{ const data=active();data.timer={...data.timer,status:'paused',elapsed:1500,startedAt:null};const result=settleTimer(data,at);assert.equal(result.timer.phase,'break');assert.equal(total(result),1500);assert.equal(settleTimer(result,at),result); });
test('pause for breathing records work, resume excludes the pause, reset avoids duplicates',()=>{const paused=pauseFocus(active('flow'),at+30000);assert.equal(total(paused),30);assert.equal(paused.timer.status,'paused');const resumed=toggleFocus(paused,at+90000);const reset=resetFocus(resumed,at+100000);assert.equal(total(reset),40);assert.equal(reset.timer.status,'idle');assert.equal(resetFocus(reset,at+120000).sessions.length,reset.sessions.length);});
test('changing and deleting an active task preserve clock and record original attribution',()=>{let data=active('flow');const first=data.tasks[0],second=data.tasks[1];data=selectFocus(data,second.id,at+10000);assert.equal(data.sessions[0].task,first.text);data=deletePlanTask(data,second.id,at+20000);assert.equal(data.sessions[1].task,second.text);assert.equal(data.activeTaskId,null);assert.equal(elapsedSeconds(data.timer,at+30000),30);assert.equal(total(data),20);});
test('completing active task pauses and clears it; reopening does not steal focus',()=>{let data=active();const completed={...data.tasks[0],done:true};data=updatePlanTask(data,completed,at+45000);assert.equal(data.timer.status,'paused');assert.equal(data.activeTaskId,null);assert.equal(total(data),45);data=updatePlanTask(data,{...completed,done:false},at+90000);assert.equal(data.activeTaskId,null);assert.equal(total(data),45);});
test('renaming active task keeps previously worked time under its old title',()=>{const data=active();const changed=updatePlanTask(data,{...data.tasks[0],text:'New title'},at+10000);assert.equal(changed.sessions[0].task,data.tasks[0].text);const paused=pauseFocus(changed,at+20000);assert.equal(paused.sessions[1].task,'New title');assert.equal(total(paused),20);});
test('slot capacity is checked against current state and failed conversion keeps its note',()=>{let data=createDemoData();data.notes=[{id:'note',text:'Later',createdAt:at}];const task={id:'new',text:'Extra',tier:'medium' as const,done:false,steps:[],expanded:false};data=addPlanTask(data,task);assert.equal(data.tasks.filter(t=>t.tier==='medium').length,3);const rejected=addPlanTask(data,{...task,id:'next'},'note');assert.equal(rejected,data);assert.equal(rejected.notes.length,1);data=addPlanTask(data,{...task,id:'small',tier:'small'},'note');assert.equal(data.notes.length,0);});
test('completed or missing tasks cannot become an active focus',()=>{const data=active();data.tasks[1].done=true;assert.equal(selectFocus(data,data.tasks[1].id,at+10000),data);assert.equal(selectFocus(data,'missing',at+10000),data);});
test('one-click note conversion selects a free tier and never removes a note when all slots are full',()=>{let data=createDemoData();assert.equal(availableNoteTier(data),'small');for(let i=0;i<3;i++)data=addPlanTask(data,{id:'small'+i,text:'Routine',tier:'small',done:false,steps:[],expanded:false});assert.equal(availableNoteTier(data),'medium');data=addPlanTask(data,{id:'middle',text:'Medium',tier:'medium',done:false,steps:[],expanded:false});assert.equal(availableNoteTier(data),null);data=deletePlanTask(data,data.tasks.find(t=>t.tier==='main')!.id,at);assert.equal(availableNoteTier(data),'main');data.notes=[{id:'note',text:'Important thought',createdAt:at}];data=addPlanTask(data,{id:'converted',text:data.notes[0].text,tier:availableNoteTier(data)!,done:false,steps:[],expanded:false},'note');assert.equal(data.notes.length,0);assert.equal(data.tasks.length,9);});
test('completing a legacy paused task checkpoints pending work before clearing attribution',()=>{
  const data=active('flow');
  data.timer={...data.timer,status:'paused',elapsed:60,startedAt:null,accounted:0};
  const task=data.tasks[0];
  const completed=updatePlanTask(data,{...task,done:true},at);
  assert.equal(completed.activeTaskId,null);
  assert.equal(completed.timer.status,'paused');
  assert.equal(completed.timer.accounted,60);
  assert.equal(total(completed),60);
  assert.equal(completed.sessions[0].task,task.text);
  assert.equal(resetFocus(completed,at+1000).sessions.length,1);
});
test('resuming legacy paused work checkpoints once and counts only newly resumed time',()=>{
  const data=active('flow');
  data.timer={...data.timer,status:'paused',elapsed:60,startedAt:null,accounted:0};
  const resumed=toggleFocus(data,at);
  assert.equal(resumed.timer.status,'running');
  assert.equal(total(resumed),60);
  assert.equal(resumed.timer.accounted,60);
  assert.equal(resumed.sessions[0].task,data.tasks[0].text);
  const paused=pauseFocus(resumed,at+10000);
  assert.equal(total(paused),70);
  assert.deepEqual(paused.sessions.map(session=>session.seconds),[60,10]);
  assert.strictEqual(pauseFocus(paused,at+20000),paused);
});
test('stale automatic settlement after reset or mode change cannot replace newer state',()=>{
  const data=active();
  const deadline=at+1500000;
  const reset=resetFocus(data,deadline);
  assert.equal(total(reset),1500);
  assert.strictEqual(settleTimer(reset,deadline),reset);
  assert.equal(reset.timer.status,'idle');
  const switched=resetFocus(data,deadline,'flow');
  assert.strictEqual(settleTimer(switched,deadline),switched);
  assert.equal(switched.timer.mode,'flow');
  assert.equal(switched.timer.phase,'work');
  assert.equal(total(switched),1500);
});
test('completing the active task at exact deadline settles a single full session',()=>{
  const data=active();
  const completed=updatePlanTask(data,{...data.tasks[0],done:true},at+1500000);
  assert.equal(completed.activeTaskId,null);
  assert.equal(completed.timer.phase,'break');
  assert.equal(completed.timer.status,'idle');
  assert.equal(total(completed),1500);
  assert.equal(completed.sessions.length,1);
  assert.strictEqual(settleTimer(completed,at+1500000),completed);
  assert.equal(pauseFocus(completed,at+1600000).sessions.length,1);
});
