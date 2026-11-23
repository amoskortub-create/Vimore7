import { Suspense } from "react";
import JoinPage from "./_client";

export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <Suspense fallback={null}>
      <JoinPage username={username} />
    </Suspense>
  );
}
