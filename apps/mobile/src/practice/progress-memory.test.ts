import { expect, it, vi } from "vitest";
import { ProgressMemory } from "./progress-memory";
import type { MobileProgress } from "../lib/api";
const data:MobileProgress={scripts:[],totalScripts:0,totalReviewedTakes:0,bestTakeCount:0};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
it("Home/Progress/My Takes share one payload and one initial request",async()=>{
 const read=vi.fn(async()=>({kind:"success" as const,progress:data}));const m=new ProgressMemory(read);let leave=m.enter();await m.revalidate();for(let i=0;i<5;i++){leave();leave=m.enter();await flush();const state=m.getSnapshot();expect(state.kind==="ready"&&state.progress).toBe(data);}expect(read).toHaveBeenCalledOnce();expect(m.memory.inspect().entries).toBe(1);leave();
});
it("five-minute re-entry refreshes in background and preserves counts",async()=>{let time=0;const read=vi.fn(async()=>({kind:"success" as const,progress:data}));const m=new ProgressMemory(read,()=>time);const leave=m.enter();await m.revalidate();leave();time=300_000;m.enter();expect(m.getSnapshot()).toMatchObject({kind:"ready",progress:data,refreshing:true});await m.revalidate();expect(read).toHaveBeenCalledTimes(2);});
it("temporary error does not become an empty collection or automatic route retry",async()=>{const read=vi.fn().mockResolvedValueOnce({kind:"success",progress:{...data,totalReviewedTakes:7}}).mockResolvedValue({kind:"timeout"});const m=new ProgressMemory(read);const leave=m.enter();await m.revalidate();await m.revalidate();expect(m.getSnapshot()).toMatchObject({kind:"ready",progress:{totalReviewedTakes:7},updateError:{kind:"timeout"}});leave();m.enter();await flush();expect(read).toHaveBeenCalledTimes(2);});
it("confirmed unavailability clears previously shown aggregate and old async data",async()=>{const read=vi.fn().mockResolvedValueOnce({kind:"success",progress:data}).mockResolvedValue({kind:"forbidden",reasonCode:"owner"});const m=new ProgressMemory(read);m.enter();await m.revalidate();await m.revalidate();expect(m.getSnapshot().kind).toBe("error");m.revoke();expect(m.memory.inspect().entries).toBe(0);});
