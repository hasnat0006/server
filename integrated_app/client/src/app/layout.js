import { IBM_Plex_Mono, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata = {
  title: "Document Verification Console",
  description: "Next.js UI for blockchain and XAI document verification",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
