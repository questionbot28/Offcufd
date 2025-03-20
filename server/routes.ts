import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import multer from "multer";
import { deployBot, stopBot } from "./bot-manager";
import { insertBotDeploymentSchema } from "@shared/schema";

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(os.tmpdir(), "bot-uploads");
        await fs.promises.mkdir(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
      } catch (error) {
        cb(error as any, "");
      }
    },
    filename: (req, file, cb) => {
      // Generate unique filename
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname);
    },
  }),
  fileFilter: (req, file, cb) => {
    // Accept only ZIP files
    if (file.mimetype === "application/zip" || path.extname(file.originalname).toLowerCase() === ".zip") {
      cb(null, true);
    } else {
      cb(new Error("Only ZIP files are allowed"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoints
  app.get("/api/deployments", async (req: Request, res: Response) => {
    try {
      const deployments = await storage.getAllBotDeployments();
      res.json(deployments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deployments" });
    }
  });

  app.get("/api/deployments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid deployment ID" });
      }

      const deployment = await storage.getBotDeployment(id);
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      res.json(deployment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deployment" });
    }
  });

  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Create deployment record
      const deployment = await storage.createBotDeployment({
        fileName: req.file.originalname,
        status: "pending",
        logs: "Bot deployment initiated...\n",
        isRunning: false,
        metadata: {
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });

      // Start the deployment process asynchronously
      // We don't await this to return the response immediately
      deployBot(req.file.path, deployment.id);

      res.status(201).json(deployment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/deployments/:id/stop", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid deployment ID" });
      }

      const deployment = await storage.getBotDeployment(id);
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      if (!deployment.isRunning) {
        return res.status(400).json({ error: "Bot is not running" });
      }

      const success = await stopBot(id);
      if (success) {
        res.json({ message: "Bot stopped successfully" });
      } else {
        res.status(500).json({ error: "Failed to stop bot" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/deployments/:id/restart", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid deployment ID" });
      }

      const deployment = await storage.getBotDeployment(id);
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      // If bot is running, stop it first
      if (deployment.isRunning) {
        await stopBot(id);
      }

      // Start bot again if we have the main file
      if (!deployment.mainFile) {
        return res.status(400).json({ error: "No main file found for this deployment" });
      }

      // Extract directory from main file path
      const extractPath = path.dirname(path.dirname(deployment.mainFile));
      
      await storage.updateBotDeployment(id, {
        status: "starting",
        logs: deployment.logs + "Restarting bot...\n",
      });

      const botProcess = await deployBot(extractPath, deployment.mainFile, id);
      if (botProcess) {
        res.json({ message: "Bot restarted successfully" });
      } else {
        res.status(500).json({ error: "Failed to restart bot" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
