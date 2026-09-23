import { afterEach, expect, it, vi } from "vitest";
import { createPracticeApi } from "./api";
import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileProgress, MobileProgressTake, MobileReview, MobileScript } from "../lib/api";
const identity="a".repeat(64), flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const review:MobileReview={takeId:"take",scriptId:"script",favorite:false,displayName:null,createdAt:"2026-09-23T00:00:00Z",reviewedAt:null,transcriptText:"Hello",audioIdentity:identity,
 evaluation:{score:80,accuracyScore:80,fluencyScore:80,rhythmScore:80,summaryJa:"Good",strengthsJa:[],weakWords:[],scriptWordCount:1,transcriptWordCount:1},coach:{titleJa:"Next",summaryJa:"Next",bulletPointsJa:[],nextStepJa:"Next",focusWords:[]}};
function fixture(){
 const script={currentRevisionId: "60000000-0000-4000-8000-000000000001", archivedAt: null, lockVersion: 1, practiceEpoch: 1, id:"script",title:"Canonical",content:"Hello",targetSeconds:60,locale:"en-US",createdAt:"2026-09-23T00:00:00Z",updatedAt:"2026-09-23T00:00:00Z"};
 const take:MobileProgressTake={...review,id:"take",score:80,accuracyScore:80,fluencyScore:80,rhythmScore:80,weakWords:[]};
 const progress:MobileProgress={totalScripts:1,totalReviewedTakes:1,bestTakeCount:1,scripts:[{allTimeTakeCount: 0, legacyTakeCount: 0, legacyRecordCount: 0, revisionHistory: [], script,takeCount:1,latestTake:take,bestTake:take,previousTake:null,takeHistory:[take],latestVsPrevious:null,latestVsBest:null,improvementTrend:"insufficient_data"}]};
 let status=200,writeStatus=200,malformed=false,version:unknown=identity,hold:((path:string)=>Promise<void>)|undefined;
 const fetchImpl=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
  const path=new URL(String(input)).pathname,isWrite=!!init?.method&&init.method!=="GET";
  const capturedStatus=isWrite?writeStatus:status;
  const data=path.includes("/reviews/")?{review:{...review,takeId:path.split("/").at(-1),audioIdentity:version}}:path.endsWith("/progress")?{progress}:path.endsWith("/scripts")?isWrite?{script:{...script,id:"created",title:"Created",updatedAt:"2026-09-24T00:00:00Z"}}:{scripts:[script]}:path.endsWith("/evaluate")?{review}:path.includes("/takes/")?{metadata:{takeId:"take",favorite:true,displayName:"Named"}}:{script};
  const body=JSON.stringify(malformed?{}:capturedStatus===200?{ok:true,data}:{ok:false,error:{code:"review_not_found"}});
  await hold?.(path);
  if(path.endsWith("/audio"))return new Response(new Blob(["owned"],{type:"audio/wav"}),{headers:{"content-type":"audio/wav","content-disposition":"attachment; filename*=UTF-8''Take.wav","x-take-audio-identity":String(version)}});
  return new Response(body,{status:capturedStatus,headers:{"content-type":"application/json"}});
 });vi.stubGlobal("fetch",fetchImpl);
 const access=vi.fn(async()=>"fixture-token");const auth={getState:()=>({kind:"authenticated",userId:"owner"}),getAccessToken:access} as unknown as MobileAuthController;
 const api=createPracticeApi({auth,bffBaseUrl:"https://fixture.test",ownerUserId:"owner",onTiming:()=>undefined});
 const count=(path:string)=>fetchImpl.mock.calls.filter(([u,init])=>String(u).endsWith(path)&&(!init?.method||init.method==="GET")).length;
 const open=async()=>{const s=api.scriptsMemory!,p=api.progressMemory!,r=api.reviewMemory!;s.enter("scripts");p.enter();r.enter("script/take");await Promise.all([s.revalidate(),p.revalidate(),r.revalidate()]);};
 const stop=()=>{api.scriptsMemory!.revoke();api.reviewMemory!.revoke();api.progressMemory!.revoke();api.savedTakeAudioMemory!.revoke();};
 return{api,fetchImpl,count,open,stop,access,setScript:(patch:Partial<MobileScript>)=>Object.assign(script,patch),setStatus:(v:number)=>{status=v;},setWriteStatus:(v:number)=>{writeStatus=v;},setMalformed:()=>{malformed=true;},setVersion:(v:unknown)=>{version=v;},hold:(v:typeof hold)=>{hold=v;}};
}
afterEach(()=>vi.unstubAllGlobals());
it("Review revisit shares its fresh audio validation, skips fresh title GET, and reuses one binary",async()=>{
 const f=fixture(),m=f.api.reviewMemory!;let leave=m.enter("script/take");await m.revalidate();const first=m.peek("script/take")!.review;await f.api.prepareSavedTakeAudio!(first);leave();expect(m.peek("script/take")!.review.audioVisit).toBeUndefined();
 leave=m.enter("script/take");await m.revalidate();await f.api.prepareSavedTakeAudio!(m.peek("script/take")!.review);expect(f.count("/script")).toBe(1);expect(f.count("/reviews/take")).toBe(2);expect(f.count("/audio")).toBe(1);await f.api.downloadTakeAudio("take");expect(f.count("/audio")).toBe(2);leave();f.stop();
});
it("A/B/A retains both Review metadata while validating each audio visit",async()=>{
 const f=fixture(),m=f.api.reviewMemory!;let leave=m.enter("script/take");await m.revalidate();leave();leave=m.enter("script/other");await m.revalidate();leave();leave=m.enter("script/take");expect(m.getSnapshot("script/take")).toMatchObject({kind:"ready",data:{review:{takeId:"take"}}});await m.revalidate();expect(f.count("/script")).toBe(2);expect(m.inspect().entries).toBe(2);leave();f.stop();
});
it.each([null,"invalid"])("metadata remains usable with audio identity %j but cannot authorize audio",async value=>{
 const f=fixture();f.setVersion(value);const m=f.api.reviewMemory!,leave=m.enter("script/take");await m.revalidate();expect(m.peek("script/take")).toBeDefined();expect((await f.api.prepareSavedTakeAudio!(m.peek("script/take")!.review)).kind).not.toBe("success");leave();expect(m.peek("script/take")).toBeDefined();f.stop();
});
it("name/favorite success patches exact Take in Review and shared aggregates, with no follow-up GET or Scripts invalidation",async()=>{
 const f=fixture();await f.open();const before=f.fetchImpl.mock.calls.length;const result=await f.api.updateTakeMetadata("take",{favorite:true,displayName:"Named"});await flush();expect(result.kind).toBe("success");expect(f.fetchImpl.mock.calls.length).toBe(before+1);
 expect(f.api.reviewMemory!.peek("script/take")!.review).toMatchObject({favorite:true,displayName:"Named"});const p=f.api.progressMemory!.memory.peek("progress")!;expect(p.scripts[0].latestTake).toMatchObject({favorite:true,displayName:"Named"});expect(p.scripts[0].bestTake).toMatchObject({favorite:true,displayName:"Named"});expect(p.scripts[0].takeHistory[0]).toMatchObject({favorite:true,displayName:"Named"});expect(p.totalReviewedTakes).toBe(1);expect(f.api.scriptsMemory!.peek("scripts")).toHaveLength(1);f.stop();
});
it("server rejection keeps prior values and does not falsely apply or refresh unrelated data",async()=>{
 const f=fixture();await f.open();f.setWriteStatus(409);const count=f.fetchImpl.mock.calls.length;expect((await f.api.updateTakeMetadata("take",{favorite:true})).kind).toBe("conflict");await flush();expect(f.api.reviewMemory!.peek("script/take")!.review.favorite).toBe(false);expect(f.fetchImpl.mock.calls.length).toBe(count+1);f.stop();
});
it("ambiguous write triggers only affected canonical reconciliation and retains visible data",async()=>{
 const f=fixture();await f.open();f.setWriteStatus(503);const scripts=f.count("/scripts"),before=f.count("/reviews/take");const result=await f.api.updateTakeMetadata("take",{favorite:true});expect(result.kind).toBe("server-error");expect(f.api.reviewMemory!.getSnapshot("script/take").kind).toBe("ready");await Promise.all([f.api.reviewMemory!.revalidate(),f.api.progressMemory!.revalidate()]);expect(f.count("/scripts")).toBe(scripts);expect(f.count("/reviews/take")).toBe(before+1);expect(f.api.reviewMemory!.peek("script/take")!.review.favorite).toBe(false);f.stop();
});
it("script create patches owned list order and refreshes shared aggregate only",async()=>{
 const f=fixture();await f.open();const scripts=f.count("/scripts"),reviews=f.count("/reviews/take");await f.api.createScript({title:"Created",content:"Hello"});await f.api.progressMemory!.revalidate();expect(f.api.scriptsMemory!.peek("scripts")!.map(s=>s.id)).toEqual(["created","script"]);expect(f.count("/scripts")).toBe(scripts);expect(f.count("/reviews/take")).toBe(reviews);f.stop();
});
it("evaluation seeds exact saved Review and marks aggregate dirty without refreshing Scripts",async()=>{
 const f=fixture();await f.open();const scripts=f.count("/scripts"),reviews=f.count("/reviews/take");await f.api.evaluateRecording({expectedRevisionId: "60000000-0000-4000-8000-000000000001", expectedPracticeEpoch: 1, scriptId:"script",takeId:"take",recordingRef:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"});await f.api.progressMemory!.revalidate();expect(f.api.reviewMemory!.peek("script/take")!.review.evaluation.score).toBe(80);expect(f.count("/scripts")).toBe(scripts);expect(f.count("/reviews/take")).toBe(reviews);f.stop();
});
it.each([403,404])("detected resource %i removes related aggregates and Review; unrelated Scripts remain",async status=>{
 const f=fixture();await f.open();f.setStatus(status);await f.api.reviewMemory!.revalidate();expect(f.api.reviewMemory!.getSnapshot("script/take").kind).toBe("error");expect(f.api.progressMemory!.memory.peek("progress")).toBeUndefined();expect(f.api.scriptsMemory!.peek("scripts")).toHaveLength(1);f.stop();
});
it("temporary Review read failure retains metadata but no stale audio authorization or route retry",async()=>{
 const f=fixture(),m=f.api.reviewMemory!;let leave=m.enter("script/take");await m.revalidate();f.setStatus(503);await m.revalidate();expect(m.peek("script/take")).toBeDefined();expect(m.peek("script/take")!.review.audioVisit).toBeUndefined();const requests=f.count("/reviews/take");leave();leave=m.enter("script/take");await flush();expect(f.count("/reviews/take")).toBe(requests);leave();f.stop();
});
it("malformed revalidation cannot silently retain the previous display",async()=>{const f=fixture();await f.open();f.setMalformed();await f.api.reviewMemory!.revalidate();expect(f.api.reviewMemory!.getSnapshot("script/take").kind).toBe("error");f.stop();});
it("late pre-write canonical read cannot overwrite successful Take metadata",async()=>{
 const f=fixture();await f.open();let release!:()=>void;f.hold(path=>path.includes("/reviews/")?new Promise<void>(r=>{release=r;}):Promise.resolve());const stale=f.api.reviewMemory!.revalidate();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));await f.api.updateTakeMetadata("take",{favorite:true});release();await stale;expect(f.api.reviewMemory!.peek("script/take")!.review.favorite).toBe(true);f.stop();
});
it.each(["voice-request","voice-advance"])("%s does not invalidate display metadata",async name=>{const f=fixture();await f.open();f.setWriteStatus(503);const n=f.fetchImpl.mock.calls.length;await(name==="voice-request"?f.api.createVoiceDeletionRequest():f.api.advanceVoiceDeletion());await flush();expect(f.fetchImpl.mock.calls.length).toBe(n+1);expect(f.api.reviewMemory!.peek("script/take")).toBeDefined();f.stop();});
it("save while entry validation is pending does not GET until explicit Play, which obtains a new proof",async()=>{
 const f=fixture(),m=f.api.reviewMemory!;let leave=m.enter("script/take");await m.revalidate();leave();
 let release!:()=>void;f.hold(path=>path.includes("/reviews/")?new Promise<void>(r=>{release=r;}):Promise.resolve());leave=m.enter("script/take");await vi.waitFor(()=>expect(release).toBeTypeOf("function"));const count=f.count("/reviews/take");
 await f.api.updateTakeMetadata("take",{favorite:true});release();await flush();expect(m.peek("script/take")!.review.favorite).toBe(true);expect(f.count("/reviews/take")).toBe(count);f.hold(undefined);
 expect((await f.api.prepareSavedTakeAudio!(m.peek("script/take")!.review)).kind).toBe("success");expect(f.count("/reviews/take")).toBe(count+1);leave();const after=f.count("/reviews/take");expect((await f.api.prepareSavedTakeAudio!(m.peek("script/take")!.review)).kind).not.toBe("success");expect(f.count("/reviews/take")).toBe(after);f.stop();
});
it("audio-only visits do not renew the separately confirmed script title age",async()=>{
 let now=0;const clock=vi.spyOn(performance,"now").mockImplementation(()=>now);const f=fixture(),m=f.api.reviewMemory!;
 try {let leave=m.enter("script/take");await m.revalidate();leave();now=120000;leave=m.enter("script/take");await m.revalidate();leave();expect(f.count("/script")).toBe(1);now=300000;leave=m.enter("script/take");await m.revalidate();expect(f.count("/script")).toBe(2);leave();}finally{clock.mockRestore();f.stop();}
});
it("unknown auth bridge exception is not mislabeled as a temporary connection failure",async()=>{
 const f=fixture();await f.open();f.access.mockRejectedValue(Error("unknown bridge fault"));await Promise.all([f.api.scriptsMemory!.revalidate(),f.api.progressMemory!.revalidate(),f.api.reviewMemory!.revalidate()]);for(const state of [f.api.scriptsMemory!.getSnapshot("scripts"),f.api.progressMemory!.getSnapshot(),f.api.reviewMemory!.getSnapshot("script/take")])expect(state).toMatchObject({kind:"error",error:{kind:"invalid-response"}});f.stop();
});

