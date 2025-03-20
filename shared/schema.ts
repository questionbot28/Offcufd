import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define the discord bot schema
export const botDeployments = pgTable("bot_deployments", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("pending"),
  logs: text("logs").notNull().default(""),
  mainFile: text("main_file"),
  error: text("error"),
  pid: integer("pid"),
  isRunning: boolean("is_running").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  metadata: jsonb("metadata")
});

export const insertBotDeploymentSchema = createInsertSchema(botDeployments).pick({
  fileName: true,
  status: true,
  logs: true,
  mainFile: true,
  error: true,
  isRunning: true,
  metadata: true
});

export const updateBotDeploymentSchema = createInsertSchema(botDeployments).pick({
  status: true,
  logs: true,
  mainFile: true,
  error: true,
  pid: true,
  isRunning: true,
  metadata: true
}).partial();

export type InsertBotDeployment = z.infer<typeof insertBotDeploymentSchema>;
export type UpdateBotDeployment = z.infer<typeof updateBotDeploymentSchema>;
export type BotDeployment = typeof botDeployments.$inferSelect;
