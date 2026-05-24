"use client";

import { useRef, useState } from "react";
import { CreateScriptForm, type ScriptFormDraftCopy, type ScriptFormInitialValues } from "@/components/scripts/create-script-form";
import { ScriptStudioEntryModes, type ScriptStudioEntryMode } from "@/components/scripts/script-studio-entry-modes";
import { ScriptStudioMockPanel, type ScriptStudioDraftCopyInput } from "@/components/scripts/script-studio-mock-panel";
import type { ScriptStudioTemplate } from "@/lib/script-studio/templates";

type NewScriptWorkspaceProps = {
  initialValues?: ScriptFormInitialValues;
  sourceTitle?: string | null;
};

export function NewScriptWorkspace({ initialValues, sourceTitle = null }: NewScriptWorkspaceProps) {
  const [draftCopy, setDraftCopy] = useState<ScriptFormDraftCopy | null>(null);
  const [entryMode, setEntryMode] = useState<ScriptStudioEntryMode | null>(initialValues ? "freewriting" : null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);

  function scrollFormIntoView() {
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function handleCopyDraft(input: ScriptStudioDraftCopyInput) {
    setDraftCopy({
      id: Date.now(),
      title: input.title,
      content: input.content,
      targetSeconds: input.targetSeconds,
      locale: "en-US",
      sourceLabel: "Script Studio draft"
    });
    setEntryMode("freewriting");
    scrollFormIntoView();
  }

  function handleUseTemplate(template: ScriptStudioTemplate) {
    setDraftCopy({
      id: Date.now(),
      title: template.title,
      content: template.content,
      targetSeconds: template.targetSeconds,
      locale: "en-US",
      sourceLabel: "テンプレ"
    });
    setEntryMode("freewriting");
    scrollFormIntoView();
  }

  return (
    <>
      <div className="mt-8">
        <ScriptStudioEntryModes activeMode={entryMode} onModeChange={setEntryMode} onUseTemplate={handleUseTemplate} />
      </div>
      {entryMode === "ai" ? (
        <div className="mt-8">
          <ScriptStudioMockPanel onCopyDraft={handleCopyDraft} />
        </div>
      ) : null}
      {entryMode === "freewriting" || draftCopy || initialValues ? (
        <div ref={formSectionRef} className="mt-8 scroll-mt-6">
          <CreateScriptForm initialValues={initialValues} sourceTitle={sourceTitle} draftCopy={draftCopy} />
        </div>
      ) : (
        <div ref={formSectionRef} />
      )}
    </>
  );
}
