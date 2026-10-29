import "./globals.css";

export const metadata = {
  title: "Moral Mirror v2",
  description: "AI 윤리 교육 연구를 위한 인터랙티브 프로토타입",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/images/logo.png", type: "image/png" },
    ],
    shortcut: ["/images/logo.png"],
    apple: ["/images/logo.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
