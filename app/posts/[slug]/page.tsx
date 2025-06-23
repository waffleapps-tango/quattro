import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { EditPostForm } from "@/components/posts/EditPostForm";
import { DeletePostButton } from "@/components/posts/DeletePostButton";

type PostPageParams = {
  params: Promise<{
    slug: string;
  }>;
}


export default async function PostPage({ params }: PostPageParams) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({
    where: { slug },
  });

  if (!post) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <h1 className="text-2xl font-bold">Post not found</h1>
          <Link href="/posts">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Posts
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/posts">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Posts
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{ post.title }</CardTitle>
              <div className="text-sm text-muted-foreground mt-2">
                By post.author • { format( new Date( post.createdAt ), "PPP" ) }
              </div>
              <div className="flex gap-2">
                <EditPostForm post={ post }/>
                <DeletePostButton postId={ post.id }/>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            <p>{post.content}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 