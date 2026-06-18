import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

function Bar({
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
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: 48,
          lineHeight: 1,
          color: heartColor,
          textShadow: "0 6px 18px rgba(0,0,0,0.28)",
        }}
      >
        ♥
      </div>
      <div
        style={{
          width: 78,
          height,
          borderRadius: 28,
          background: fill,
          boxShadow: "0 14px 24px rgba(0,0,0,0.22)",
          border: "2px solid rgba(255,255,255,0.12)",
        }}
      />
    </div>
  );
}

export default function Icon() {
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
          padding: "40px 36px 34px",
          background:
            "radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 38%), linear-gradient(180deg, #05060a 0%, #090b12 58%, #12050c 100%)",
          color: "white",
          borderRadius: "96px",
          border: "8px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "center",
            fontSize: 26,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#d4d4d8",
          }}
        >
          Love Island League
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 28,
            width: "100%",
            flex: 1,
          }}
        >
          <Bar height={138} fill="linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%)" heartColor="#7dd3fc" />
          <Bar height={190} fill="linear-gradient(180deg, #f472b6 0%, #ec4899 100%)" heartColor="#f9a8d4" />
          <Bar height={238} fill="linear-gradient(180deg, #fde68a 0%, #facc15 100%)" heartColor="#fef08a" />
          <Bar height={170} fill="linear-gradient(180deg, #34d399 0%, #10b981 100%)" heartColor="#86efac" />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Love Island
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1,
              color: "#f4f4f5",
              letterSpacing: "-0.03em",
            }}
          >
            Fantasy
          </div>
        </div>
      </div>
    ),
    size
  );
}
