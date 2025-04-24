"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPost(
  prevState: { message: string },
  formData: FormData,
) {
  try {
    const title = formData.get("title");
    const content = formData.get("content");

    if (!title || !content) {
      return { message: "Title and content are required" };
    }

    const post = await prisma.post.create({
      data: {
        title: title.toString(),
        slug: title.toString().toLowerCase().replace(/\s+/g, "-").toLowerCase(),
        content: content.toString(),
      },
    });
    revalidatePath("/posts");

    return {
      message: "Post created successfully",
      success: true,
      post,
    };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Failed to create post" };
  }
}