"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

const postSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export async function createPost(
  prevState: { message: string },
  formData: FormData,
) {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const validatedFields = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!validatedFields.success) {
    return {
      message: te("invalidForm"),
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
      message: t("created"),
      success: true,
      post,
    };
  } catch (error) {
    console.log(error);

    return {
      message: t("createFailed"),
      success: false,
    };
  }
}

export async function updatePost(
  prevState: { message: string },
  formData: FormData,
) {
  const t = await getTranslations("posts.actions");
  const te = await getTranslations("errors");
  const postId = formData.get("id") as string;
  const validatedFields = postSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!validatedFields.success) {
    return {
      message: te("invalidForm"),
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
      message: t("updated"),
      success: true,
    };
  } catch (error) {
    console.log(error);

    return {
      message: t("updateFailed"),
      success: false,
    };
  }
}

export async function deletePost(postId: string) {
  const t = await getTranslations("posts.actions");
  try {
    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    revalidatePath("/posts");
    return {
      message: t("deleted"),
      success: true,
    };
  } catch (error) {
    console.log(error);
    return {
      message: t("deleteFailed"),
      success: false,
    };
  }
}