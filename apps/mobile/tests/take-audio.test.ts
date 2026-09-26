import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { handleTakeAudioGet, handleTakeAudioOptions } from '../../../lib/mobile/take-audio-route';
import { loadOwnedTakeAudio } from '../../../services/takes/take-audio.service';
import { takeAudioFormat, takeExportFilename } from '../../../lib/take-audio-format';
import { encodeMonoPcm16Wav } from '../../../lib/browser-pcm-wav';
import { downloadMobileTakeAudio } from '../src/lib/api';
import type { AppSupabaseClient } from '../../../lib/supabase/client';
import { getOwnedTakeAudioIdentity } from '../../../services/takes/take-audio-identity';

const user='10000000-0000-4000-8000-000000000003', other='10000000-0000-4000-8000-000000000002';
const scriptId='20000000-0000-4000-8000-000000000003', takeId='30000000-0000-4000-8000-000000000003';
const bytes=encodeMonoPcm16Wav(new Float32Array(1600).fill(.01));
function fixture(overrides: Record<string, unknown> = {}, missing = false) {
  const take={script_revision_id: "60000000-0000-4000-8000-000000000001", script_title_snapshot: "Saved title", script_practice_epoch: 1, id:takeId,user_id:user,script_id:scriptId,status:'reviewed',audio_path:`storage://recordings/${user}/${scriptId}/capture.wav`,display_name:'朝の声',favorite:false,score:82,...overrides};
  const script={current_revision_id: "60000000-0000-4000-8000-000000000001", archived_at: null, lock_version: 1, practice_epoch: 1, id:scriptId,user_id:user,title:'A small pause',content:'Hello',locale:'en-US',target_seconds:60,created_at:'2026-09-17',updated_at:'2026-09-17'};
  const calls: unknown[][]=[];
  const download=vi.fn(async()=>missing?{data:null,error:{message:'private storage locator'}}:{data:new Blob([bytes],{type:'audio/wav'}),error:null});
  const info=vi.fn(async()=>missing?{data:null,error:{statusCode:'404'}}:{data:{id:'object-id',version:'object-version',etag:'content-etag',size:bytes.byteLength},error:null});
  const bucket=vi.fn(()=>({download,info}));
  const client={from(table:string){const filters: [string,string|string[]][]=[];const query={select(){return query},eq(k:string,v:string){filters.push([k,v]);calls.push([table,k,v]);return query},in(k:string,v:string[]){filters.push([k,v]);calls.push([table,k,v]);return query},async maybeSingle(){const row:Record<string,unknown>=table==='takes'?take:script;return {data:filters.every(([k,v])=>Array.isArray(v)?v.includes(String(row[k])):row[k]===v)?row:null,error:null}}};return query},storage:{from:bucket}} as unknown as AppSupabaseClient;
  return {take,client,download,info,bucket,calls};
}
function req(owner=user, auth=true){return new NextRequest('https://fixture.test/api/mobile/takes/'+takeId+'/audio',{headers:{origin:'capacitor://localhost',...(auth?{authorization:'Bearer '+owner}:{})}})}
function deps(f:ReturnType<typeof fixture>, owner=user){return {hasConfig:()=>true,createClient:()=>f.client,validateUser:async()=>({data:{user:{id:owner}},error:null}),loadOwnedTakeAudio}}

