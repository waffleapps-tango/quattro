import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";



export default async function PostsPage() {
  const posts = await prisma.post.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  const postCount = await prisma.post.count()


  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Community Posts ({postCount})</h1>

        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Post
        </Button>
      </div>

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

      <div className="grid gap-4">
        {posts.map((post) => (
          <Link key={post.id} href={`/posts/${post.slug}`}>
            <Card className="hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle>{post.title}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  By post.author • {format(new Date(post.createdAt), "PPP")}
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