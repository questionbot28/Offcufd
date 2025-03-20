import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Terminal } from "@/components/ui/terminal";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { BotDeployment } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Upload, UploadCloud, Bot, Play, Square, RefreshCw, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [activeDeploymentId, setActiveDeploymentId] = useState<number | null>(null);
  const { toast } = useToast();

  // Fetch all deployments
  const { data: deployments, isLoading: isLoadingDeployments } = useQuery({
    queryKey: ["/api/deployments"],
  });

  // Fetch active deployment details
  const { data: activeDeployment, isLoading: isLoadingActiveDeployment } = useQuery({
    queryKey: ["/api/deployments", activeDeploymentId],
    enabled: activeDeploymentId !== null,
    refetchInterval: (data) => {
      // Poll every 2 seconds if the bot is being setup or is running
      if (data && ["extracting", "installing", "starting", "running"].includes(data.status)) {
        return 2000;
      }
      return false;
    },
  });

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/deployments/${id}/stop`, {});
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      if (activeDeploymentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/deployments", activeDeploymentId] });
      }
      toast({
        title: "Bot Stopped",
        description: "The Discord bot has been stopped successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Stop Bot",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Restart bot mutation
  const restartBotMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/deployments/${id}/restart`, {});
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      if (activeDeploymentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/deployments", activeDeploymentId] });
      }
      toast({
        title: "Bot Restarted",
        description: "The Discord bot has been restarted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Restart Bot",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Set active deployment when deployments change
  useEffect(() => {
    if (deployments && deployments.length > 0 && !activeDeploymentId) {
      setActiveDeploymentId(deployments[0].id);
    }
  }, [deployments]);

  // Handle file upload success
  const handleUploadSuccess = (deploymentId: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
    setActiveDeploymentId(deploymentId);
  };

  // Determine which step is currently active based on status
  const getCurrentStep = (status: string) => {
    switch (status) {
      case "pending":
        return "extracting";
      case "extracting":
        return "extracting";
      case "installing":
        return "installing";
      case "starting":
        return "starting";
      case "running":
        return "running";
      case "stopped":
        return "running"; // Still on running step, just stopped
      case "error":
        // Determine which step had the error
        if (activeDeployment?.mainFile) {
          return "running";
        } else if (activeDeployment?.logs?.includes("Installing dependencies")) {
          return "installing";
        } else {
          return "extracting";
        }
      default:
        return "extracting";
    }
  };

  // Steps for the progress stepper
  const deploymentSteps = [
    {
      id: "extracting",
      title: "Extracting ZIP File",
      description: "Unpacking your Discord bot files from the ZIP archive.",
    },
    {
      id: "installing",
      title: "Installing Dependencies",
      description: "Installing required npm packages from package.json.",
    },
    {
      id: "starting",
      title: "Locating & Starting Bot",
      description: "Finding the main bot file and starting the Discord bot.",
    },
    {
      id: "running",
      title: "Bot Running",
      description: "Your Discord bot is now running and connected to Discord.",
    },
  ];

  // Function to get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-green-500">Running</Badge>;
      case "stopped":
        return <Badge variant="outline" className="text-gray-500">Stopped</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge className="bg-blue-500">Setting Up</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="w-6 h-6 text-indigo-400" />
            <span className="font-semibold text-lg">Discord Bot Automator</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <section className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-slate-800">
            Automated Discord Bot Deployment
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Upload your Discord bot ZIP file and let our system automatically extract, configure, and run your bot without any manual intervention.
          </p>
        </section>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6">
          {/* Feature Highlights */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <UploadCloud className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Instant Setup</h3>
                <p className="text-slate-600 text-sm">Extract, install dependencies, and run your Discord bot in seconds.</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Zero Configuration</h3>
                <p className="text-slate-600 text-sm">No manual intervention needed. Our system handles everything.</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                  <Info className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Error Handling</h3>
                <p className="text-slate-600 text-sm">Smart recovery from common deployment issues.</p>
              </CardContent>
            </Card>
          </section>

          {/* Upload Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Upload Your Discord Bot</CardTitle>
              <CardDescription>
                Create a ZIP file containing your Discord bot code and upload it below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload onUploadSuccess={handleUploadSuccess} />
            </CardContent>
          </Card>

          {/* Deployments Section */}
          {isLoadingDeployments ? (
            <Card>
              <CardContent className="p-8 flex justify-center">
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading deployments...</span>
                </div>
              </CardContent>
            </Card>
          ) : deployments && deployments.length > 0 ? (
            <Tabs defaultValue="details" className="w-full">
              <div className="flex justify-between items-center mb-4">
                <TabsList>
                  <TabsTrigger value="details">Deployment Details</TabsTrigger>
                  <TabsTrigger value="history">Deployment History</TabsTrigger>
                </TabsList>
                
                {activeDeployment && (
                  <div className="flex space-x-2">
                    {activeDeployment.status === "running" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => stopBotMutation.mutate(activeDeployment.id)}
                        disabled={stopBotMutation.isPending}
                      >
                        {stopBotMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                        Stop Bot
                      </Button>
                    )}
                    
                    {activeDeployment.status === "stopped" && (
                      <Button
                        size="sm"
                        onClick={() => restartBotMutation.mutate(activeDeployment.id)}
                        disabled={restartBotMutation.isPending}
                      >
                        {restartBotMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        Start Bot
                      </Button>
                    )}
                    
                    {activeDeployment.status === "error" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restartBotMutation.mutate(activeDeployment.id)}
                        disabled={restartBotMutation.isPending}
                      >
                        {restartBotMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              <TabsContent value="details">
                {isLoadingActiveDeployment ? (
                  <Card>
                    <CardContent className="p-8 flex justify-center">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Loading deployment details...</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : activeDeployment ? (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle>{activeDeployment.fileName}</CardTitle>
                            <CardDescription>
                              Deployed on {new Date(activeDeployment.createdAt).toLocaleString()}
                            </CardDescription>
                          </div>
                          <div>{getStatusBadge(activeDeployment.status)}</div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ProgressStepper 
                          steps={deploymentSteps}
                          currentStep={getCurrentStep(activeDeployment.status)}
                          status={activeDeployment.status as any}
                          error={activeDeployment.error}
                        />
                      </CardContent>
                    </Card>
                    
                    <Terminal 
                      logs={activeDeployment.logs} 
                      title="Deployment Logs" 
                      maxHeight="400px"
                    />
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-gray-500">
                      <p>No deployment selected</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="history">
                <Card>
                  <CardContent className="p-4">
                    <div className="divide-y">
                      {deployments.map((deployment: BotDeployment) => (
                        <div 
                          key={deployment.id} 
                          className={`py-3 px-2 flex justify-between items-center cursor-pointer hover:bg-slate-50 rounded ${
                            activeDeploymentId === deployment.id ? 'bg-slate-100' : ''
                          }`}
                          onClick={() => setActiveDeploymentId(deployment.id)}
                        >
                          <div className="flex items-center space-x-3">
                            <Upload className="h-5 w-5 text-slate-400" />
                            <div>
                              <p className="font-medium text-slate-900">{deployment.fileName}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(deployment.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div>{getStatusBadge(deployment.status)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <Upload className="h-12 w-12 text-slate-300" />
                  <div>
                    <h3 className="text-lg font-medium text-slate-900">No deployments yet</h3>
                    <p className="text-slate-500 mt-1">
                      Upload your first Discord bot ZIP file to get started
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-slate-900 text-white mt-12 py-6">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-slate-400 text-sm">
              &copy; {new Date().getFullYear()} Discord Bot Automator. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
