import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { EditPostForm } from "@/components/posts/EditPostForm";
import { DeletePostButton } from "@/components/posts/DeletePostButton";

type PostPageParams = {
  params: Promise<{
    slug: string;
  }>;
}


export async function generateMetadata({ params }: PostPageParams): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("meta");
  const post = await prisma.post.findUnique({ where: { slug }, select: { title: true } });
  return { title: post?.title ?? t("postNotFound") };
}

export default async function PostPage({ params }: PostPageParams) {
  const { slug } = await params;
  const t = await getTranslations("posts");
  const format = await getFormatter();
  const post = await prisma.post.findUnique({
    where: { slug },
  });

  if (!post) notFound();

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/posts">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{ post.title }</CardTitle>
              <div className="text-sm text-muted-foreground mt-2">
                {format.dateTime(new Date(post.createdAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
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