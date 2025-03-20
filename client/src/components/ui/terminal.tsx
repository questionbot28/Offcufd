import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TerminalSquare } from 'lucide-react';

interface TerminalProps {
  logs: string;
  title?: string;
  maxHeight?: string;
  autoScroll?: boolean;
}

export function Terminal({ 
  logs, 
  title = "Terminal Output", 
  maxHeight = "400px",
  autoScroll = true
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);
  
  // Process logs to colorize them
  const processLogLines = (logText: string) => {
    return logText.split('\n').map((line, index) => {
      // Success messages (usually contain 'success', 'completed', etc.)
      if (line.toLowerCase().includes('success') || 
          line.toLowerCase().includes('complete') ||
          line.toLowerCase().includes('installed') ||
          line.toLowerCase().includes('connected')) {
        return (
          <div key={index} className="text-green-500">
            {line}
          </div>
        );
      }
      
      // Error messages
      else if (line.toLowerCase().includes('error') || 
               line.toLowerCase().includes('fail') ||
               line.toLowerCase().includes('exception')) {
        return (
          <div key={index} className="text-red-500">
            {line}
          </div>
        );
      }
      
      // Warning messages
      else if (line.toLowerCase().includes('warn') || 
               line.toLowerCase().includes('deprecated')) {
        return (
          <div key={index} className="text-amber-500">
            {line}
          </div>
        );
      }
      
      // Normal log line
      return (
        <div key={index} className="text-cyan-200">
          {line}
        </div>
      );
    });
  };
  
  return (
    <Card className="w-full">
      <CardHeader className="bg-slate-900 text-white rounded-t-lg py-2 px-4">
        <div className="flex items-center space-x-2">
          <TerminalSquare size={18} />
          <CardTitle className="text-sm font-mono">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div 
          ref={terminalRef}
          className="font-mono text-xs p-4 bg-slate-950 text-white overflow-y-auto rounded-b-lg"
          style={{ maxHeight, minHeight: "200px" }}
        >
          {logs ? (
            processLogLines(logs)
          ) : (
            <div className="text-slate-500 italic">No output available</div>
          )}
          <div className="text-cyan-200 animate-pulse">_</div>
        </div>
      </CardContent>
    </Card>
  );
}
