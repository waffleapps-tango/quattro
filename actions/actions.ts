"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { z } from "zod";

const postSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść jest wymagana"),
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
      message: "Nieprawidłowe dane formularza",
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
      message: "Post dodany",
      success: true,
      post,
    };
  } catch (error) {
    console.log(error);

    return {
      message: "Nie udało się dodać posta",
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
      message: "Nieprawidłowe dane formularza",
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
      message: "Post zaktualizowany",
      success: true,
    };
  } catch (error) {
    console.log(error);

    return {
      message: "Nie udało się zaktualizować posta",
      success: false,
    };
  }
}

export async function deletePost(postId: string) {
  try {
    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    revalidatePath("/posts");
    return {
      message: "Post usunięty",
      success: true,
    };
  } catch (error) {
    console.log(error);
    return {
      message: "Nie udało się usunąć posta",
      success: false,
    };
  }
}