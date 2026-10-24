import type { Metadata } from "next";

import { DashboardView } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard · Stream Watch AI",
};

export default async function DashboardPage(props: PageProps<"/dashboard/[id]">) {
  const { id } = await props.params;
  const { created } = await props.searchParams;
  return <DashboardView id={id} justCreated={created === "1"} />;
}