describe('owned Take playback/share binary boundary',()=>{
 it('uses current object id/version; detects replacement during download and never exposes the key',async()=>{
  const f=fixture(); const before=await getOwnedTakeAudioIdentity(f.client,user,f.take);
  expect(before).toMatch(/^[a-f0-9]{64}$/);
  f.info.mockResolvedValueOnce({data:{id:'object-id',version:'new-version',etag:'content-etag',size:bytes.byteLength},error:null});
  expect(await getOwnedTakeAudioIdentity(f.client,user,f.take)).not.toBe(before);
  f.info.mockResolvedValueOnce({data:{id:'object-id',version:'object-version',etag:'content-etag',size:bytes.byteLength},error:null});
  f.info.mockResolvedValueOnce({data:{id:'object-id',version:'replacement',etag:'content-etag',size:bytes.byteLength},error:null});
  const response=await handleTakeAudioGet(req(),takeId,deps(f)); expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(user);
 });
 it('refuses a missing version instead of degrading to a locator-only identity',async()=>{
  const f=fixture();f.info.mockResolvedValue({data:{id:'object-id',version:'',etag:'content-etag',size:bytes.byteLength},error:null});
  await expect(getOwnedTakeAudioIdentity(f.client,user,f.take)).rejects.toThrow();
  expect((await handleTakeAudioGet(req(),takeId,deps(f))).status).toBe(503);expect(f.download).not.toHaveBeenCalled();
 });
 it('connects Bearer -> exact reviewed Take -> owned recording loader; has no mutation or public locator',async()=>{
  const f=fixture(), before=JSON.stringify(f.take);const response=await handleTakeAudioGet(req(),takeId,deps(f));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-type')).toBe('audio/wav');expect(response.headers.get('content-disposition')).toContain(encodeURIComponent('朝の声.wav'));
  expect(response.headers.get('access-control-expose-headers')).toContain('Content-Disposition');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(bytes));
  expect(f.bucket).toHaveBeenCalledWith('recordings');expect(f.download).toHaveBeenCalledWith(`${user}/${scriptId}/capture.wav`);
  expect(f.calls).toContainEqual(['takes','status',['reviewed','completed']]);expect(f.calls).toContainEqual(['takes','user_id',user]);
  expect(JSON.stringify(f.take)).toBe(before);expect(JSON.stringify([...response.headers])).not.toContain(user);
 });
 it('permits completed legacy recording without promoting it and uses saved title for versioned export',async()=>{ const legacy=fixture({status:'completed',script_revision_id:null,script_title_snapshot:null});expect((await handleTakeAudioGet(req(),takeId,deps(legacy))).status).toBe(200);expect(legacy.take.status).toBe('completed');const versioned=fixture({display_name:null});const audio=await loadOwnedTakeAudio(versioned.client,user,takeId);expect(audio.filename).toBe('Saved title.wav'); });
 it('rejects wrong owner and missing Bearer before Storage',async()=>{
  const f=fixture();expect((await handleTakeAudioGet(req(other),takeId,deps(f,other))).status).toBe(404);
  expect((await handleTakeAudioGet(req(user,false),takeId,deps(f))).status).toBe(401);expect(f.download).not.toHaveBeenCalled();
 });
 it.each(['pending','evaluating','recorded'])('rejects unsaved status %s',async status=>{const f=fixture({status});expect((await handleTakeAudioGet(req(),takeId,deps(f))).status).toBe(404);expect(f.download).not.toHaveBeenCalled()});
 it.each(['storage://script-audios/a.wav','storage://voice-samples/a.wav','storage://voice-consents/a.wav','https://public.invalid/a.wav','mock/a.wav',`storage://recordings/${other}/${scriptId}/a.wav`])('never downloads excluded assets %s',async audio_path=>{
  const f=fixture({audio_path});expect((await handleTakeAudioGet(req(),takeId,deps(f))).status).toBe(404);expect(f.download).not.toHaveBeenCalled();
 });
 it('maps deleted storage to not found and permits a new retry',async()=>{const f=fixture({},true);const r=await handleTakeAudioGet(req(),takeId,deps(f));expect(r.status).toBe(404);expect(await r.text()).not.toContain('private storage');expect((await handleTakeAudioGet(req(),takeId,deps(fixture()))).status).toBe(200)});
 it('validates id and auth-only GET preflight',async()=>{const f=fixture();expect((await handleTakeAudioGet(req(),'bad',deps(f))).status).toBe(400);expect(f.download).not.toHaveBeenCalled();expect(handleTakeAudioOptions(new NextRequest('https://fixture.test',{method:'OPTIONS',headers:{origin:'capacitor://localhost','access-control-request-method':'GET','access-control-request-headers':'authorization'}})).status).toBe(204)});
 it('client sends only Bearer/Take id and validates a private filename',async()=>{
  const f=fixture();const fetchImpl=vi.fn(async(_url: string | URL | Request,init?:RequestInit)=>{expect(String(_url)).toBe('https://fixture.test/api/mobile/takes/'+takeId+'/audio');expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-token');return handleTakeAudioGet(req(),takeId,deps(f))});
  expect(await downloadMobileTakeAudio('https://fixture.test','local-token',takeId,{fetchImpl})).toMatchObject({kind:'success',filename:'朝の声.wav',contentType:'audio/wav'});
  expect((await downloadMobileTakeAudio('https://fixture.test','local-token',takeId,{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'audio/wav','content-disposition':"attachment; filename*=UTF-8''..%2Fsecret.wav"}})})).kind).toBe('invalid-response');
 });
 it('client fetch failure is recoverable',async()=>{expect((await downloadMobileTakeAudio('https://fixture.test','local-token',takeId,{fetchImpl:async()=>{throw Error('offline')}})).kind).toBe('network-error')});
});

describe('export format and filename',()=>{
 it('uses display name then script then safe fallback, not system identifiers',()=>{
  expect(takeExportFilename('  朝の声  ','Script','wav')).toBe('朝の声.wav');
  expect(takeExportFilename(null,'A small pause','wav')).toBe('A small pause.wav');
  expect(takeExportFilename('../<>:\\"|?*','  ','wav')).toBe('Native Minutes recording.wav');
  expect(takeExportFilename(user+' test@example.com sk-secret123 https://private.invalid/a','fallback','wav')).toBe('fallback.wav');
  expect(takeExportFilename('Name.m4a','Script','wav')).toBe('Name.wav');
  expect(() => encodeURIComponent(takeExportFilename('𠮷'.repeat(61),'Script','wav'))).not.toThrow();
  expect(takeExportFilename('𠮷'.repeat(61),'Script','wav')).toBe('𠮷'.repeat(60)+'.wav');
 });
 it('matches MIME and actual container signatures; no arbitrary file renamed as audio',()=>{
  expect(takeAudioFormat('audio/x-wav',new Uint8Array(bytes))).toEqual({contentType:'audio/wav',extension:'wav'});
  expect(takeAudioFormat('audio/mp4',new Uint8Array(bytes))).toBeNull();
  expect(takeAudioFormat('audio/wav',new TextEncoder().encode('<html>'))).toBeNull();
  expect(takeAudioFormat('application/octet-stream',new Uint8Array(bytes))).toBeNull();
 });
});
