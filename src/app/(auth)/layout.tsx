export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <div className="display text-[36px] text-green">Chef Donn&rsquo;s</div>
        <div className="label text-muted">Opening budget · receipts · roadmap</div>
      </div>
      {children}
    </main>
  );
}
