"use server";

import prisma from "@/lib/prisma";

export async function createPost( formData: FormData) {
  const title = formData.get("title");
  const content = formData.get("content");

  if (!title || !content) {
    throw new Error("Title and content are required");
  }

  const post = await prisma.post.create({
    data: {
      title: title.toString(),
      slug: title.toString().toLowerCase().replace(/\s+/g, "-").toLowerCase(),
      content: content.toString(),
    },
  });

  return post;
}