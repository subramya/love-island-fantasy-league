import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background:
            "linear-gradient(180deg, #0f172a 0%, #0b1120 52%, #17040f 100%)",
          color: "white",
          borderRadius: "44px",
          border: "4px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: "0.18em", color: "#7dd3fc" }}>LI</div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05, textAlign: "center" }}>
          Fantasy
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.05, textAlign: "center" }}>
          League
        </div>
        <div style={{ marginTop: 8, fontSize: 28 }}>💛</div>
      </div>
    ),
    size
  );
}
