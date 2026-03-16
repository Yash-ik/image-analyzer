/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, 
  Image as ImageIcon, X, AlertCircle, ChevronRight, 
  Search, History, Palette, Info, Download, Maximize2,
  Zap, Eye, Fingerprint, Cpu, Clock, Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeImage, AnalysisResult, ArtifactDetail } from './services/geminiService';

interface HistoryItem {
  id: string;
  image: string;
  result: AnalysisResult;
  timestamp: number;
}

const AuthenticityGauge = ({ score }: { score: number }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={radius}
          className="stroke-white/5 fill-none"
          strokeWidth="8"
        />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          className="stroke-accent fill-none"
          strokeWidth="8"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-2xl font-bold font-mono"
        >
          {score}%
        </motion.span>
        <span className="text-[8px] uppercase tracking-widest opacity-50">Confidence</span>
      </div>
    </div>
  );
};

const ArtifactOverlay = ({ 
  artifact, 
  imageDims 
}: { 
  artifact: ArtifactDetail; 
  imageDims: { width: number; height: number; left: number; top: number };
  key?: React.Key;
}) => {
  const [ymin, xmin, ymax, xmax] = artifact.box_2d;
  
  // Convert normalized 0-1000 to pixels relative to the image
  const top = (ymin / 1000) * imageDims.height + imageDims.top;
  const left = (xmin / 1000) * imageDims.width + imageDims.left;
  const width = Math.max(20, ((xmax - xmin) / 1000) * imageDims.width);
  const height = Math.max(20, ((ymax - ymin) / 1000) * imageDims.height);

  if (imageDims.width === 0 || imageDims.height === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute group/artifact z-30"
      style={{ top, left, width, height }}
    >
      <div className="absolute inset-0 border-2 border-rose-500/50 bg-rose-500/10 rounded-sm backdrop-blur-[1px] group-hover/artifact:border-rose-500 group-hover/artifact:bg-rose-500/20 transition-all duration-300" />
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-bg/95 backdrop-blur-md border border-rose-500/30 rounded-lg shadow-xl opacity-0 group-hover/artifact:opacity-100 transition-opacity pointer-events-none z-50">
        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1 flex items-center gap-1">
          <Target className="w-3 h-3" />
          {artifact.label}
        </p>
        <p className="text-[10px] text-text-secondary leading-tight">
          {artifact.description}
        </p>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-bg/95" />
      </div>
    </motion.div>
  );
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'none' | 'invert' | 'contrast' | 'grayscale' | 'edges'>('none');
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('auth_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('auth_history', JSON.stringify(history));
  }, [history]);

  const updateImageDims = useCallback(() => {
    if (imageRef.current) {
      const img = imageRef.current;
      const container = img.parentElement;
      if (container && img.naturalWidth > 0) {
        const containerRect = container.getBoundingClientRect();
        
        const contentWidth = img.naturalWidth;
        const contentHeight = img.naturalHeight;
        const contentAspect = contentWidth / contentHeight;
        
        const availableWidth = containerRect.width;
        // Ensure we have a valid width before calculating
        if (availableWidth === 0) return;

        const availableHeight = Math.min(600, window.innerHeight * 0.8);
        const containerAspect = availableWidth / availableHeight;
        
        let renderedWidth, renderedHeight;
        if (contentAspect > containerAspect) {
          renderedWidth = availableWidth;
          renderedHeight = availableWidth / contentAspect;
        } else {
          renderedHeight = availableHeight;
          renderedWidth = availableHeight * contentAspect;
        }
        
        setImageDims({
          width: renderedWidth,
          height: renderedHeight,
          left: (availableWidth - renderedWidth) / 2,
          top: (availableHeight - renderedHeight) / 2
        });
      }
    }
  }, []);

  useEffect(() => {
    // Initial update with a small delay to ensure layout is ready
    const timer = setTimeout(updateImageDims, 100);
    return () => clearTimeout(timer);
  }, [image, updateImageDims]);

  useEffect(() => {
    if (!imageRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      updateImageDims();
    });
    
    const container = imageRef.current.parentElement;
    if (container) {
      resizeObserver.observe(container);
    }
    
    return () => resizeObserver.disconnect();
  }, [updateImageDims, image]);

  const getFilterStyle = () => {
    switch (activeFilter) {
      case 'invert': return 'invert(1)';
      case 'contrast': return 'contrast(2) brightness(1.2)';
      case 'grayscale': return 'grayscale(1)';
      case 'edges': return 'grayscale(1) contrast(5) invert(1)';
      default: return 'none';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }
    setFile(file);
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleAnalyze = async () => {
    if (!image || !file) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const analysis = await analyzeImage(image, file.type);
      setResult(analysis);
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        image,
        result: analysis,
        timestamp: Date.now(),
      };
      setHistory(prev => {
        const filtered = prev.filter(item => item.image !== image);
        return [newItem, ...filtered].slice(0, 10);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setImage(item.image);
    setResult(item.result);
    setFile(null);
    setShowHistory(false);
    setActiveFilter('none');
    setShowArtifacts(true);
  };

  const [copied, setCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const copyReasoning = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.reasoning);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('auth_history');
    setShowClearConfirm(false);
  };

  const reset = () => {
    setImage(null);
    setFile(null);
    setResult(null);
    setError(null);
    setActiveFilter('none');
    setShowArtifacts(true);
  };

  const downloadReport = () => {
    if (!result) return;
    const report = `
AI IMAGE AUTHENTICATION REPORT
==============================
Generated: ${new Date().toLocaleString()}

VERDICT: ${result.isAI.toUpperCase()}
CONFIDENCE: ${result.confidence}%

DESCRIPTION:
${result.description}

REASONING:
${result.reasoning}

TECHNICAL METADATA:
- Style: ${result.technicalMetadata.style || 'N/A'}
- Lighting: ${result.technicalMetadata.lighting || 'N/A'}
- Resolution: ${result.technicalMetadata.estimatedResolution || 'N/A'}
- Composition: ${result.technicalMetadata.composition || 'N/A'}

DETECTED ARTIFACTS:
${result.artifacts.map(a => `- ${a}`).join('\n')}

COLOR PALETTE:
${result.colorPalette.map(c => `- ${c.label}: ${c.hex}`).join('\n')}

------------------------------
Verified by Neural Engine v2.0
`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-report-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-bg text-text-primary selection:bg-accent/30">
      <div className="grid-animate" />
      
      {/* Sidebar: History */}
      <nav className="relative z-20 border-b border-border bg-bg/80 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-accent p-2 rounded-lg shadow-lg shadow-accent/20">
            <Fingerprint className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Image Authenticator</h1>
            <p className="text-[10px] text-text-secondary font-mono uppercase tracking-widest">v2.0 Professional</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2.5 rounded-xl border border-border hover:bg-card transition-colors"
            title="History"
          >
            <History className="w-5 h-5 text-text-secondary" />
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">System Ready</span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left: Upload & Preview */}
        <div className="lg:col-span-7 space-y-6">
          {!image ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group relative glass-panel p-20 flex flex-col items-center justify-center gap-6 cursor-pointer hover:bg-card/80 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-accent" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Analyze an Image</h2>
                <p className="text-sm text-text-secondary">Drag and drop or click to upload</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div 
                className="relative glass-panel group shadow-2xl min-h-[300px] flex items-center justify-center bg-black/20"
                style={{ height: imageDims.height > 0 ? 'auto' : '600px' }}
              >
                <img 
                  ref={imageRef}
                  src={image} 
                  alt="Preview" 
                  onLoad={updateImageDims}
                  className="w-full h-auto max-h-[600px] object-contain transition-all duration-500 relative z-10" 
                  style={{ filter: getFilterStyle() }}
                />

                {/* Artifact Highlights */}
                {showArtifacts && imageDims.width > 0 && result?.artifactDetails && result.artifactDetails.map((artifact, i) => (
                  <ArtifactOverlay 
                    key={`${i}-${imageDims.width}`} 
                    artifact={artifact} 
                    imageDims={imageDims} 
                  />
                ))}
                
                {isAnalyzing && <div className="absolute inset-0 pointer-events-none scan-line" />}

                <button
                  onClick={reset}
                  className="absolute top-4 right-4 p-2 bg-bg/80 backdrop-blur-md border border-border rounded-xl hover:bg-bg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-40">
                  <div className="flex gap-2">
                    <div className="bg-bg/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-lg text-[10px] font-mono text-text-secondary">
                      {file?.name}
                    </div>
                    {result?.artifactDetails && result.artifactDetails.length > 0 && (
                      <button
                        onClick={() => setShowArtifacts(!showArtifacts)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                          showArtifacts 
                            ? 'bg-rose-500/20 border-rose-500/50 text-rose-500' 
                            : 'bg-bg/80 border-border text-text-secondary hover:bg-bg/100'
                        }`}
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {showArtifacts ? 'Hide Artifacts' : `Show Artifacts (${result.artifactDetails.length})`}
                        </span>
                      </button>
                    )}
                  </div>
                  {result && (
                    <div className="flex gap-1 bg-bg/80 backdrop-blur-md border border-border p-1 rounded-lg w-fit">
                      {[
                        { id: 'none', icon: Eye, label: 'Normal' },
                        { id: 'invert', icon: Zap, label: 'Invert' },
                        { id: 'contrast', icon: Maximize2, label: 'Contrast' },
                        { id: 'grayscale', icon: Palette, label: 'Mono' },
                        { id: 'edges', icon: Fingerprint, label: 'Edges' }
                      ].map((tool) => (
                        <button
                          key={tool.id}
                          onClick={() => setActiveFilter(tool.id as any)}
                          className={`p-1.5 rounded-md transition-all group relative ${
                            activeFilter === tool.id ? 'bg-accent text-white' : 'hover:bg-white/10 text-text-secondary'
                          }`}
                          title={tool.label}
                        >
                          <tool.icon className="w-3.5 h-3.5" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-[8px] text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                            {tool.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                {!result && !isAnalyzing && (
                  <button
                    onClick={handleAnalyze}
                    className="flex-1 py-4 bg-accent hover:bg-accent-hover text-white rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
                  >
                    Start Analysis <ChevronRight className="w-5 h-5" />
                  </button>
                )}
                {result && (
                  <button
                    onClick={downloadReport}
                    className="px-8 py-4 bg-card border border-border hover:bg-border/50 text-text-primary rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" /> Export Data
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-500">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Analysis Error</p>
                <p className="opacity-80">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-5 space-y-6">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass-panel p-10 space-y-8"
              >
                <div className="flex justify-center">
                  <div className="relative w-32 h-32">
                    <Loader2 className="w-full h-full animate-spin text-accent/10" strokeWidth={1} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-16 h-16 text-accent" viewBox="0 0 100 100">
                        <circle cx="20" cy="50" r="4" fill="currentColor">
                          <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="50" cy="20" r="4" fill="currentColor">
                          <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="50" cy="80" r="4" fill="currentColor">
                          <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.4s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="80" cy="50" r="4" fill="currentColor">
                          <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.6s" repeatCount="indefinite" />
                        </circle>
                        <path d="M24 50 L46 24 M24 50 L46 76 M76 50 L54 24 M76 50 L54 76 M50 24 L50 76" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.2" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="text-center space-y-3">
                  <h2 className="text-xl font-semibold">Analyzing Content</h2>
                  <div className="font-mono text-[10px] text-text-secondary space-y-1.5">
                    <p className="animate-pulse">» DECODING NEURAL PATTERNS</p>
                    <p className="animate-pulse delay-75">» EXTRACTING METADATA</p>
                    <p className="animate-pulse delay-150">» IDENTIFYING ARTIFACTS</p>
                  </div>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Clear Authenticity Verdict */}
                <div className={`glass-panel p-6 sm:p-8 border-l-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative overflow-hidden ${
                  result.isAI === 'Unlikely' ? 'border-emerald-500 bg-emerald-500/5' : 
                  result.isAI === 'Inconclusive' ? 'border-amber-500 bg-amber-500/5' : 'border-rose-500 bg-rose-500/5'
                }`}>
                  <div className={`p-4 rounded-2xl shrink-0 ${
                    result.isAI === 'Unlikely' ? 'bg-emerald-500/20 text-emerald-500' : 
                    result.isAI === 'Inconclusive' ? 'bg-amber-500/20 text-amber-500' : 'bg-rose-500/20 text-rose-500'
                  }`}>
                    {result.isAI === 'Unlikely' ? <ShieldCheck className="w-10 h-10" /> : 
                     result.isAI === 'Inconclusive' ? <ShieldQuestion className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
                  </div>
                  <div className="space-y-1 text-center sm:text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Final Verdict</p>
                    <h2 className={`text-2xl sm:text-3xl font-black tracking-tighter uppercase ${
                      result.isAI === 'Unlikely' ? 'text-emerald-500' : 
                      result.isAI === 'Inconclusive' ? 'text-amber-500' : 'text-rose-500'
                    }`}>
                      {result.isAI === 'Unlikely' ? 'Authentic' : 
                       result.isAI === 'Inconclusive' ? 'Inconclusive' : 'AI Generated'}
                    </h2>
                    <p className="text-sm font-medium text-text-secondary leading-relaxed">
                      {result.description}
                    </p>
                  </div>
                  
                  {/* Background decoration */}
                  <div className={`absolute -right-4 -bottom-4 opacity-10 ${
                    result.isAI === 'Unlikely' ? 'text-emerald-500' : 
                    result.isAI === 'Inconclusive' ? 'text-amber-500' : 'text-rose-500'
                  }`}>
                    {result.isAI === 'Unlikely' ? <ShieldCheck className="w-32 h-32" /> : 
                     result.isAI === 'Inconclusive' ? <ShieldQuestion className="w-32 h-32" /> : <ShieldAlert className="w-32 h-32" />}
                  </div>
                </div>

                {/* Authenticity Score */}
                <div className="glass-panel p-6 flex items-center justify-between overflow-hidden relative">
                  <div className="space-y-1 relative z-10">
                    <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Authenticity Score</h3>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-bold ${
                        result.isAI === 'Unlikely' ? 'text-emerald-500' : 
                        result.isAI === 'Inconclusive' ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                        {result.confidence}%
                      </span>
                      <span className="text-xs text-text-secondary font-mono">CONFIDENCE</span>
                    </div>
                    <p className="text-xs text-text-secondary max-w-[200px]">
                      {result.isAI === 'Unlikely' ? 'High probability of authentic origin.' : 
                       result.isAI === 'Inconclusive' ? 'Potential AI-assisted modifications detected.' : 
                       'Significant indicators of synthetic generation.'}
                    </p>
                  </div>
                  <div className="relative z-10">
                    <AuthenticityGauge score={result.confidence} />
                  </div>
                  
                  {/* Decorative background element */}
                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-accent/5 rounded-full blur-3xl" />
                </div>

                <div className="glass-panel p-6 space-y-4 relative overflow-hidden group/reasoning border-l-4 border-accent/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-text-secondary">
                      <Search className="w-4 h-4" />
                      <h3 className="text-[10px] font-bold uppercase tracking-widest">Forensic Report</h3>
                    </div>
                    <button 
                      onClick={copyReasoning}
                      className="p-2 bg-bg border border-border rounded-lg opacity-0 group-hover/reasoning:opacity-100 transition-opacity hover:bg-card z-20"
                      title="Copy Reasoning"
                    >
                      {copied ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Download className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-2 top-0 bottom-0 w-1 bg-accent/20 rounded-full" />
                    <p className="text-sm leading-relaxed text-text-primary font-medium pl-4 italic">
                      "{result.reasoning}"
                    </p>
                  </div>
                  <div className="pt-4 flex items-center gap-4 border-t border-border/50">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[9px] font-mono text-text-secondary uppercase">Deep Scan Active</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <span className="text-[9px] font-mono text-text-secondary uppercase">Model: Gemini 3.1 Pro</span>
                    </div>
                  </div>
                </div>
                
                {/* Technical Specs */}
                <div className="glass-panel p-6 space-y-6">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Info className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Technical Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/50">
                    {[
                      { label: 'Style', value: result.technicalMetadata.style },
                      { label: 'Lighting', value: result.technicalMetadata.lighting },
                      { label: 'Resolution', value: result.technicalMetadata.estimatedResolution },
                      { label: 'Composition', value: result.technicalMetadata.composition }
                    ].map((spec, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-bg/40 p-4 space-y-1 hover:bg-bg/60 transition-colors"
                      >
                        <p className="text-[9px] text-text-secondary font-bold uppercase tracking-tighter opacity-70">{spec.label}</p>
                        <p className="text-xs font-medium text-text-primary truncate">{spec.value || 'N/A'}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Color Palette */}
                <div className="glass-panel p-6 space-y-4">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Palette className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Color Palette</h3>
                  </div>
                  <div className="flex gap-2 h-12">
                    {result.colorPalette.map((color, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex-1 rounded-lg border border-border/50 group relative cursor-help"
                        style={{ backgroundColor: color.hex }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg border border-border rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                          {color.label} ({color.hex})
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Artifacts */}
                <div className="glass-panel p-6 space-y-4">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Eye className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Detected Artifacts</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.artifacts.map((art, i) => (
                      <span key={i} className="px-2.5 py-1 bg-card border border-border rounded-lg text-[10px] text-text-secondary font-medium">
                        {art}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="glass-panel p-12 flex flex-col items-center justify-center text-center opacity-40 border-dashed">
                <Search className="w-12 h-12 mb-4 text-text-secondary" />
                <h3 className="text-lg font-semibold">Awaiting Input</h3>
                <p className="text-xs text-text-secondary mt-1">Upload an image to start neural scan</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-bg border-l border-border z-50 p-8 overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-accent" />
                  <h2 className="text-xl font-bold">Analysis History</h2>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <div className="relative">
                      <button 
                        onClick={() => setShowClearConfirm(!showClearConfirm)}
                        className={`p-2 rounded-xl transition-colors ${showClearConfirm ? 'bg-red-500 text-white' : 'text-red-500 hover:bg-red-500/10'}`}
                        title="Clear All"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      {showClearConfirm && (
                        <div className="absolute right-0 top-full mt-2 w-48 glass-panel p-3 shadow-2xl z-[60] animate-in fade-in slide-in-from-top-2">
                          <p className="text-[10px] font-bold mb-2 uppercase tracking-wider">Confirm Wipe?</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={clearHistory}
                              className="flex-1 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600"
                            >
                              YES
                            </button>
                            <button 
                              onClick={() => setShowClearConfirm(false)}
                              className="flex-1 py-1.5 bg-card text-text-primary text-[10px] font-bold rounded-lg hover:bg-border"
                            >
                              NO
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-card rounded-xl transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="text-center py-20 opacity-40">
                    <History className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-sm italic">No recent scans found</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => loadHistoryItem(item)}
                      className="glass-panel p-4 flex gap-4 cursor-pointer hover:bg-card hover:border-accent/30 transition-all group"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
                        <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${
                            item.result.isAI === 'Likely' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 
                            item.result.isAI === 'Unlikely' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                            'bg-blue-500/10 border-blue-500/20 text-blue-500'
                          }`}>
                            {item.result.isAI.toUpperCase()}
                          </span>
                          <span className="text-[8px] text-text-secondary font-mono">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-secondary line-clamp-2 italic leading-relaxed">"{item.result.reasoning}"</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Status Footer */}
      <footer className="fixed bottom-0 left-0 w-full bg-bg/80 backdrop-blur-md border-t border-border px-8 py-2.5 flex justify-between items-center z-30 text-[9px] font-mono text-text-secondary uppercase tracking-[0.2em]">
        <div className="flex gap-8">
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-accent rounded-full" /> Secure Local Tunnel</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-accent rounded-full" /> AES-256 Encryption</span>
        </div>
        <div className="flex gap-8">
          <span>Latency: 24ms</span>
          <span>Buffer: Optimized</span>
        </div>
      </footer>
    </div>
  );
}
