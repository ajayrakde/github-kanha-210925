import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { successful: { uploadURL: string; name: string }[] }) => void;
  buttonClassName?: string;
  children: ReactNode;
}

interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  uploadURL?: string;
  error?: string;
}

/**
 * A file upload component that allows drag-and-drop or click-to-upload functionality.
 * Supports multiple files with progress tracking and preview.
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 5242880,
  onGetUploadParameters,
  onComplete,
  buttonClassName = "",
  children,
}: ObjectUploaderProps) {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: FileUpload[] = [];
    const totalFiles = files.length + selectedFiles.length;
    
    if (totalFiles > maxNumberOfFiles) {
      alert(`Maximum ${maxNumberOfFiles} files allowed`);
      return;
    }

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image file`);
        continue;
      }
      
      if (file.size > maxFileSize) {
        alert(`${file.name} is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`);
        continue;
      }

      newFiles.push({
        file,
        progress: 0,
        status: 'pending'
      });
    }

    setFiles(prev => [...prev, ...newFiles]);
    uploadFiles(newFiles);
  };

  const uploadFiles = async (filesToUpload: FileUpload[]) => {
    const uploadPromises = filesToUpload.map(async (fileUpload) => {
      try {
        setFiles(prev => prev.map((f) => 
          f === fileUpload ? { ...f, status: 'uploading' } : f
        ));

        const uploadParams = await onGetUploadParameters();
        
        const response = await fetch(uploadParams.url, {
          method: uploadParams.method,
          body: fileUpload.file,
          headers: {
            'Content-Type': fileUpload.file.type,
          },
        });

        if (response.ok) {
          setFiles(prev => prev.map((f) => 
            f === fileUpload ? { ...f, status: 'success', progress: 100, uploadURL: uploadParams.url } : f
          ));
          return { uploadURL: uploadParams.url, name: fileUpload.file.name };
        } else {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        setFiles(prev => prev.map((f) => 
          f === fileUpload ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' } : f
        ));
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successful = results.filter((r): r is { uploadURL: string; name: string } => r !== null);
    
    if (successful.length > 0) {
      onComplete?.({ successful });
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileSelect(e.target.files)}
        multiple={maxNumberOfFiles > 1}
        accept="image/*"
        className="hidden"
      />
      
      <div
        className={`${buttonClassName} cursor-pointer transition-colors ${
          isDragOver ? 'border-blue-500 bg-blue-50' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="button-upload-images"
      >
        {children}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">
            Files ({files.length}/{maxNumberOfFiles}):
          </div>
          {files.map((fileUpload, index) => (
            <div key={index} className="flex items-center space-x-2 p-2 border rounded">
              <div className="flex-1">
                <div className="text-sm font-medium">{fileUpload.file.name}</div>
                <div className="text-xs text-gray-500">
                  {(fileUpload.file.size / 1024 / 1024).toFixed(2)} MB
                </div>
                {fileUpload.status === 'uploading' && (
                  <Progress value={fileUpload.progress} className="mt-1" />
                )}
                {fileUpload.status === 'error' && (
                  <div className="text-red-600 text-xs">{fileUpload.error}</div>
                )}
                {fileUpload.status === 'success' && (
                  <div className="text-green-600 text-xs">✓ Uploaded successfully</div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeFile(index)}
                className="p-1 h-6 w-6"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}