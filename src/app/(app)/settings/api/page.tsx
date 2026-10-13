import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { apiKey, workspace } from "@/db/schema";
import { formatDate } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { revokeApiKeyAction, rotateWebhookSecretAction } from "@/server/actions/prices";
import { env } from "@/server/env";
import { requireMember } from "@/server/viewer";
import { ActionForm, Submit } from "@/ui/form";
import { Card, Notice, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { CreateApiKeyForm } from "./create-key-form";

export const metadata: Metadata = { title: "API keys & price hook" };

export default async function ApiSettingsPage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "api_keys.manage")) redirect("/settings");
  const ws = v.principal.workspaceId;
  const [keys, [w]] = await Promise.all([
    db.select().from(apiKey).where(and(eq(apiKey.workspaceId, ws))).orderBy(desc(apiKey.createdAt)),
    db.select({ secret: workspace.webhookSecret }).from(workspace).where(eq(workspace.id, ws)),
  ]);
  const base = env.appUrl.replace(/\/$/, "");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="API keys & price hook" back={{ href: "/settings", label: "More" }} subtitle="Let a script or an agent trigger price searches. Results never change the budget by themselves." />
      {!env.anthropicApiKey && env.priceProvider !== "fake" && (
        <Notice tone="warning" title="Price search is off">
          Set ANTHROPIC_API_KEY on the server to turn on Claude web search. Searches queued now will fail with that reason.
        </Notice>
      )}
      <Card>
        <SectionTitle>Trigger a search</SectionTitle>
        <pre className="num overflow-x-auto rounded-md bg-ink p-3 text-[13px] leading-relaxed text-cream">{`curl -X POST ${base}/api/prices/search \\
  -H "Authorization: Bearer cdk_…" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "2-door commercial chiller",
       "context": {"quantity": 1},
       "callbackUrl": "https://example.com/hooks/prices"}'`}</pre>
        <p className="mt-2 text-[14px] text-muted">
          Returns <span className="num">202</span> with an id. Poll <span className="num">GET /api/prices/search/:id</span>, or receive a signed POST at your callback when it&rsquo;s done. Full reference:{" "}
          <span className="num">docs/api.md</span> in the repository.
        </p>
      </Card>

      <Card>
        <SectionTitle>Keys</SectionTitle>
        {keys.length === 0 ? (
          <p className="text-muted">No keys yet.</p>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{k.name}</span>
                  <span className="num text-[13px] text-muted">
                    {k.prefix}… · {k.scopes.join(", ")} · {k.lastUsedAt ? `used ${formatDate(k.lastUsedAt.toISOString().slice(0, 10))}` : "never used"}
                  </span>
                </span>
                {k.revokedAt ? (
                  <StatusBadge tone="rejected" label="Revoked" />
                ) : (
                  <ActionForm action={revokeApiKeyAction} className="!gap-1">
                    <input type="hidden" name="keyId" value={k.id} />
                    <Submit variant="ghost" block={false}>
                      Revoke
                    </Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <CreateApiKeyForm />
        </div>
      </Card>

      <Card>
        <SectionTitle>Callback signing secret</SectionTitle>
        <p className="mb-2 text-[14px] text-muted">
          Callbacks carry <span className="num">X-ChefDonn-Signature: sha256=…</span>, an HMAC of the raw body with this secret. Check it before trusting a callback.
        </p>
        <details>
          <summary className="label cursor-pointer text-green">Show secret</summary>
          <code className="num mt-2 block break-all rounded-md bg-wash p-2 text-[13px]">{w?.secret}</code>
        </details>
        <ActionForm action={rotateWebhookSecretAction} className="mt-3">
          <Submit variant="secondary">Rotate secret</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
