import { Suspense } from "react";
import UserProfilePage from "./_client";

export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <Suspense fallback={null}>
      <UserProfilePage username={username} />
    </Suspense>
  );
}
