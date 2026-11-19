import TabBar from "@/components/TabBar";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="app">{children}</main>
      <TabBar />
    </>
  );
}
