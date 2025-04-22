import { Button } from "@/components/ui/button";
import prisma from "@/lib/prisma";

export default async function Home() {
  const posts = await prisma.post.findMany();

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <Button>Click me</Button>

      {posts.map((post) => (
        <div key={post.id} className="text-center">
          <h2 className="text-2xl font-bold">{post.title}</h2>
          <p className="text-lg text-gray-600">{post.content}</p>
          <p className="text-sm text-gray-400">{post.createdAt.toString()}</p>
        </div>
      ))}
    </div>
  );
}
