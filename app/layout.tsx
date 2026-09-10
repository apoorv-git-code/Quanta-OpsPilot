import "./globals.css";

export const metadata = {
  title: "OpsPilot Health Kernel",
  description: "Hospital Operations Command Centre",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 p-0 overflow-hidden">{children}</body>
    </html>
  );
}
