import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

function MiniBar({
  height,
  fill,
  heartColor,
}: {
  height: number;
  fill: string;
  heartColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 5,
      }}
    >
      <div style={{ fontSize: 15, lineHeight: 1, color: heartColor }}>♥</div>
      <div
        style={{
          width: 20,
          height,
          borderRadius: 8,
          background: fill,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      />
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "15px 12px 14px",
          background:
            "radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 38%), linear-gradient(180deg, #05060a 0%, #090b12 58%, #12050c 100%)",
          color: "white",
          borderRadius: "44px",
          border: "4px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            flex: 1,
          }}
        >
          <MiniBar height={34} fill="linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%)" heartColor="#7dd3fc" />
          <MiniBar height={48} fill="linear-gradient(180deg, #f472b6 0%, #ec4899 100%)" heartColor="#f9a8d4" />
          <MiniBar height={60} fill="linear-gradient(180deg, #fde68a 0%, #facc15 100%)" heartColor="#fef08a" />
          <MiniBar height={42} fill="linear-gradient(180deg, #34d399 0%, #10b981 100%)" heartColor="#86efac" />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            lineHeight: 1,
            gap: 3,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>Love Island</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f4f5" }}>Fantasy</div>
        </div>
      </div>
    ),
    size
  );
}
