import { afterEach, expect, it, vi } from "vitest";
import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileAuthState } from "../auth/state-machine";
import { bindDisplayMemory } from "./display-memory-lifecycle";
import { DisplayMemory } from "./display-memory";
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const doc=Object.assign(new EventTarget(),{visibilityState:"visible"}),win=new EventTarget(),nav={onLine:true};vi.stubGlobal("document",doc);vi.stubGlobal("window",win);vi.stubGlobal("navigator",nav);
 let publish!:(s:MobileAuthState)=>void,native!:(active:boolean)=>void,state:MobileAuthState={kind:"authenticated",userId:"a"};
 const unsubscribe=vi.fn(),remove=vi.fn(async()=>undefined),check=vi.fn(async()=>({ok:true as const}));
 const auth={getState:()=>state,refreshIfNeeded:check,refresh:check,subscribe:(f:typeof publish)=>{publish=f;f(state);return unsubscribe;}} as unknown as MobileAuthController;
 const read=vi.fn(async()=>({kind:"success" as const,data:"owned"}));const memory=new DisplayMemory(read);
 const stop=bindDisplayMemory([memory],auth,"a",async callback=>{native=callback;return{remove};});
 return{memory,read,stop,unsubscribe,remove,check,doc,win,nav,native:(a:boolean)=>native(a),publish:(s:MobileAuthState)=>{state=s;publish(s);}};
}
it("normal token refresh and same-owner confirmation retain fresh display without GET",async()=>{
 const f=fixture();f.memory.enter("key");await f.memory.revalidate();f.publish({kind:"refreshing"});expect(f.memory.peek("key")).toBe("owned");await f.memory.revalidate();f.publish({kind:"authenticated",userId:"a"});await flush();expect(f.read).toHaveBeenCalledOnce();f.stop();
});
it("short background checks existing auth once, preserves metadata, and deduplicates native/visibility events",async()=>{
 const f=fixture();f.memory.enter("key");await f.memory.revalidate();f.native(false);expect(f.memory.peek("key")).toBe("owned");f.doc.visibilityState="hidden";f.doc.dispatchEvent(new Event("visibilitychange"));f.native(true);await flush();expect(f.check).not.toHaveBeenCalled();f.doc.visibilityState="visible";f.doc.dispatchEvent(new Event("visibilitychange"));await flush();expect(f.check).toHaveBeenCalledOnce();expect(f.read).toHaveBeenCalledOnce();f.stop();expect(f.unsubscribe).toHaveBeenCalledOnce();expect(f.remove).toHaveBeenCalledOnce();
});
it.each([{kind:"signing_out" as const},{kind:"authenticated" as const,userId:"b"},{kind:"expired" as const,reasonCode:"auth_session_expired" as const}])("%j revokes immediately and same-owner login cannot recover old instance",async state=>{
 const f=fixture();f.memory.enter("key");await f.memory.revalidate();f.publish(state);f.publish({kind:"authenticated",userId:"a"});expect(f.memory.getSnapshot("key").kind).toBe("loading");expect(f.memory.inspect().entries).toBe(0);await f.memory.revalidate();expect(f.read).toHaveBeenCalledOnce();f.stop();
});
it("offline fresh data survives; reconnect does not refresh unrelated fresh metadata",async()=>{const f=fixture();f.memory.enter("key");await f.memory.revalidate();f.nav.onLine=false;f.win.dispatchEvent(new Event("offline"));expect(f.memory.peek("key")).toBe("owned");f.nav.onLine=true;f.win.dispatchEvent(new Event("online"));await flush();expect(f.read).toHaveBeenCalledOnce();f.stop();});
it("a failed resume auth check cannot enable reads and can recover on connectivity",async()=>{
 const f=fixture();f.memory.enter("key");await f.memory.revalidate();f.native(false);f.check.mockRejectedValueOnce(Error("temporary"));f.native(true);await flush();f.memory.markDirty();await f.memory.revalidate();expect(f.read).toHaveBeenCalledOnce();f.win.dispatchEvent(new Event("online"));await flush();expect(f.check).toHaveBeenCalledTimes(2);expect(f.read).toHaveBeenCalledTimes(2);f.stop();
});
