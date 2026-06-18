import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

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
          background:
            "linear-gradient(180deg, #0b1623 0%, #051019 48%, #190712 100%)",
          color: "white",
          padding: "40px",
          borderRadius: "96px",
          border: "8px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            fontSize: 34,
            letterSpacing: "0.18em",
            color: "#7dd3fc",
            textTransform: "uppercase",
          }}
        >
          Villa App
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02 }}>
            Love Island
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.02 }}>
            Fantasy
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "#f9a8d4",
              }}
            >
              League
            </div>
            <div style={{ fontSize: 64 }}>💛</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
