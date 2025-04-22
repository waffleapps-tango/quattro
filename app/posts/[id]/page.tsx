"use client";

import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ArrowLeft, Edit, Trash } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// Mock data - replace with actual data fetching
const mockPosts = [
  {
    id: "1",
    title: "Welcome to Quattro",
    content: "This is the first post in our community. Feel free to introduce yourself!",
    author: "Admin",
    createdAt: new Date().toISOString(),
  },
];

export default function PostPage() {
  const { id } = useParams();
  const { user } = useUser();
  const post = mockPosts.find((p) => p.id === id);

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

  const isAuthor = user?.fullName === post.author;

  const handleEdit = () => {
    // TODO: Implement edit functionality
    toast.info("Edit functionality coming soon!");
  };

  const handleDelete = () => {
    // TODO: Implement delete functionality
    toast.info("Delete functionality coming soon!");
  };

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
              <CardTitle>{post.title}</CardTitle>
              <div className="text-sm text-muted-foreground mt-2">
                By {post.author} • {format(new Date(post.createdAt), "PPP")}
              </div>
            </div>
            {isAuthor && (
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={handleEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleDelete}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            )}
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