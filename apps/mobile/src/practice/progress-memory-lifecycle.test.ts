import { expect, it, vi } from "vitest";
import { bindProgressMemory } from "./progress-memory-lifecycle";
import { ProgressMemory } from "./progress-memory";
import type { MobileAuthController } from "../auth/mobile-auth";
it("legacy binding delegates to the same session continuity policy",async()=>{
 vi.stubGlobal("document",Object.assign(new EventTarget(),{visibilityState:"visible"}));vi.stubGlobal("window",new EventTarget());vi.stubGlobal("navigator",{onLine:true});
 const auth={subscribe:(f:(s:unknown)=>void)=>{f({kind:"authenticated",userId:"owner"});return()=>undefined;}} as unknown as MobileAuthController;
 const read=vi.fn(async()=>({kind:"success" as const,progress:{scripts:[],totalScripts:0,totalReviewedTakes:0,bestTakeCount:0}}));const m=new ProgressMemory(read);const stop=bindProgressMemory(m,auth,"owner",async()=>({remove:async()=>undefined}));m.enter();await m.revalidate();stop();expect(m.getSnapshot().kind).toBe("ready");vi.unstubAllGlobals();
});
