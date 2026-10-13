import type { ReactNode } from "react";

/** A file download (CSV), not a page — so a plain <a download>, not next/link. */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="font-semibold text-green underline" href={href} download>
      {children}
    </a>
  );
}

export function ExportLinks() {
  return (
    <div className="flex flex-col gap-2">
      <DownloadLink href="/api/export/lines">Download budget lines (CSV)</DownloadLink>
      <DownloadLink href="/api/export/payments">Download payments (CSV)</DownloadLink>
    </div>
  );
}
