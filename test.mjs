import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from './engine.mjs';
import {sample} from './sample.mjs';
test('domain behavior and boundary cases',()=>{assert.equal(run(sample).metrics.blocked,1);assert.equal(run(sample).rows[3].state,'closed');assert.throws(()=>run({...sample,threshold:0}));});
test('deterministic result and input preservation',()=>{const copy=JSON.stringify(sample);assert.deepEqual(run(sample),run(sample));assert.equal(JSON.stringify(sample),copy);});
test('reject malformed root and oversized input',()=>{assert.throws(()=>run(null));assert.throws(()=>run([]));assert.throws(()=>run({...sample,oversized:'x'.repeat(200001)}));});


test('cooldown boundary admits a recovery probe and exposes its transition', () => {
  const report = run(sample);
  assert.equal(report.rows[2].reason, 'cooldown-active');
  assert.equal(report.rows[2].retryAt, 6);
  assert.deepEqual([report.rows[3].before, report.rows[3].admittedState, report.rows[3].state], ['open','half-open','closed']);
  assert.equal(report.metrics.probes, 1);
});
test('multiple successes are required when configured; failed probe restarts cooldown', () => {
  const report = run({threshold:1,cooldown:5,recoverySuccesses:2,events:[
    {at:0,ok:false},{at:5,ok:true},{at:6,ok:false},{at:10,ok:true},
    {at:11,ok:true},{at:12,ok:true},{at:13,ok:false}]});
  assert.deepEqual(report.rows.map(r=>r.state), ['open','half-open','open','open','half-open','closed','open']);
  assert.equal(report.rows[2].retryAt,11);
  assert.equal(report.rows[3].result,'blocked');
  assert.equal(report.metrics.probes,4);
  assert.equal(report.metrics.recovered,1);
});
test('blocked success and failure outcomes do not change counters or deadline', () => {
  const runWith = ok => run({threshold:1,cooldown:10,events:[{at:0,ok:false},{at:1,ok} ]});
  assert.deepEqual(runWith(true),runWith(false));
});
test('closed successes reset consecutive failures', () => {
  const report=run({threshold:2,cooldown:1,events:[false,true,false,false].map((ok,at)=>({at,ok}))});
  assert.deepEqual(report.rows.map(r=>r.failures),[1,0,1,2]);
  assert.equal(report.metrics.opened,1);
});
test('equal times are processed in array order, including zero cooldown', () => {
  const report=run({threshold:1,cooldown:0,recoverySuccesses:2,events:[false,true,true].map(ok=>({at:0,ok}))});
  assert.deepEqual(report.rows.map(r=>r.state),['open','half-open','closed']);
  assert.equal(report.metrics.blocked,0);
});
test('empty log and recovery pending at end have explicit final states', () => {
  assert.deepEqual(run({...sample,events:[]}).final,{state:'closed',failures:0,recoveryProgress:0,retryAt:null});
  assert.equal(run({threshold:1,cooldown:0,recoverySuccesses:2,events:[{at:0,ok:false},{at:1,ok:true}]}).final.state,'half-open');
});
test('reject invalid recovery settings, events and out-of-order logs', () => {
  for(const recoverySuccesses of [null,0,-1,1.5,Infinity,'2']) assert.throws(()=>run({...sample,recoverySuccesses}));
  for(const events of [[null],[{at:0,ok:1}],[{at:Infinity,ok:true}],[{at:2,ok:true},{at:1,ok:false}],new Array(1),Array(501).fill({at:0,ok:true})])
    assert.throws(()=>run({...sample,events}));
});
test('default recovery preserves legacy outcomes over all 256 eight-event traces', () => {
  for(let mask=0;mask<256;mask++) {
    const events=Array.from({length:8},(_,at)=>({at,ok:Boolean(mask & (1<<at))}));
    let failures=0, until=-Infinity;
    const expected=events.map(({at,ok})=>{
      if(at<until)return ['blocked','open'];
      if(ok){failures=0;until=-Infinity;return ['success','closed'];}
      failures++;if(failures>=2)until=at+2;
      return ['failure',failures>=2?'open':'closed'];
    });
    assert.deepEqual(run({threshold:2,cooldown:2,events}).rows.map(r=>[r.result,r.state]),expected);
  }
});
