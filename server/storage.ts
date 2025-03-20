import { users, type User, type InsertUser, botDeployments, type BotDeployment, type InsertBotDeployment, type UpdateBotDeployment } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Bot deployment methods
  getBotDeployment(id: number): Promise<BotDeployment | undefined>;
  getAllBotDeployments(): Promise<BotDeployment[]>;
  createBotDeployment(deployment: InsertBotDeployment): Promise<BotDeployment>;
  updateBotDeployment(id: number, update: UpdateBotDeployment): Promise<BotDeployment>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private botDeployments: Map<number, BotDeployment>;
  currentUserId: number;
  currentBotDeploymentId: number;

  constructor() {
    this.users = new Map();
    this.botDeployments = new Map();
    this.currentUserId = 1;
    this.currentBotDeploymentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getBotDeployment(id: number): Promise<BotDeployment | undefined> {
    return this.botDeployments.get(id);
  }

  async getAllBotDeployments(): Promise<BotDeployment[]> {
    return Array.from(this.botDeployments.values()).sort((a, b) => {
      // Sort by createdAt descending (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async createBotDeployment(deployment: InsertBotDeployment): Promise<BotDeployment> {
    const id = this.currentBotDeploymentId++;
    const now = new Date();
    const botDeployment: BotDeployment = {
      ...deployment,
      id,
      createdAt: now,
      updatedAt: now,
      pid: null,
    };
    this.botDeployments.set(id, botDeployment);
    return botDeployment;
  }

  async updateBotDeployment(id: number, update: UpdateBotDeployment): Promise<BotDeployment> {
    const deployment = await this.getBotDeployment(id);
    
    if (!deployment) {
      throw new Error(`Bot deployment with id ${id} not found`);
    }
    
    const updatedDeployment: BotDeployment = {
      ...deployment,
      ...update,
      updatedAt: new Date(),
    };
    
    this.botDeployments.set(id, updatedDeployment);
    return updatedDeployment;
  }
}

export const storage = new MemStorage();
