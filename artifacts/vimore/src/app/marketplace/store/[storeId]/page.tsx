import { Suspense } from "react";
import ClientPage from "./_client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientPage />
    </Suspense>
  );
}
