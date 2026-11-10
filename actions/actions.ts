"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { Role } from "@/lib/generated/prisma";

// Posts are global (no communityId), so any manager/admin may write; everyone else is refused.
async function canWritePosts() {
  const user = await getCurrentUser();
  return !!user?.memberships.some((m) => m.role === Role.MANAGER || m.role === Role.ADMIN);
}

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
  if (!(await canWritePosts())) return { message: te("notSignedIn"), success: false };
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
        slug: `${validatedFields.data.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`.replace(/^-/, ""),
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
  if (!(await canWritePosts())) return { message: t("deleteFailed"), success: false };
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