it.each(["edit", "archive", "restore"])("script %s retains unrelated Review and patches only active list metadata", async operation => {
 const f=fixture(); await f.open();
 const memory=f.api.reviewMemory!;
 memory.seed("other/other",{review:{...review,scriptId:"other",takeId:"other"},scriptTitle:"Other"});
 const before=f.count("/reviews/other");
 const archivedAt=operation==="archive"?"2026-09-24T00:00:00Z":null;
 f.setScript({title:"Changed",archivedAt,lockVersion:2});
 const result=await f.api.mutateScript!("script",operation==="edit"?{title:"Changed",content:"Hello",expectedRevisionId:"60000000-0000-4000-8000-000000000001",expectedLockVersion:1}:{archived:operation==="archive",expectedLockVersion:1});
 expect(result.kind).toBe("success");
 expect(memory.peek("other/other")?.scriptTitle).toBe("Other");
 expect(f.count("/reviews/other")).toBe(before);
 expect(f.api.scriptsMemory!.peek("scripts")).toHaveLength(operation==="archive"?0:1);
 expect(memory.getSnapshot("script/take").kind).toBe("ready");
 await Promise.all([memory.revalidate(),f.api.progressMemory!.revalidate()]);
 expect(memory.peek("script/take")?.scriptArchived).toBe(operation==="archive");
 f.stop();
});
it("late edit response cannot reinsert a script archived by a newer mutation", async()=>{
 const f=fixture();await f.open();let release!:()=>void,held=false;
 f.setScript({title:"Edited",lockVersion:2});
 f.hold(path=>path.endsWith("/script")&&!held?(held=true,new Promise<void>(r=>{release=r;})):Promise.resolve());
 const edit=f.api.mutateScript!("script",{title:"Edited",content:"Hello",expectedRevisionId:"60000000-0000-4000-8000-000000000001",expectedLockVersion:1});
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 f.setScript({archivedAt:"2026-09-24T00:00:00Z",lockVersion:3});
 await f.api.mutateScript!("script",{archived:true,expectedLockVersion:2});
 expect(f.api.scriptsMemory!.peek("scripts")).toHaveLength(0);
 release();await edit;
 expect(f.api.scriptsMemory!.peek("scripts")).toHaveLength(0);
 f.stop();
});
