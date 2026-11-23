import { Suspense } from "react";
import PostDetailPage from "./_client";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PostDetailPage id={id} />
    </Suspense>
  );
}
