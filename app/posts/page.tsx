import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import prisma from "@/lib/prisma";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { FadeIn } from "@/components/motion/FadeIn";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("posts") };
}

export default async function PostsPage() {
  const t = await getTranslations("posts");
  const format = await getFormatter();
  const posts = await prisma.post.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  const postCount = await prisma.post.count()

  return (
    <div className="container mx-auto py-8">
      <FadeIn className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("heading", { count: postCount })}</h1>
        <CreatePostForm />
      </FadeIn>

      {/*<div className="mb-6">*/}
      {/*  <div className="relative">*/}
      {/*    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />*/}
      {/*    <Input*/}
      {/*      placeholder="Search posts..."*/}
      {/*      value={searchQuery}*/}
      {/*      onChange={(e) => setSearchQuery(e.target.value)}*/}
      {/*      className="pl-8"*/}
      {/*    />*/}
      {/*  </div>*/}
      {/*</div>*/}

      {posts.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title={t("empty")}
          description={t("emptyHint")}
        />
      )}
      <div className="grid gap-4">
        {posts.map((post) => (
          <Link key={post.id} href={`/posts/${post.slug}`}>
            <Card className="hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle>{post.title}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(post.createdAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2">{post.content}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
} 