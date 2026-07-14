// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>What If My Pet Was…</title>
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }

              /* Desktop: present the app as a centered phone-width column
                 instead of stretching edge-to-edge on wide monitors. */
              @media (min-width: 768px) {
                body { background: #0b0b10; }
                body > div:first-child {
                  left: 50% !important;
                  right: auto !important;
                  width: 480px;
                  max-width: 100vw;
                  transform: translateX(-50%);
                  box-shadow: 0 0 80px rgba(0, 0, 0, 0.55);
                }
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
