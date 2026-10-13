"use client";

import { useActionState, useState } from "react";
import { createApiKeyAction, type ApiKeyFormState } from "@/server/actions/prices";
import { Button, Notice } from "@/ui/kit";

/** Creates a key and shows it exactly once, with a copy button. */
export function CreateApiKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyFormState, FormData>(createApiKeyAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.reason && !state.ok && <Notice tone="danger" title={state.reason} />}
      {state.secret && (
        <Notice tone="success" title="Copy this key now — it won't be shown again.">
          <code className="num mt-2 block break-all rounded-md bg-surface p-2 text-[13px]" data-testid="new-api-key">
            {state.secret}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => void navigator.clipboard?.writeText(state.secret!).then(() => setCopied(true))}
          >
            {copied ? "✓ Copied" : "Copy"}
          </Button>
        </Notice>
      )}
      <label className="flex flex-col gap-1">
        <span className="label text-[14px] text-ink-2">Name</span>
        <input name="name" placeholder="e.g. n8n price refresh" className="min-h-[56px] rounded-md border-[1.5px] border-ink bg-surface px-3 text-[18px]" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1 text-[14px] text-ink-2">Can</legend>
        <label className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" name="scopes" value="prices:search" defaultChecked className="size-5 accent-[#0f4d3a]" /> Trigger price searches
        </label>
        <label className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" name="scopes" value="prices:read" defaultChecked className="size-5 accent-[#0f4d3a]" /> Read results
        </label>
      </fieldset>
      <Button type="submit" disabled={pending} block>
        {pending ? "Creating…" : "Create API key"}
      </Button>
    </form>
  );
}
