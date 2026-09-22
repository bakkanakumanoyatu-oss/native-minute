import { afterEach, expect, it, vi } from "vitest";
import { DisplayMemory, type DisplayResult } from "./display-memory";
import { METADATA_LIMITS, METADATA_REFRESH_AGE_MS } from "./metadata-policy";
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const success = (value: string) => ({ kind: "success" as const, data: value });
afterEach(() => vi.useRealTimers());

it.each([20_000,31_000,60_000,120_000,299_999])("fresh revisit after %ims retains data without GET", async elapsed => {
 let time=0;const read=vi.fn(async()=>success("saved"));const m=new DisplayMemory(read,{now:()=>time});const leave=m.enter("a");await m.revalidate();leave();time=elapsed;
 const exit=m.enter("a");await flush();expect(m.getSnapshot("a")).toMatchObject({kind:"ready",data:"saved",refreshing:false});expect(read).toHaveBeenCalledOnce();exit();
});
it("five-minute age starts one nonblocking read only at next entry; reading does not renew age",async()=>{
 let time=0,resolve!:(r:DisplayResult<string>)=>void;const read=vi.fn().mockResolvedValueOnce(success("old")).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const m=new DisplayMemory<string>(read,{now:()=>time});const leave=m.enter("a");await m.revalidate();time=METADATA_REFRESH_AGE_MS;expect(m.getSnapshot("a")).toMatchObject({data:"old",refreshing:false});expect(read).toHaveBeenCalledOnce();leave();
 const x=m.enter("a"),y=m.enter("a");await flush();expect(read).toHaveBeenCalledTimes(2);expect(m.getSnapshot("a")).toMatchObject({data:"old",refreshing:true});resolve(success("new"));await flush();expect(m.getSnapshot("a")).toMatchObject({data:"new",refreshing:false});x();y();
});
it("30 seconds and five minutes while mounted cause neither timer fetch nor disappearance",async()=>{
 vi.useFakeTimers();const read=vi.fn(async()=>success("saved"));const m=new DisplayMemory(read);m.enter("a");await m.revalidate();await vi.advanceTimersByTimeAsync(600_000);expect(m.getSnapshot("a")).toMatchObject({data:"saved"});expect(read).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it("successful empty data is retained",async()=>{const read=vi.fn(async()=>({kind:"success" as const,data:[]}));const m=new DisplayMemory(read);const leave=m.enter("a");await m.revalidate();leave();m.enter("a");await flush();expect(m.getSnapshot("a")).toMatchObject({data:[]});expect(read).toHaveBeenCalledOnce();});
it("Review-sized LRU holds five, protects displayed entry and evicts unused oldest",async()=>{
 const m=new DisplayMemory(async key=>success(key),{limits:METADATA_LIMITS.reviews});const a=m.enter("a");await m.revalidate();
 for(const key of ["b","c","d","e","f"]){const leave=m.enter(key);await m.refreshKey(key);leave();}
 expect(m.inspect().entries).toBe(5);expect(m.getSnapshot("a")).toMatchObject({data:"a"});expect(m.getSnapshot("b").kind).toBe("loading");a();
});
it("byte limits evict reusable snapshots without removing an oversized mounted result",async()=>{
 const m=new DisplayMemory(async key=>success(key.repeat(100)),{limits:{entries:5,entryBytes:150,totalBytes:180}});
 const a=m.enter("a");await m.revalidate();const b=m.enter("b");await m.refreshKey("b");expect(m.inspect().bytes).toBeLessThanOrEqual(180);expect(m.getSnapshot("a").kind).toBe("ready");a();b();
 const c=m.enter("long");await m.revalidate();expect(m.getSnapshot("long").kind).toBe("ready");expect(m.inspect().bytes).toBeLessThanOrEqual(180);c();expect(m.getSnapshot("long").kind).toBe("loading");
});
it.each([{kind:"network-error" as const},{kind:"timeout" as const},{kind:"server-error" as const,status:503}])("temporary %j keeps data and does not retry on routes",async error=>{
 const read=vi.fn().mockResolvedValueOnce(success("old")).mockResolvedValue(error);const m=new DisplayMemory<string>(read);let leave=m.enter("a");await m.revalidate();await m.revalidate();expect(m.getSnapshot("a")).toMatchObject({kind:"ready",data:"old",updateError:error});
 for(let i=0;i<5;i++){leave();leave=m.enter("a");await flush();}expect(read).toHaveBeenCalledTimes(2);m.setOnline(false);m.setOnline(true);await flush();expect(read).toHaveBeenCalledTimes(3);leave();
});
it.each([{kind:"not-found" as const,reasonCode:"gone"},{kind:"forbidden" as const,reasonCode:"owner"},{kind:"unauthorized" as const,reasonCode:"expired"},{kind:"invalid-response" as const},{kind:"server-error" as const,status:418}])("non-temporary %j removes display and requires explicit recovery",async error=>{
 const read=vi.fn().mockResolvedValueOnce(success("old")).mockResolvedValue(error);const m=new DisplayMemory<string>(read);const leave=m.enter("a");await m.revalidate();await m.revalidate();expect(m.getSnapshot("a")).toMatchObject({kind:"error",error});leave();m.enter("a");await flush();expect(read).toHaveBeenCalledTimes(2);
});
it("unknown thrown failure is not labeled temporary network error",async()=>{const read=vi.fn().mockResolvedValueOnce(success("old")).mockRejectedValue(Error("unknown"));const m=new DisplayMemory<string>(read);m.enter("a");await m.revalidate();await m.revalidate();expect(m.getSnapshot("a")).toMatchObject({kind:"error",error:{kind:"invalid-response"}});});
it("rate limit honors Retry-After even for repeated manual action",async()=>{
 let time=0;const read=vi.fn().mockResolvedValueOnce(success("old")).mockResolvedValue({kind:"rate-limited",retryAfterSeconds:10});const m=new DisplayMemory<string>(read,{now:()=>time});m.enter("a");await m.revalidate();await m.revalidate();await m.revalidate();time=9999;await m.revalidate();expect(read).toHaveBeenCalledTimes(2);time=10000;await m.revalidate();expect(read).toHaveBeenCalledTimes(3);
});
it("background/offline abort pending refresh without deleting a successful snapshot",async()=>{
 let resolve!:(r:DisplayResult<string>)=>void;const read=vi.fn().mockResolvedValueOnce(success("old")).mockImplementation((_k,c)=>new Promise(r=>{expect(c.signal.aborted).toBe(false);resolve=r;}));const m=new DisplayMemory<string>(read);m.enter("a");await m.revalidate();void m.revalidate();await flush();m.setForeground(false);resolve(success("late"));await flush();expect(m.getSnapshot("a")).toMatchObject({data:"old",refreshing:false});m.setForeground(true);await flush();expect(read).toHaveBeenCalledTimes(3);resolve(success("fresh"));await flush();expect(m.getSnapshot("a")).toMatchObject({data:"fresh"});
});
it("normal token refresh retains metadata; real session revocation is irreversible",async()=>{
 const read=vi.fn(async()=>success("private"));let owner=true;const m=new DisplayMemory(read,{ownerIsCurrent:()=>owner});m.enter("a");await m.revalidate();m.setSessionReady(false);expect(m.getSnapshot("a")).toMatchObject({data:"private"});await m.revalidate();m.setSessionReady(true);await flush();expect(read).toHaveBeenCalledOnce();owner=false;expect(m.getSnapshot("a").kind).toBe("loading");m.revoke();owner=true;expect(m.getSnapshot("a").kind).toBe("loading");expect(m.inspect().entries).toBe(0);
});
it("mutation fences old reads, retains unrelated entries and applies exact fields without refreshing age",async()=>{
 let time=0,resolve!:(r:DisplayResult<string>)=>void;const read=vi.fn(async (key:string):Promise<DisplayResult<string>>=>success(key));const m=new DisplayMemory(read,{now:()=>time,limits:METADATA_LIMITS.reviews});m.enter("a");await m.revalidate();const b=m.enter("b");await m.refreshKey("b");b();read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));void m.refreshKey("a");await flush();const finish=m.beginMutation(k=>k==="a");m.update(k=>k==="a",()=>"updated");finish();resolve(success("stale"));await flush();expect(m.getSnapshot("a")).toMatchObject({data:"updated"});expect(m.getSnapshot("b")).toMatchObject({data:"b"});expect(read).toHaveBeenCalledTimes(3);time=300_000;m.setForeground(false);m.setForeground(true);await flush();expect(read).toHaveBeenCalledTimes(4);
});
it("canonical deletion fences a late response and cannot resurrect the resource",async()=>{
 let resolve!:(r:DisplayResult<string>)=>void;const read=vi.fn().mockResolvedValueOnce(success("old")).mockImplementation(()=>new Promise(r=>{resolve=r;}));const m=new DisplayMemory<string>(read);m.enter("a");await m.revalidate();void m.revalidate();await flush();m.remove(k=>k==="a",{kind:"not-found",reasonCode:"gone"});resolve(success("late"));await flush();expect(m.getSnapshot("a")).toMatchObject({kind:"error"});
});
it("audio visits use one shared fresh read and never cache the capability",async()=>{
 type Data={name:string;visit?:object};const read=vi.fn(async()=>({kind:"success" as const,data:{name:"a",visit:{}}}));const release=vi.fn();const m=new DisplayMemory<Data>(read,{audioOnEntry:true,snapshot:data=>({name:data.name}),release});let leave=m.enter("a");await m.revalidate();leave();expect(m.getSnapshot("a")).not.toHaveProperty("data.visit");leave=m.enter("a");const other=m.enter("a");await m.revalidate();expect(read).toHaveBeenCalledTimes(2);expect(m.getSnapshot("a")).toHaveProperty("data.visit");leave();other();
});
it("fencing an initial read for a mutation resumes missing-data reconciliation",async()=>{
 let release!:(r:DisplayResult<string>)=>void;const read=vi.fn().mockImplementationOnce(()=>new Promise(r=>{release=r;})).mockResolvedValue(success("canonical"));const m=new DisplayMemory<string>(read);m.enter("a");await flush();const finish=m.beginMutation();finish();await m.revalidate();release(success("old"));await flush();expect(m.peek("a")).toBe("canonical");expect(read).toHaveBeenCalledTimes(2);
});
it("oversized mounted data still honors freshness and Retry-After without a reusable entry",async()=>{
 let time=0;const read=vi.fn().mockResolvedValueOnce(success("oversized")).mockResolvedValue({kind:"rate-limited",retryAfterSeconds:10});const m=new DisplayMemory<string>(read,{now:()=>time,limits:{entries:1,entryBytes:1,totalBytes:1}});m.enter("a");await m.revalidate();m.setForeground(false);m.setForeground(true);await flush();expect(read).toHaveBeenCalledOnce();await m.revalidate();await m.revalidate();expect(read).toHaveBeenCalledTimes(2);expect(m.peek("a")).toBe("oversized");time=10000;await m.revalidate();expect(read).toHaveBeenCalledTimes(3);
});
