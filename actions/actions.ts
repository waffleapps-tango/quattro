"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { redirect } from "next/navigation";

const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});

export async function createPost(
  prevState: { message: string },
  formData: FormData,
) {
  const validatedFields = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!validatedFields.success) {
    return {
      message: "Invalid form data",
      success: false,
    };
  }

  try {
    const post = await prisma.post.create({
      data: {
        ...validatedFields.data,
        slug: validatedFields.data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        published: true,
      },
    });

    revalidatePath("/posts");
    return {
      message: "Post created successfully",
      success: true,
      post,
    };
  } catch (error) {
    console.log(error);

    return {
      message: "Failed to create post",
      success: false,
    };
  }
}

export async function updatePost(
  prevState: { message: string },
  formData: FormData,
) {
  const postId = formData.get("id") as string;
  const validatedFields = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!validatedFields.success) {
    return {
      message: "Invalid form data",
      success: false,
    };
  }

  try {
    const post = await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        ...validatedFields.data,
      },
    });

    revalidatePath("/posts");
    revalidatePath(`/posts/${post.slug}`);
    return {
      message: "Post updated successfully",
      success: true,
    };
  } catch (error) {
    console.log(error);

    return {
      message: "Failed to update post",
      success: false,
    };
  }
}

export async function deletePost(id: string) {
  try {
    await prisma.post.delete({
      where: {
        id,
      },
    });

    revalidatePath("/posts");
    redirect(`/posts`);
  } catch (error) {
    console.log(error);

    return {
      message: "Failed to delete post",
      success: false,
    };
  }
}