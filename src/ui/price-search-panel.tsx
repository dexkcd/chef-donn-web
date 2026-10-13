/**
 * "Look up prices" on a task or budget line. Results are labelled "Found online — confirm"
 * and Unverified; nothing changes the budget until a person taps "Use ₱X as estimate".
 */
import { db } from "@/db/client";
import { formatDate } from "@/domain/dates";
import { formatPeso } from "@/domain/money";
import { estimateFromPrices } from "@/domain/prices";
import { applyPriceAction, startPriceSearchAction } from "@/server/actions/prices";
import { loadCategories } from "@/server/services/budget-data";
import { getPriceSearch, listPriceSearches } from "@/server/services/prices";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit, TextField } from "./form";
import { Card, Notice, SectionTitle, StatusBadge } from "./kit";
import { PollRefresh } from "./poll-refresh";

const KIND = { listed: "Listed price", quoted: "Quoted", delivered: "Delivered price" } as const;
const DELIVERY = { yes: "incl. delivery to Palawan", no: "delivery to Palawan extra", unknown: "delivery not stated" } as const;

export async function PriceSearchPanel({
  subject,
  defaultQuery,
  canApply,
  needsCategory,
}: {
  subject: { type: "task" | "money_line"; id: string };
  defaultQuery: string;
  canApply: boolean;
  needsCategory?: boolean;
}) {
  const v = await requireMember();
  const ws = v.principal.workspaceId;
  const recent = await listPriceSearches(db, ws, subject, 3);
  const latest = recent[0] ? await getPriceSearch(db, ws, recent[0].id) : null;
  const running = latest && (latest.search.status === "queued" || latest.search.status === "running");
  const cats = needsCategory ? (await loadCategories(db, ws)).filter((c) => c.kind !== "contingency" && !c.archivedAt) : [];

  return (
    <Card>
      <SectionTitle>Look up prices online</SectionTitle>
      <p className="mb-3 text-[15px] text-muted">Searches Philippine sellers for current prices, with links. You decide what to use.</p>

      {running && (
        <>
          <PollRefresh />
          <Notice tone="info" title="▲ Searching…">
            Looking up “{latest.search.query}”. This usually takes a minute or two — you can leave this page.
          </Notice>
        </>
      )}

      {latest?.search.status === "failed" && <Notice tone="danger" title="That search didn't work">{latest.search.error}</Notice>}

      {latest?.search.status === "done" && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="found_online" />
            <StatusBadge tone="unverified" />
            <span className="text-[14px] text-muted">“{latest.search.query}” · {formatDate(latest.search.createdAt.toISOString().slice(0, 10))}</span>
          </div>
          {latest.search.summary ? (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-md border-[1.5px] border-line p-3 text-center">
                <div>
                  <div className="label text-[12px] text-muted">Low</div>
                  <div className="num font-semibold">{formatPeso(latest.search.summary.low, { noCentavos: true })}</div>
                </div>
                <div>
                  <div className="label text-[12px] text-muted">Typical</div>
                  <div className="num text-[18px] font-semibold">{formatPeso(latest.search.summary.typical, { noCentavos: true })}</div>
                </div>
                <div>
                  <div className="label text-[12px] text-muted">High</div>
                  <div className="num font-semibold">{formatPeso(latest.search.summary.high, { noCentavos: true })}</div>
                </div>
              </div>
              <p className="text-[13px] text-muted">
                From {latest.search.summary.used} of {latest.search.summary.count} prices
                {latest.search.summary.basis === "delivered" ? ", using prices that already include delivery to Palawan" : ""}
                {latest.search.summary.outliersDropped > 0 ? `; ${latest.search.summary.outliersDropped} far-off price${latest.search.summary.outliersDropped === 1 ? "" : "s"} left out` : ""}.
              </p>
            </>
          ) : (
            <Notice tone="warning" title="No prices with a real source were found">
              {latest.search.error ?? "Try different words, or ask a local supplier for a quote."}
            </Notice>
          )}
          <ul className="divide-y-[1.5px] divide-line">
            {latest.observations.map((o) => (
              <li key={o.id} className="py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{o.vendor ?? "Seller not named"}</div>
                    <div className="text-[14px] text-muted">
                      {KIND[o.priceKind]} · {DELIVERY[o.includesDeliveryToPalawan]}
                      {o.sellerLocation ? ` · ${o.sellerLocation}` : ""}
                    </div>
                    <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-[14px] font-semibold text-green underline">
                      {o.sourceTitle ?? new URL(o.sourceUrl).hostname} ↗
                    </a>
                  </div>
                  <span className="num shrink-0 font-semibold">
                    {formatPeso(o.unitPriceCents, { noCentavos: true })}
                    {o.unit ? <span className="block text-right text-[12px] font-normal text-muted">per {o.unit}</span> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {canApply && latest.search.summary && (
            <ActionForm action={applyPriceAction}>
              <input type="hidden" name="priceSearchId" value={latest.search.id} />
              <MoneyField
                name="estimate"
                label="Use as estimate"
                defaultCents={estimateFromPrices(latest.search.summary)}
                hint="Typical price × quantity, rounded. Add delivery and installation if they aren't included."
              />
              {needsCategory && (
                <SelectField name="categoryKey" label="Budget category" defaultValue="">
                  <option value="" disabled>
                    Pick a category
                  </option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              )}
              <Submit>Use this as the estimate</Submit>
            </ActionForm>
          )}
        </div>
      )}

      {!running && (
        <ActionForm action={startPriceSearchAction}>
          <input type="hidden" name="subjectType" value={subject.type} />
          <input type="hidden" name="subjectId" value={subject.id} />
          <TextField name="query" label="What to price" defaultValue={latest?.search.query ?? defaultQuery} />
          <TextField name="quantity" label="How many (optional)" type="number" inputMode="numeric" min={1} />
          <Submit variant="secondary" pendingLabel="Starting search…">
            {latest ? "Search again" : "Look up prices"}
          </Submit>
        </ActionForm>
      )}
    </Card>
  );
}
