import { v } from "convex/values";
import { map } from "modern-async";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { embedTexts } from "./ingest/embed";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const OPENAI_MODEL = "gpt-3.5-turbo";

export const answer = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const messages = await ctx.runQuery(internal.serve.getMessages, {
      sessionId,
    });
    const lastUserMessage = messages.at(-1)!.text;

    const [embedding] = await embedTexts([lastUserMessage]);

    const searchResults = await ctx.vectorSearch("embeddings", "byEmbedding", {
      vector: embedding,
      limit: 8,
    });

    const relevantDocuments = await ctx.runQuery(internal.serve.getChunks, {
      embeddingIds: searchResults.map(({ _id }) => _id),
    });

    const messageId = await ctx.runMutation(internal.serve.addBotMessage, {
      sessionId,
    });

    try {
      const openai = new OpenAI();
      const stream = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              `You are an oracle, with deep knowledge about the lore and history
              of the world of Kiln. You are answering questions from a group of 
              adventurers as they explore the world. The adventurers are on a
              quest to find the Chest of the Volithary, a powerful artifact that
              has been lost for centuries. The provided documents contain the
              only information that the adventurers have about the world and it's history. Answer the adventurers' questions using the information provided in the documents. You are an old, wise,
              and misterious oracle. You answer their questions based on
              the information in the documents, but sometimes you are a
              little vague, you are an oracle.\n\n`
          },
          ...(relevantDocuments.map(({ text }) => ({
            role: "system",
            content: "Relevant document:\n\n" + text,
          })) as ChatCompletionMessageParam[]),
          ...(messages.map(({ isViewer, text }) => ({
            role: isViewer ? "user" : "assistant",
            content: text,
          })) as ChatCompletionMessageParam[]),
        ],
      });
      let text = "";
      for await (const { choices } of stream) {
        const chunk = choices[0].delta.content;
        if (typeof chunk === "string" && chunk.length > 0) {
          text += choices[0].delta.content;
          await ctx.runMutation(internal.serve.updateBotMessage, {
            messageId,
            text,
          });
        }
      }
    } catch (error: any) {
      await ctx.runMutation(internal.serve.updateBotMessage, {
        messageId,
        text: "A sandstorm has interrupted the connection to the oracle.",
      });
      throw error;
    }
  },
});

export const getMessages = internalQuery(
  async (ctx, { sessionId }: { sessionId: string }) => {
    return await ctx.db
      .query("messages")
      .withIndex("bySessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
  }
);

export const getChunks = internalQuery(
  async (ctx, { embeddingIds }: { embeddingIds: Id<"embeddings">[] }) => {
    return await map(
      embeddingIds,
      async (embeddingId) =>
        (await ctx.db
          .query("chunks")
          .withIndex("byEmbeddingId", (q) => q.eq("embeddingId", embeddingId))
          .unique())!
    );
  }
);

export const addBotMessage = internalMutation(
  async (ctx, { sessionId }: { sessionId: string }) => {
    return await ctx.db.insert("messages", {
      isViewer: false,
      text: "",
      sessionId,
    });
  }
);

export const updateBotMessage = internalMutation(
  async (
    ctx,
    { messageId, text }: { messageId: Id<"messages">; text: string }
  ) => {
    await ctx.db.patch(messageId, { text });
  }
);
