import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ViewTracker from "./view-tracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.mozelle.top"),
  title: {
    default: "Mozelle Archive｜电子、超频与二次元 / Electronics, Overclocking & ACG",
    template: "%s｜Mozelle Archive",
  },
  description:
    "电子专业学生的双语个人博客，记录硬件、超频、游戏、Cosplay 与二次元世界。 A bilingual archive of electronics, overclocking, games, cosplay, and ACG culture.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    alternateLocale: ["en_US"],
    url: "/",
    siteName: "Mozelle Archive",
    title: "Mozelle Archive｜电子、超频与二次元 / Electronics, Overclocking & ACG",
    description:
      "电子专业学生的双语个人博客，记录硬件、超频、游戏、Cosplay 与二次元世界。 A bilingual archive of electronics, overclocking, games, cosplay, and ACG culture.",
  },
  twitter: {
    card: "summary",
    title: "Mozelle Archive｜电子、超频与二次元 / Electronics, Overclocking & ACG",
    description:
      "电子专业学生的双语个人博客，记录硬件、超频、游戏、Cosplay 与二次元世界。 A bilingual archive of electronics, overclocking, games, cosplay, and ACG culture.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="day" data-language="zh" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ViewTracker />
        {children}
      </body>
    </html>
  );
}
