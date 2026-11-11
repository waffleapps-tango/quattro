"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { canWritePosts } from "@/domain/posts";
import { slugify } from "@/lib/text";

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
  if (!canWritePosts(await getCurrentUser())) return { message: te("forbidden"), success: false };
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
        // Suffix keeps slugs unique and non-empty (e.g. titles with only Polish letters).
        slug: [slugify(validatedFields.data.title), Date.now().toString(36)].filter(Boolean).join("-"),
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
    console.error(error);

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
  if (!canWritePosts(await getCurrentUser())) return { message: te("forbidden"), success: false };
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
    console.error(error);

    return {
      message: t("updateFailed"),
      success: false,
    };
  }
}

export async function deletePost(postId: string) {
  const t = await getTranslations("posts.actions");
  if (!canWritePosts(await getCurrentUser())) {
    return { message: (await getTranslations("errors"))("forbidden"), success: false };
  }
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
    console.error(error);
    return {
      message: t("deleteFailed"),
      success: false,
    };
  }
}