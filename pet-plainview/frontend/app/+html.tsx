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
        <meta name="description" content="Upload a photo of your pet and see who they'd be in another life — a detective, a Renaissance masterpiece, even a human. First portraits are free." />
        <meta property="og:title" content="What If My Pet Was…" />
        <meta property="og:description" content="Turn your pet into a detective, a Renaissance masterpiece, or the human they were always meant to be. First portraits free." />
        <meta property="og:image" content="https://pets.plainviewit.online/og-image.jpg" />
        <meta property="og:url" content="https://pets.plainviewit.online" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="What If My Pet Was…" />
        <meta name="twitter:description" content="Turn your pet into a detective, a masterpiece, or the human they were always meant to be." />
        <meta name="twitter:image" content="https://pets.plainviewit.online/og-image.jpg" />
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
