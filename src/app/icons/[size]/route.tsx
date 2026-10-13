/** App icons, drawn at request time (no binary assets in the repo): cream "CD" on brand green. */
import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "180" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = [180, 192, 512].includes(Number(size)) ? Number(size) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f4d3a",
          color: "#f4f1ea",
          fontSize: px * 0.42,
          fontWeight: 900,
          letterSpacing: -px * 0.01,
          borderBottom: `${Math.round(px * 0.06)}px solid #d9a441`,
        }}
      >
        CD
      </div>
    ),
    { width: px, height: px },
  );
}
