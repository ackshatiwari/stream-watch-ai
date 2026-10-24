import type { Metadata } from "next";

import { Builder } from "./Builder";

export const metadata: Metadata = {
  title: "Create a dashboard · Stream Watch AI",
};

export default async function CreatePage(props: PageProps<"/create">) {
  const { edit, prompt } = await props.searchParams;
  return (
    <Builder
      editId={typeof edit === "string" ? edit : null}
      initialPrompt={typeof prompt === "string" ? prompt.slice(0, 1000) : ""}
    />
  );
}
