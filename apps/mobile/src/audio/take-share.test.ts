import { describe, expect, it, vi } from 'vitest';
import { TakeShareController, type TakeShareDependencies } from './take-share';
import { encodeMonoPcm16Wav } from '../../../../lib/browser-pcm-wav';
import type { MobileTakeAudioDownloadState } from '../lib/api';
const bytes=encodeMonoPcm16Wav(new Float32Array(1600).fill(.01));
const audio:MobileTakeAudioDownloadState={kind:'success',audio:new Blob([bytes],{type:'audio/wav'}),contentType:'audio/wav',filename:'Morning.wav'};
function setup(){const events:string[]=[];const deps:TakeShareDependencies={supported:()=>true,cleanup:vi.fn(async()=>{events.push('cleanup')}),write:vi.fn(async()=>{events.push('write');return 'file:///cache/Morning.wav'}),share:vi.fn(async()=>{events.push('sheet-completed')})};return {deps,events,c:new TakeShareController(deps)}}
describe('native Share lifecycle (plugin adapter fake, not device proof)',()=>{
 it('awaits native completion before deleting, serializes repeated taps, and fetches fresh on each share',async()=>{
  const {deps,events,c}=setup();let finish!:()=>void;deps.share=vi.fn(()=>new Promise<void>(r=>{events.push('sheet');finish=r}));
  const fetch=vi.fn(async()=>audio);const pending=c.share(fetch,()=>true);await vi.waitFor(()=>expect(events).toEqual(['cleanup','write','sheet']));
  expect(await c.share(fetch,()=>true)).toBe('busy');expect(fetch).toHaveBeenCalledTimes(1);await c.cleanupIdle();expect(events).toHaveLength(3);
  finish();expect(await pending).toBe('finished');expect(events).toEqual(['cleanup','write','sheet','cleanup']);
  deps.share=vi.fn(async()=>undefined);expect(await c.share(fetch,()=>true)).toBe('finished');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('cancel preserves caller state and cleans only after native cancellation',async()=>{const {deps,c}=setup();deps.share=vi.fn(async()=>{throw Error('Share canceled')});const before=JSON.stringify(audio);expect(await c.share(async()=>audio,()=>true)).toBe('cancelled');expect(JSON.stringify(audio)).toBe(before);expect(deps.cleanup).toHaveBeenCalledTimes(2)});
 it.each(['write','share'] as const)('cleans preparation/invocation failure: %s',async phase=>{const {deps,c}=setup();deps[phase]=vi.fn(async()=>{throw Error('native error')});expect(await c.share(async()=>audio,()=>true)).toBe('failed');expect(deps.cleanup).toHaveBeenCalledTimes(2)});
 it.each([{kind:'not-found',reasonCode:'audio_not_found'},{kind:'forbidden',reasonCode:'owner'},{kind:'network-error'},{kind:'server-error',status:503}] as const)('does not write or share on fetch $kind',async result=>{const {deps,c}=setup();await c.share(async()=>result,()=>true);expect(deps.write).not.toHaveBeenCalled();expect(deps.share).not.toHaveBeenCalled()});
 it('blocks pending old-owner preparation on logout/account switch',async()=>{
  const {deps,c}=setup();let deliver!:(a:MobileTakeAudioDownloadState)=>void;const p=c.share(()=>new Promise(r=>{deliver=r}),()=>true);await vi.waitFor(()=>expect(deliver).toBeTypeOf('function'));c.invalidate();deliver(audio);expect(await p).toBe('cancelled');expect(deps.write).not.toHaveBeenCalled();
 });
 it('does not delete an active native sheet file when owner switches, and never reuses it',async()=>{
  const {deps,c}=setup();let finish!:()=>void;deps.share=vi.fn(()=>new Promise<void>(r=>finish=r));const p=c.share(async()=>audio,()=>true);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));c.invalidate();expect(deps.cleanup).toHaveBeenCalledTimes(1);finish();await p;expect(deps.cleanup).toHaveBeenCalledTimes(2);
 });
 it('blocks navigation-stale work even after a cache write',async()=>{const {deps,c}=setup();let current=true;deps.write=vi.fn(async()=>{current=false;return 'file:///cache/a.wav'});expect(await c.share(async()=>audio,()=>current)).toBe('cancelled');expect(deps.share).not.toHaveBeenCalled();expect(deps.cleanup).toHaveBeenCalledTimes(2)});
 it('cleanup failure stops unbounded accumulation and can recover next attempt',async()=>{const {deps,c}=setup();deps.cleanup=vi.fn(async()=>{throw Error('disk')});expect(await c.share(async()=>audio,()=>true)).toBe('cleanup-failed');expect(deps.write).not.toHaveBeenCalled();deps.cleanup=vi.fn(async()=>undefined);expect(await c.share(async()=>audio,()=>true)).toBe('finished')});
 it('cleans crash leftovers on startup and rejects unsupported platform without write',async()=>{const {deps,c}=setup();await c.cleanupIdle();expect(deps.cleanup).toHaveBeenCalledOnce();deps.supported=()=>false;expect(await c.share(async()=>audio,()=>true)).toBe('unavailable');expect(deps.write).not.toHaveBeenCalled()});
 it('rejects wrong extension and path-like filename',async()=>{const {deps,c}=setup();for(const filename of ['Morning.mp3','../Morning.wav'])expect(await c.share(async()=>({...audio,filename}),()=>true)).toBe('unavailable');expect(deps.write).not.toHaveBeenCalled()});
});
