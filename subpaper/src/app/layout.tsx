export const metadata = { title: "SubPaper", description: "Subcontractor paperwork, checked." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f8", color: "#111" }}>
        {children}
      </body>
    </html>
  );
}
